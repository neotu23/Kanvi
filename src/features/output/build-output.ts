import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import postcss from 'postcss';
import sanitizeHtml from 'sanitize-html';
import type { Inliner, OutputArtifact } from './contracts';

const tags = ['section','div','p','span','h1','h2','h3','h4','h5','h6','strong','b','em','i','u','s','del','br','blockquote','ul','ol','li','hr','a','code','pre'];
const disposable = new Set(['script']);

function checkCss(css: string) {
  const root = postcss.parse(css);
  root.walkAtRules(() => { throw new Error('本阶段不支持外部样式、媒体查询或其他 @ 规则'); });
  root.walkRules(rule => {
    if (rule.selector.includes(':') || rule.selector.includes('\\')) throw new Error('本阶段不支持伪元素、状态选择器或转义选择器');
    if (rule.parent?.type !== 'root') throw new Error('本阶段不支持嵌套样式');
  });
  root.walkDecls(decl => {
    const value = decl.value.replace(/\/\*[\s\S]*?\*\//g, '');
    if (/\\|url\s*\(|image-set\s*\(|expression\s*\(|var\s*\(/i.test(value) || /^(content|behavior|-moz-binding|--)/i.test(decl.prop)) {
      throw new Error('样式包含本阶段不支持的资源、生成内容或动态值');
    }
  });
}
function clean(html: string) {
  const $ = load(html, {}, false);
  $('*').each((_, node) => {
    if (!('tagName' in node)) return;
    if (!tags.includes(node.tagName) && !disposable.has(node.tagName)) throw new Error(`不支持的正文结构：${node.tagName}`);
    const style = $(node).attr('style');
    if (style) checkCss(`x{${style}}`);
  });
  return sanitizeHtml(html, {
    allowedTags: tags,
    allowedAttributes: {'*':['style','class','id'], a:['href','title'], ol:['start'],li:['value']},
    allowedSchemes: ['https','http','mailto'], allowProtocolRelative:false,
    parseStyleAttributes:false,
  });
}
function signature(html: string) {
  const $ = load(html, {}, false);
  return JSON.stringify({ tags:$('*').toArray().map(n => 'tagName' in n ? n.tagName : ''), text:$.root().text() });
}
function toPlainText(html: string) {
  const $ = load(html, {}, false);
  $('br').replaceWith('\n');
  $('section,div,p,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,li,hr,pre').append('\n');
  return $.root().text().replace(/\n[\t ]+/g,'\n').replace(/\n{2,}/g,'\n').trim();
}
export function buildOutput(html: string, css: string, inliner: Inliner): OutputArtifact {
  if (!html.trim()) throw new Error('正文不能为空');
  checkCss(css);
  const cleaned = clean(html);
  const result = inliner(cleaned,css);
  if (!result.ok) throw new Error(result.error);
  const bodyHtml = clean(result.html);
  if (signature(cleaned) !== signature(bodyHtml)) throw new Error('排版改变了原文或正文结构');
  const plainText = toPlainText(bodyHtml);
  if (!plainText) throw new Error('正文没有可输出的文字');
  return {bodyHtml,plainText,htmlHash:createHash('sha256').update(bodyHtml,'utf8').digest('hex')};
}
