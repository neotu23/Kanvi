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

export interface FidelityResult { ok: boolean; missing: string[]; added: string[]; residue: string[]; unexpectedToc?: string[] }
export interface FidelityOptions { enforceSourceToc?: boolean; themeMarkdown?: string }
export interface VerifyOptions {
  signal?: AbortSignal; projectRoot?: string;
  fidelity?: FidelityOptions;
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
 * 编号、英文标签等装饰性新增单独列出；新版本另查目录内的新增文字。未传策略时保留历史算法。
 */
export function checkFidelity(parsed: ParsedThemeArticle, html: string, options: FidelityOptions = {}): FidelityResult {
  const actual = normalizeText(visibleText(html));
  const expected: string[] = [];
  // 新规则必须计入单字条目和仅在属性区提供的标题；旧历史保持原来的片段过滤。
  const fragments = options.enforceSourceToc
    ? (text: string) => normalizeText(text).split(/(?<=[。！？；;…!?])/u).map(item => item.trim()).filter(Boolean)
    : fragmentsOf;
  if (options.enforceSourceToc && parsed.metadata.title && !parsed.units.some(unit => unit.text === parsed.metadata.title)) {
    expected.push(...fragments(parsed.metadata.title));
  }
  for (const unit of parsed.units) {
    if (unit.kind === 'list' && unit.items?.length) expected.push(...unit.items.flatMap(fragments));
    else expected.push(...fragments(unit.text));
  }
  const missing: string[] = [];
  const added: string[] = [];
  const addedRanges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const text of expected) {
    const index = actual.indexOf(text, cursor);
    if (index < 0) { missing.push(text.slice(0, 60)); continue; }
    if (index > cursor) {
      added.push(actual.slice(cursor, index).trim());
      addedRanges.push({ start: cursor, end: index });
    }
    cursor = index + text.length;
  }
  if (cursor < actual.length) {
    added.push(actual.slice(cursor).trim());
    addedRanges.push({ start: cursor, end: actual.length });
  }
  const residue: string[] = [];
  for (const [pattern, label] of [['**', '加粗标记未转换'], ['##', '标题标记未转换'], ['[[', '双链标记未转换'], ['{{', '占位符未替换']] as const) {
    if (actual.includes(pattern)) residue.push(label);
  }
  const unexpectedToc = options.enforceSourceToc ? unexpectedTocText(parsed, html, actual, addedRanges, options.themeMarkdown) : undefined;
  return {
    ok: missing.length === 0 && residue.length === 0 && !unexpectedToc?.length,
    missing: missing.slice(0, 20), added: added.filter(item => item).slice(0, 20), residue,
    ...(unexpectedToc ? { unexpectedToc } : {}),
  };
}

/** 只查目录区域与原文匹配区间之间的差异，不把正文中提及目录的文字当新增。 */
function unexpectedTocText(parsed: ParsedThemeArticle, html: string, actual: string, added: Array<{ start: number; end: number }>, themeMarkdown = ''): string[] {
  const labels = new Set(['目录', '目次', '看点', '摘录', '本篇三步', 'contents', 'table of contents', 'toc']);
  const slot = themeMarkdown.match(/^### slot:toc[^\n]*\r?\n\s*```html\s*\n([\s\S]*?)```/m)?.[1];
  if (slot) {
    const label = normalizeText(load(slot, {}, false)('p,h1,h2,h3,h4,h5,h6').first().text());
    if (label && !label.includes('{{')) labels.add(label.toLowerCase());
  }
  const $ = load(html, {}, false);
  const headings = new Set(parsed.units.filter(unit => unit.kind === 'heading').map(unit => unit.text));
  const blocks: string[] = [];
  const seen = new Set<object>();
  $('p,h1,h2,h3,h4,h5,h6').each((_, element) => {
    const label = $(element);
    if (!labels.has(normalizeText(label.text()).toLowerCase())) return;
    const container = label.closest('section');
    // 主题 toc 有独立 section；普通正文中的目录标题则只取随后段落，到下一章为止。
    if (container.length && container.parent().closest('section').length) {
      const node = container.get(0)!;
      if (seen.has(node)) return;
      seen.add(node);
      blocks.push(normalizeText(visibleText($.html(container))));
    } else {
      let text = $.html(label);
      for (const sibling of label.nextAll().toArray()) {
        const node = $(sibling);
        const content = normalizeText(node.text()).replace(/^\d+\s*[.．、]?\s*/, '');
        if (node.is('section,h1,h2,h3,h4,h5,h6') || headings.has(content)) break;
        text += $.html(node);
      }
      blocks.push(normalizeText(visibleText(text)));
    }
  });
  const issues: string[] = [];
  let cursor = 0;
  for (const text of blocks) {
    const start = actual.indexOf(text, cursor);
    if (start < 0) continue;
    const end = start + text.length;
    cursor = end;
    for (const gap of added) {
      if (gap.end <= start || gap.start >= end) continue;
      const extra = actual.slice(Math.max(start, gap.start), Math.min(end, gap.end)).trim();
      // 原文目录中的列表符号与章节编号仍可按主题装配，不能借此补写看点。
      if (/^(?:(?:\d+|[一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾]+)\s*[.．、·:：)）-]\s*|[\s•·\-—])*$/.test(extra)) continue;
      issues.push(`目录含原文以外的文字：${extra.slice(0, 80)}`);
    }
  }
  return issues.slice(0, 20);
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
  const fidelity = checkFidelity(parsed, artifact.bodyHtml, options.fidelity);
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
