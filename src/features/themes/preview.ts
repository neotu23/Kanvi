import { load } from 'cheerio';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { RootContent } from 'mdast';
import sanitizeHtml from 'sanitize-html';
import { articleDocument } from '../output/document';
import { ReferenceError } from '../references/contracts';

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
function plain(node: RootContent): string {
  if (node.type === 'text') return node.value;
  if ('children' in node) return node.children.map(child => plain(child as RootContent)).join('');
  throw new ReferenceError('preview-content', '示例文章含未支持的结构，未省略内容。', 422);
}

/** 仅装配仓库内的固定示例；用户文章仍走 AI 装配和独立检测。 */
export function buildThemePreview(themeMarkdown: string, markdown: string): string {
  const slots = new Map<string, string>();
  for (const match of themeMarkdown.matchAll(/^### slot:([\w-]+)[^\n]*\r?\n([\s\S]*?)(?=^#{1,3} |$(?![\s\S]))/gm)) {
    const html = match[2].match(/```html\s*\n([\s\S]*?)```/i)?.[1];
    if (html) slots.set(match[1], html.trim());
  }
  function slot(id: string, values: Record<string, string> = {}): string {
    const template = slots.get(id);
    if (!template) throw new ReferenceError('preview-slot', `主题缺少 ${id} 槽，无法生成文章预览。`, 422);
    return template.replace(/\{\{([^{}]+)\}\}/g, (_, key: string) => {
      if (!Object.hasOwn(values, key.trim())) throw new ReferenceError('preview-slot', `主题的 ${id} 槽使用了不支持的变量 ${key}，无法完整预览。`, 422);
      return escape(values[key.trim()]);
    });
  }
  let chapter = 0;
  const nodes = fromMarkdown(markdown).children;
  const parts = nodes.map(node => {
    if (node.type === 'heading' && node.depth === 1) return slot('hero', { title: plain(node), kicker: '日常手记', subtitle: '一次散步，一本旧书，一段不必赶路的时间。', date: '2026 年 9 月 · Kanvi' });
    if (node.type === 'heading' && node.depth === 2) return slot('h2', { title: plain(node), n: String(++chapter).padStart(2, '0'), en_label: ['NOTICE', 'WANDER', 'RETURN'][chapter - 1] ?? 'NOTES' });
    if (node.type === 'paragraph') return slot('paragraph', { body: plain(node) });
    if (node.type === 'blockquote') return slot('blockquote', { body: plain(node) });
    throw new ReferenceError('preview-content', '示例文章含未支持的结构，未省略内容。', 422);
  });
  parts.push(slot('footer', { author: 'Kanvi 编辑部', bio: '记录平凡日子里的片刻。本文为自写的主题预览示例，可保存与复用。' }));
  const $ = load(slot('root'), null, false);
  if ($.root().children().length !== 1 || !$.root().children().is('section')) throw new ReferenceError('preview-slot', '主题根槽不是单一 section，无法完整预览。', 422);
  $.root().children().append(parts.join('\n'));
  const clean = sanitizeHtml($.html(), {
    allowedTags: ['section', 'p', 'span', 'br', 'strong', 'em', 'b', 'i', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'hr'],
    allowedAttributes: { '*': ['style'], span: ['leaf'] },
  });
  const visible = load(clean).text().replace(/\s+/g, '');
  let cursor = 0;
  for (const node of nodes) {
    const text = plain(node).replace(/\s+/g, '');
    const index = visible.indexOf(text, cursor);
    if (index < 0) throw new ReferenceError('preview-content', '主题预览未保留完整正文，不能用于确认主题。', 422);
    cursor = index + text.length;
  }
  // 独立文档、禁止外部资源和脚本；正文自然换行，供父页面测量真实高度。
  return articleDocument(clean).replace('</head>', '<style>html,body{margin:0;padding:0}body{display:flow-root;overflow-wrap:anywhere}*{box-sizing:border-box;max-width:100%}</style></head>');
}
