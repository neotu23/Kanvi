import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'cheerio';
import type { ParsedThemeArticle } from './article';
import { runValidateArticle, type PythonOptions } from './python';

interface Edit { start: number; end: number; value: string }
const labels = { date: '日期', author: '作者', bio: '简介' };
const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 只处理主题生成的独立可选字段，不重写原文或序列化正文内部。 */
export async function resolveOptionalMetadata(html: string, parsed: ParsedThemeArticle, markdown: string, options: PythonOptions = {}): Promise<{ html: string; notes: string[] }> {
  const unchanged = { html, notes: [] as string[] };
  const $ = load(html, { sourceCodeLocationInfo: true }, false);
  const root = $.root().children();
  if (root.length !== 1 || !root.is('section')) return unchanged;
  const edits: Edit[] = [];
  const omitted = new Set<string>();
  let dateFilled = false;
  $('p').each((_, element) => {
    const p = $(element);
    const span = p.children();
    if (span.length !== 1 || !span.is('span[leaf]') || span.children().length) return;
    if (!span.contents().toArray().every(node => node.type === 'text')) return;
    if (!p.contents().toArray().every(node => node === span.get(0) || (node.type === 'text' && !node.data.trim()))) return;
    const text = span.text().trim();
    const match = /^\{\{(date|author|bio)\}\}$/.exec(text);
    if (!match || markdown.includes(text)) return;
    const field = match[1] as keyof typeof labels;
    const location = element.sourceCodeLocation;
    const leafLocation = span.get(0)?.sourceCodeLocation;
    // 隐式闭合/解析器修补的节点不动，保留给原有检查器诊断。
    if (!location?.startTag || !location.endTag || !leafLocation?.startTag || !leafLocation.endTag) return;
    if (field === 'date' && parsed.metadata.date) {
      edits.push({ start: leafLocation.startTag.endOffset, end: leafLocation.endTag.startOffset, value: escapeText(parsed.metadata.date) });
      dateFilled = true;
    } else {
      edits.push({ start: location.startOffset, end: location.endOffset, value: '' });
      omitted.add(labels[field]);
    }
  });
  if (!edits.length) return unchanged;
  // 仅清除因上述空行省略而变空的容器；原有空装饰、图片、已提供的署名都保留。
  $('section').toArray().reverse().forEach(element => {
    if (element === root.get(0)) return;
    const location = element.sourceCodeLocation;
    if (!location?.startTag || !location.endTag) return;
    let removedChild = false;
    const empty = $(element).contents().toArray().every(node => {
      if (node.type === 'text') return !node.data.trim();
      const childLocation = node.sourceCodeLocation;
      const removed = childLocation && edits.some(edit => !edit.value && edit.start <= childLocation.startOffset && edit.end >= childLocation.endOffset);
      if (removed) removedChild = true;
      return Boolean(removed);
    });
    if (empty && removedChild) edits.push({ start: location.startOffset, end: location.endOffset, value: '' });
  });
  // 可选字段不是绕过规格检查的通道：原始输出有其他问题时不进行处理。
  const dir = await mkdtemp(join(tmpdir(), 'kanvi-optional-metadata-'));
  try {
    const path = join(dir, 'body.html');
    await writeFile(path, html, { mode: 0o600 });
    const baseline = await runValidateArticle(path, options);
    if (baseline.error || baseline.errorCount || baseline.issues.length !== baseline.warnCount
      || baseline.issues.some(issue => issue.level !== 'WARN' || !/^仍有 \d+ 处 \{\{占位符\}\} 未替换/.test(issue.message))) return unchanged;
  } finally { await rm(dir, { recursive: true, force: true }); }
  const outerEdits = edits.filter(edit => !edits.some(parent => parent !== edit && !parent.value && parent.start <= edit.start && parent.end >= edit.end));
  let result = html;
  for (const edit of outerEdits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  const notes: string[] = [];
  if (dateFilled) notes.push('已使用原文属性区日期替换主题日期占位符。');
  if (omitted.size) notes.push(`已省略未提供的主题可选字段：${[...omitted].join('、')}；原文与其他主题内容保留。`);
  return { html: result, notes };
}
