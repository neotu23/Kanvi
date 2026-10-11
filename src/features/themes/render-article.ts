import { randomUUID } from 'node:crypto';
import { aiConfig, completeJson, type AiOptions } from '../ai/client';
import type { OutputArtifact } from '../output/contracts';
import { ReferenceError } from '../references/contracts';
import { checkerConfig } from '../validation/config';
import type { CheckReport } from '../validation/normalize-report';
import { parseFailures, parseThemeArticle } from './article';
import { loadTheme, themesRoot, type ThemePackage } from './library';
import { renderPrompt } from './prompt';
import { applyArticleLayout } from './layout';
import { ThemeRenderRepository, sha256, themeSnapshotHash, type RenderDetail, type RenderRecord, type ThemeSnapshot } from './repository';
import { artifactFromHtml, verifyArticle } from './verify-article';

export const MAX_OUTPUT_BYTES = 512 * 1024;
/** 模型输出里的这些结构一律拒绝，不静默删除后声称成功。 */
const FORBIDDEN_OUTPUT: Array<[RegExp, string]> = [
  [/<script\b/i, '<script> 标签'],
  [/<style\b|<link\b|<meta\b|<!doctype\b|<html\b|<head\b|<body\b/i, '完整文档外壳或样式标签'],
  [/<(?:iframe|object|embed|form|button|input|select|textarea|video|audio|canvas|svg)\b/i, '嵌入或表单标签'],
  [/\son[a-z]+\s*=/i, '事件属性'],
  [/(?:javascript|vbscript)\s*:/i, '可执行 URL'],
  [/data\s*:\s*text\s*\/\s*html/i, '可执行 URL'],
];

export interface RenderArticleOptions {
  ai?: AiOptions; projectRoot?: string; signal?: AbortSignal; repository?: ThemeRenderRepository;
  themesRootPath?: string;
  checker?: (artifact: OutputArtifact, signal?: AbortSignal) => Promise<CheckReport>;
}
export interface ModelOutput { html: string; notes: string[] }

export function parseModelOutput(raw: unknown): ModelOutput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['html', 'notes'].includes(key))) {
    throw new ReferenceError('invalid-model-output', '模型返回的正文结构不符合要求，未保存。', 502);
  }
  const value = raw as { html?: unknown; notes?: unknown };
  if (typeof value.html !== 'string' || !value.html.trim() || Buffer.byteLength(value.html, 'utf8') > MAX_OUTPUT_BYTES) {
    throw new ReferenceError('invalid-model-output', '模型返回的正文为空或过大，未保存。', 502);
  }
  for (const [pattern, label] of FORBIDDEN_OUTPUT) {
    if (pattern.test(value.html)) throw new ReferenceError('unsafe-output', `模型返回的正文包含${label}，已拒绝保存。`, 502);
  }
  let notes: string[] = [];
  if (value.notes !== undefined) {
    if (!Array.isArray(value.notes) || value.notes.length > 20 || !value.notes.every(note => typeof note === 'string' && note.trim() && note.length <= 200)) {
      throw new ReferenceError('invalid-model-output', '模型返回的说明字段无效，未保存。', 502);
    }
    notes = value.notes as string[];
  }
  return { html: value.html, notes };
}
function snapshotOf(theme: ThemePackage, themeMarkdown: string): ThemeSnapshot {
  const snapshot: ThemeSnapshot = {
    id: theme.theme.id, name: theme.theme.name, themeJson: theme.theme, themeMarkdown, origin: theme.origin,
    ...('upstream' in theme.source && theme.source.upstream ? { sourceCommit: theme.source.upstream.commit } : {}),
    definitionHash: '',
  };
  snapshot.definitionHash = themeSnapshotHash(snapshot);
  return snapshot;
}

export async function renderArticle(markdown: string, themeId: string, options: RenderArticleOptions = {}): Promise<RenderDetail> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const repository = options.repository ?? new ThemeRenderRepository();
  const parsed = parseThemeArticle(markdown);
  const failures = parseFailures(parsed);
  if (failures.length) throw new ReferenceError('article-diagnostics', failures.slice(0, 5).map(item => item.message).join(' '), 422);
  const theme = await loadTheme(themeId, options.themesRootPath ?? themesRoot());
  const prompt = await renderPrompt(parsed, markdown, theme, projectRoot);
  const signal = options.signal ?? options.ai?.signal;
  // 一次读取生效配置，保证请求所用的模型与历史记录里记下的模型一致。
  const config = options.ai?.config ?? await aiConfig();
  const raw = await completeJson(prompt.input, { ...options.ai, config, systemPrompt: prompt.system, maxTokens: 8000, signal });
  const { html, notes } = parseModelOutput(raw);
  const artifact = artifactFromHtml(applyArticleLayout(html));
  const verification = await verifyArticle(parsed, artifact, { signal, projectRoot, checker: options.checker });
  const record: RenderRecord = {
    schemaVersion: 1, id: randomUUID(), createdAt: new Date().toISOString(), markdown, parsed,
    theme: snapshotOf(theme, prompt.themeMarkdown),
    skill: { commit: prompt.skillCommit, promptVersion: prompt.promptVersion },
    model: config.model,
    articleHash: prompt.articleHash, themeHash: prompt.themeHash, rawOutputHash: sha256(JSON.stringify(raw)), notes,
    artifact,
    validate: {
      ok: verification.validate.ok, errorCount: verification.validate.errorCount, warnCount: verification.validate.warnCount,
      issues: verification.validate.issues, raw: verification.validate.raw,
      ...(verification.validate.error ? { error: verification.validate.error } : {}),
    },
    fidelity: verification.fidelity,
  };
  const created = await repository.create(record);
  await repository.finish(created, verification.check);
  return await repository.get(created.id, checkerConfig().commit);
}
