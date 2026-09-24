import { createHash } from 'node:crypto';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { frontmatter } from 'micromark-extension-frontmatter';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { isAlias, parseDocument, visit } from 'yaml';
import { ReferenceError } from '../references/contracts';

export const THEME_PARSER_VERSION = 'kanvi-theme-article-1';
export const MAX_ARTICLE_BYTES = 256 * 1024;
export const MAX_SEND_BYTES = 60 * 1024;

export type UnitKind = 'heading' | 'paragraph' | 'quote' | 'list' | 'table' | 'code' | 'image' | 'divider';
export interface ArticleUnit {
  id: string; kind: UnitKind; text: string;
  level?: number; ordered?: boolean; start?: number; items?: string[]; lang?: string; alt?: string; src?: string;
}
export interface ArticleDiagnostic { code: string; message: string; severity: 'error' | 'warning' }
export interface ParsedThemeArticle {
  parserVersion: string; sourceHash: string;
  metadata: { title?: string; date?: string; tags?: string[] };
  units: ArticleUnit[];
  stats: { heading: number; paragraph: number; quote: number; list: number; table: number; code: number; image: number; divider: number; characters: number };
  diagnostics: ArticleDiagnostic[];
}
type AstNode = {
  type: string; value?: string; alt?: string; url?: string; lang?: string;
  children?: AstNode[]; depth?: number; ordered?: boolean; start?: number | null; checked?: boolean | null;
};

/** 折叠空白后比较，避免换行与缩进差异造成误判。 */
export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
function nodeText(node: AstNode): string {
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') return node.value ?? '';
  if (node.type === 'image') return node.alt ?? '';
  if (node.type === 'break') return '\n';
  if (node.type === 'tableCell' || node.type === 'tableRow' || node.type === 'table') return (node.children ?? []).map(nodeText).join(node.type === 'tableCell' ? '' : ' ');
  return (node.children ?? []).map(nodeText).join('');
}

export function parseThemeArticle(source: string): ParsedThemeArticle {
  if (typeof source !== 'string' || !source.isWellFormed() || Buffer.byteLength(source, 'utf8') > MAX_ARTICLE_BYTES || source.length > 200_000) {
    throw new ReferenceError('markdown-size', 'Markdown 需为有效文字，且不超过 256 KiB / 20 万字符。', 413);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source)) throw new ReferenceError('markdown-encoding', '文档含不支持的控制字符。', 422);
  const bom = source.startsWith('\uFEFF') ? 1 : 0;
  const tree = fromMarkdown(source.slice(bom), {
    extensions: [gfm(), frontmatter(['yaml'])],
    mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown(['yaml'])],
  }) as AstNode;
  const result: ParsedThemeArticle = {
    parserVersion: THEME_PARSER_VERSION, sourceHash: createHash('sha256').update(source).digest('hex'),
    metadata: {}, units: [],
    stats: { heading: 0, paragraph: 0, quote: 0, list: 0, table: 0, code: 0, image: 0, divider: 0, characters: 0 },
    diagnostics: [],
  };
  const diagnose = (code: string, message: string, severity: ArticleDiagnostic['severity'] = 'error') => {
    if (result.diagnostics.length >= 199) return;
    result.diagnostics.push({ code, message, severity });
  };
  let visited = 0;
  const bounded = (node: AstNode, depth = 0): void => {
    if (++visited > 20_000 || depth > 32) throw new ReferenceError('markdown-complexity', '文档结构过深或节点过多。', 422);
    node.children?.forEach(child => bounded(child, depth + 1));
  };
  bounded(tree);

  function metadata(node: AstNode): void {
    try {
      if ((node.value?.length ?? 0) > 8192) throw new Error('large metadata');
      const doc = parseDocument(node.value ?? '', { version: '1.2', schema: 'core', strict: true, uniqueKeys: true, customTags: [], resolveKnownTags: false });
      if (doc.errors.length || doc.warnings.length) throw new Error('invalid metadata');
      visit(doc, (_key, value) => {
        if (value && typeof value === 'object' && (isAlias(value) || ('anchor' in value && value.anchor) || ('tag' in value && value.tag))) throw new Error('alias/tag');
      });
      const parsed = doc.toJS({ maxAliasCount: 0 });
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length > 30) throw new Error('metadata map');
      for (const [key, value] of Object.entries(parsed)) {
        if (key === 'title' || key === 'date') {
          if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\r\n\u0000-\u001f]/.test(value)) throw new Error('metadata scalar');
          result.metadata[key] = value;
        } else if (key === 'tags') {
          const tags = typeof value === 'string' ? [value] : value;
          if (!Array.isArray(tags) || tags.length > 30 || !tags.every(tag => typeof tag === 'string' && tag.trim() && tag.length <= 80 && !/[\r\n\u0000-\u001f]/.test(tag))) throw new Error('metadata tags');
          result.metadata.tags = tags;
        } else diagnose('metadata-unused', `属性 ${key.slice(0, 60)} 仅保存在原文，不输出为正文。`, 'warning');
      }
    } catch {
      result.metadata = {};
      diagnose('invalid-frontmatter', '属性区无效：只支持简短标题、日期与文字标签，不支持重复字段、别名或复杂值。');
    }
  }

  const push = (unit: Omit<ArticleUnit, 'id'>): void => {
    const kind = unit.kind;
    result.stats[kind] += 1;
    const text = normalizeText(unit.text);
    result.stats.characters += text.length;
    result.units.push({ id: `u-${result.units.length}`, ...unit, text });
  };

  for (const node of tree.children ?? []) {
    switch (node.type) {
      case 'yaml': metadata(node); break;
      case 'heading': push({ kind: 'heading', level: node.depth ?? 2, text: nodeText(node) }); break;
      case 'paragraph':
        if (containsImage(node)) {
          for (const child of node.children ?? []) {
            if (child.type === 'image') {
              push({ kind: 'image', text: nodeText(child), alt: node.alt ?? '', src: child.url ?? '' });
            }
          }
          const rest = nodeText({ ...node, children: (node.children ?? []).filter(child => child.type !== 'image') });
          if (normalizeText(rest)) push({ kind: 'paragraph', text: rest });
          break;
        }
        push({ kind: 'paragraph', text: nodeText(node) });
        break;
      case 'blockquote': push({ kind: 'quote', text: nodeText(node) }); break;
      case 'list': {
        const items = (node.children ?? []).map(item => normalizeText(nodeText(item)));
        push({ kind: 'list', text: items.join(' '), items, ordered: Boolean(node.ordered), ...(node.ordered ? { start: node.start ?? 1 } : {}) });
        break;
      }
      case 'table': push({ kind: 'table', text: nodeText(node) }); break;
      case 'code': push({ kind: 'code', text: node.value ?? '', lang: node.lang ?? '' }); break;
      case 'thematicBreak': push({ kind: 'divider', text: '' }); break;
      case 'html': diagnose('unsupported-html', '原文包含原始 HTML，不执行也不复制其内容，请先处理原文。'); break;
      case 'definition': diagnose('unsupported-definition', '原文包含链接定义，暂不支持，请改为普通链接写法。'); break;
      case 'footnoteDefinition': diagnose('unsupported-footnote', '原文包含脚注定义，暂不支持。'); break;
      default: diagnose(`unsupported-${node.type}`, `暂不支持 ${node.type} 结构，请先处理原文。`); break;
    }
  }
  if (!result.units.some(unit => unit.kind !== 'divider')) diagnose('empty-article', '文档没有可渲染的正文。');
  if (!result.metadata.title) {
    const heading = result.units.find(unit => unit.kind === 'heading');
    if (heading) result.metadata.title = heading.text.slice(0, 200);
  }
  return result;
}

function containsImage(node: AstNode): boolean {
  if (node.type === 'image') return true;
  return (node.children ?? []).some(containsImage);
}
export function parseFailures(parsed: ParsedThemeArticle): ArticleDiagnostic[] {
  return parsed.diagnostics.filter(diagnostic => diagnostic.severity === 'error');
}
