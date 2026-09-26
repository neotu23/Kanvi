import { load } from 'cheerio';
import postcss from 'postcss';
import { ReferenceError } from '../references/contracts';

// parse5 提供属性源位置；domhandler 的公开类型只列出标签源位置。
type AttributeLocations = { attrs?: Record<string, { startOffset: number; endOffset: number }> };

/** Kanvi 的正文纸面：所有留白随正文复制，不依赖预览页的 CSS。 */
export function applyArticleLayout(html: string): string {
  const $ = load(html, { sourceCodeLocationInfo: true }, false);
  const root = $.root().children();
  // 非法结构交给原有检查器报错，不包装、删去或修复成合法正文。
  if (root.length !== 1 || !root.is('section')) return html;
  const location = root.get(0)?.sourceCodeLocation;
  if (!location?.startTag) return html;
  let stylesheet;
  try { stylesheet = postcss.parse(`section{${root.attr('style') ?? ''}}`); }
  catch { throw new ReferenceError('theme-layout', '正文容器样式无法解析。', 422); }
  const style = stylesheet.first;
  if (stylesheet.nodes.length !== 1 || !style || style.type !== 'rule' || style.nodes.some(node => node.type !== 'decl' && node.type !== 'comment')) {
    throw new ReferenceError('theme-layout', '正文容器样式必须是内联声明，未自动清理。', 422);
  }
  style.walkDecls(decl => {
    if (/^(padding(?:-.+)?|width|box-sizing|overflow-wrap)$/i.test(decl.prop)) decl.remove();
  });
  for (const [prop, value] of Object.entries({ padding: '28px 20px 40px', width: '100%', 'box-sizing': 'border-box', 'overflow-wrap': 'anywhere' })) {
    style.append({ prop, value });
  }
  const value = (style.nodes.map(node => node.toString()).join(';') + ';').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const attribute = (location as typeof location & AttributeLocations).attrs?.style;
  // 使用源位置局部替换，绝不重新序列化文章内部（解析器会自动修补非法嵌套）。
  if (attribute) return html.slice(0, attribute.startOffset) + `style="${value}"` + html.slice(attribute.endOffset);
  const end = location.startTag.endOffset - (html[location.startTag.endOffset - 2] === '/' ? 2 : 1);
  return html.slice(0, end) + ` style="${value}"` + html.slice(end);
}

/** 保留磁盘上的上游资产；有效根槽进入提示词和新记录的主题快照。 */
export function articleThemeMarkdown(markdown: string): string {
  let replaced = false;
  const result = markdown.replace(/(^### slot:root[^\n]*\r?\n[\s\S]*?```html\s*\n)([\s\S]*?)(```)/m, (_, before: string, html: string, after: string) => {
    replaced = true;
    return before + applyArticleLayout(html.trim()) + '\n' + after;
  });
  if (!replaced) throw new ReferenceError('preview-slot', '主题缺少 root 槽，无法生成正文。', 422);
  return result;
}
