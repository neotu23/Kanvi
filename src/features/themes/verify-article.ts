import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'cheerio';
import type { OutputArtifact } from '../output/contracts';
import { ReferenceError } from '../references/contracts';
import { checkerConfig } from '../validation/config';
import type { CheckReport } from '../validation/normalize-report';
import { runChecker } from '../validation/run-checker';
import { normalizeText, type ParsedThemeArticle } from './article';
import { runValidateArticle, type ScriptResult } from './python';

export interface FidelityResult { ok: boolean; missing: string[]; added: string[]; residue: string[] }
export interface VerifyOptions {
  signal?: AbortSignal; projectRoot?: string;
  checker?: (artifact: OutputArtifact, signal?: AbortSignal) => Promise<CheckReport>;
}
export interface ArticleVerification { validate: ScriptResult; fidelity: FidelityResult; check: CheckReport }

/** 提取可见文字：图片按 alt 计入，块级元素之间补换行。 */
export function visibleText(html: string): string {
  const $ = load(html, {}, false);
  $('script, style, noscript').remove();
  $('img').each((_, element) => { $(element).replaceWith($(element).attr('alt') ?? ''); });
  $('br').replaceWith('\n');
  $('section, div, p, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, li, hr, table, tr, td, th, figure, figcaption, pre, code').each((_, element) => { $(element).append('\n'); });
  return $.root().text();
}
/** 把内容单元切成句子级片段：编号、列表符号这类结构性新增不会破坏匹配，但丢句、改写、换序仍会失败。 */
export function fragmentsOf(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized.split(/(?<=[。！？；;…!?])/u).map(item => item.trim()).filter(item => item.length >= 2);
}
export function artifactFromHtml(html: string): OutputArtifact {
  const plainText = visibleText(html).replace(/\n[\t ]+/g, '\n').replace(/\n{2,}/g, '\n').trim();
  if (!plainText) throw new ReferenceError('empty-output', '产物没有可输出的文字，未保存。', 422);
  return { bodyHtml: html, plainText, htmlHash: createHash('sha256').update(html, 'utf8').digest('hex') };
}
/**
 * 原文保真：每个内容单元的文字必须按顺序出现在产物里；出现顺序错误、缺段或残留 Markdown 语法都算失败。
 * 编号、英文标签、目录与 footer 属于主题骨架允许的结构性新增，单独列出供人工核对，不作为失败。
 */
export function checkFidelity(parsed: ParsedThemeArticle, html: string): FidelityResult {
  const actual = normalizeText(visibleText(html));
  const expected: string[] = [];
  for (const unit of parsed.units) {
    if (unit.kind === 'list' && unit.items?.length) expected.push(...unit.items.flatMap(fragmentsOf));
    else expected.push(...fragmentsOf(unit.text));
  }
  const missing: string[] = [];
  const added: string[] = [];
  let cursor = 0;
  for (const text of expected) {
    const index = actual.indexOf(text, cursor);
    if (index < 0) { missing.push(text.slice(0, 60)); continue; }
    if (index > cursor) added.push(actual.slice(cursor, index).trim());
    cursor = index + text.length;
  }
  if (cursor < actual.length) added.push(actual.slice(cursor).trim());
  const residue: string[] = [];
  for (const [pattern, label] of [['**', '加粗标记未转换'], ['##', '标题标记未转换'], ['[[', '双链标记未转换'], ['{{', '占位符未替换']] as const) {
    if (actual.includes(pattern)) residue.push(label);
  }
  return {
    ok: missing.length === 0 && residue.length === 0,
    missing: missing.slice(0, 20), added: added.filter(item => item).slice(0, 20), residue,
  };
}
export async function officialArticleCheck(artifact: OutputArtifact, signal?: AbortSignal, config = checkerConfig()): Promise<CheckReport> {
  const dir = await mkdtemp(join(tmpdir(), 'kanvi-theme-check-'));
  try {
    const path = join(dir, 'body.html');
    await writeFile(path, artifact.bodyHtml, { mode: 0o600 });
    return await runChecker(path, artifact.htmlHash, config, signal);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export async function verifyArticle(parsed: ParsedThemeArticle, artifact: OutputArtifact, options: VerifyOptions = {}): Promise<ArticleVerification> {
  const fidelity = checkFidelity(parsed, artifact.bodyHtml);
  const dir = await mkdtemp(join(tmpdir(), 'kanvi-theme-article-'));
  let validate: ScriptResult;
  try {
    const path = join(dir, 'body.html');
    await writeFile(path, artifact.bodyHtml, { mode: 0o600 });
    validate = await runValidateArticle(path, { projectRoot: options.projectRoot, signal: options.signal });
  } finally { await rm(dir, { recursive: true, force: true }); }
  const config = checkerConfig();
  let check: CheckReport;
  try { check = await (options.checker ?? ((item, signal) => officialArticleCheck(item, signal, config)))(artifact, options.signal); }
  catch { check = { status: 'error', htmlHash: artifact.htmlHash, checkerCommit: config.commit, issues: [], error: '官方检查器未就绪或执行失败，未标记为通过。' }; }
  if (check.htmlHash !== artifact.htmlHash || check.checkerCommit !== config.commit) {
    check = { status: 'error', htmlHash: artifact.htmlHash, checkerCommit: config.commit, issues: [], error: '检查器报告与正文或检查器版本不匹配，未标记为通过。' };
  }
  return { validate, fidelity, check };
}
