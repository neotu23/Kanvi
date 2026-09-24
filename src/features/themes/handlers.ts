import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aiConfigurationStatus } from '../ai/client';
import { ReferenceError } from '../references/contracts';
import { errorResponse, json, readBounded } from '../shared/io';
import { checkerConfig } from '../validation/config';
import { isLocalRequest } from '../validation/local-request';
import { confirmDraft, discardDraft, listDrafts, type DraftEntry } from './confirm';
import { createThemeDraft, sanitizePreview } from './factory';
import { listThemes, themesRoot, type ThemePackage } from './library';
import { pythonVersion, skillRoot } from './python';
import { removeTheme } from './remove';
import { renderArticle } from './render-article';
import { ThemeRenderRepository, type RenderDetail } from './repository';

export interface ThemeSummary {
  id: string; name: string; description: string; origin: string; hasNote: boolean;
  tags: ThemePackage['theme']['tags']; structure: Record<string, string>; signatureCount: number; bodySize: string;
}
export interface ThemeOverview {
  themes: Array<ThemeSummary | { id: string; error: string }>;
  drafts: DraftEntry[];
  ai: { configured: boolean; model: string };
  python: { available: boolean; version: string | null };
  skill: { installed: boolean };
  renders: Array<{ id: string; createdAt: string; title: string; themeId: string; themeName: string; status: string }>;
}
const denied = () => json({ error: '仅接受本机页面的请求。' }, 403);
const MAX_BODY_BYTES = (256 * 1024) * 6 + 8192;

async function body(request: Request, keys: string[]): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type') ?? '')) throw new ReferenceError('content-type', '请使用 JSON 请求。', 415);
  const text = await readBounded(request.body, MAX_BODY_BYTES, AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]));
  let value;
  try { value = JSON.parse(text); } catch { throw new ReferenceError('invalid-input', '请求 JSON 无效。', 400); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) {
    throw new ReferenceError('invalid-input', '请求字段不符合要求。', 400);
  }
  return value as Record<string, unknown>;
}
function summarize(pkg: ThemePackage): ThemeSummary {
  return {
    id: pkg.id, name: pkg.theme.name, description: pkg.theme.description, origin: pkg.origin, hasNote: pkg.hasNote,
    tags: pkg.theme.tags, structure: { ...pkg.theme.structure_model }, signatureCount: pkg.theme.signature_slots.length,
    bodySize: `${pkg.theme.tokens.type.body_size} / ${pkg.theme.tokens.type.body_line_height}`,
  };
}

export interface ThemeHandlerOptions {
  themesRoot?: string; draftsRoot?: string; projectRoot?: string;
  repository?: ThemeRenderRepository;
  render?: typeof renderArticle;
}
export function createThemeHandlers(options: ThemeHandlerOptions = {}) {
  const themes = options.themesRoot ?? themesRoot();
  const drafts = options.draftsRoot ?? (process.env.KANVI_DRAFTS_ROOT ?? 'data/theme-drafts');
  const projectRoot = options.projectRoot ?? process.cwd();
  const repository = options.repository ?? new ThemeRenderRepository();
  const render = options.render ?? renderArticle;
  let rendering = false, drafting = false, confirming = false;
  const signalFor = (request: Request, timeoutMs: number) => AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);

  async function overview(): Promise<ThemeOverview> {
    const entries = await listThemes(themes);
    const listed = entries.map(entry => (entry.ok && entry.theme ? summarize(entry.theme) : { id: entry.id, error: entry.error ?? '主题包损坏。' }));
    const version = await pythonVersion({ projectRoot });
    let skill = { installed: true };
    try { skillRoot(projectRoot); } catch { skill = { installed: false }; }
    let renders: ThemeOverview['renders'] = [];
    try { renders = (await repository.list(checkerConfig().commit)).renders; } catch { renders = []; }
    return { themes: listed, drafts: await listDrafts(drafts), ai: aiConfigurationStatus(), python: { available: Boolean(version), version }, skill, renders };
  }

  return {
    async list(request: Request) {
      if (!isLocalRequest(request)) return denied();
      try { return json(await overview()); } catch (error) { return errorResponse(error); }
    },
    async preview(request: Request, id: string) {
      if (!isLocalRequest(request)) return denied();
      try {
        const entries = await listThemes(themes);
        const entry = entries.find(item => item.id === id);
        if (!entry?.ok || !entry.theme) throw new ReferenceError('not-found', '没有找到这个主题包。', 404);
        const html = await readFile(join(entry.theme.path, 'preview.html'), 'utf8');
        return json({ id, html: sanitizePreview(html) });
      } catch (error) { return errorResponse(error); }
    },
    async render(request: Request) {
      if (!isLocalRequest(request)) return denied();
      if (rendering) return json({ error: '已有文章正在生成与检查，请等待完成。' }, 409);
      rendering = true;
      try {
        const value = await body(request, ['markdown', 'themeId']);
        if (typeof value.markdown !== 'string' || typeof value.themeId !== 'string') throw new ReferenceError('invalid-input', '请提供 Markdown 与所选主题。', 400);
        const detail: RenderDetail = await render(value.markdown, value.themeId, {
          projectRoot, themesRootPath: themes, repository, signal: signalFor(request, 300_000),
        });
        return json(detail, 201);
      } catch (error) { return errorResponse(error); } finally { rendering = false; }
    },
    async createDraft(request: Request) {
      if (!isLocalRequest(request)) return denied();
      if (drafting) return json({ error: '已有主题草案正在生成，请等待完成。' }, 409);
      drafting = true;
      try {
        const value = await body(request, ['brief']);
        if (typeof value.brief !== 'string') throw new ReferenceError('invalid-input', '请填写主题 brief。', 400);
        const draft = await createThemeDraft(value.brief, { projectRoot, draftsRoot: drafts, signal: signalFor(request, 300_000) });
        return json({ draft }, 201);
      } catch (error) { return errorResponse(error); } finally { drafting = false; }
    },
    async draft(request: Request, id: string) {
      if (!isLocalRequest(request)) return denied();
      if (confirming) return json({ error: '正在处理待确认草案，请等待完成。' }, 409);
      confirming = true;
      try {
        const value = await body(request, ['action']);
        if (value.action === 'discard') { await discardDraft(id, drafts); return json({ discarded: id }); }
        if (value.action !== 'confirm') throw new ReferenceError('invalid-input', '请选择确认入库或丢弃。', 400);
        const confirmed = await confirmDraft(id, { draftsRoot: drafts, themesRoot: themes, projectRoot, signal: signalFor(request, 120_000) });
        return json(confirmed, 201);
      } catch (error) { return errorResponse(error); } finally { confirming = false; }
    },
    async remove(request: Request, id: string) {
      if (!isLocalRequest(request)) return denied();
      try {
        const confirm = new URL(request.url).searchParams.get('confirm') ?? '';
        return json(await removeTheme(id, confirm, themes));
      } catch (error) { return errorResponse(error); }
    },
  };
}
export const themeHandlers = createThemeHandlers();
