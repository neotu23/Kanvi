import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import postcss from 'postcss';
import { MAX_REFERENCE_BYTES, ReferenceError, type ReferenceSnapshot, type StyleEvidence } from './contracts';

const active = 'script,style,iframe,object,embed,template,noscript';
const media = 'img,picture,svg,video,audio,canvas,mpvoice,qqmusic,mp-common-videosnap';
const properties = /^(color|background-color|font-family|font-size|font-weight|font-style|line-height|letter-spacing|text-align|text-indent|text-decoration|white-space|word-break|overflow-wrap|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|border(?:-(?:top|right|bottom|left))?(?:-(?:width|style|color))?|border-radius|display|width|max-width|min-width|height|max-height|min-height|box-sizing)$/;
// Only a small, bounded selector grammar is evaluated. Dynamic/conditional CSS stays diagnostic.
const selectorPattern = /^[a-zA-Z0-9_\u0080-\uffff.#* ,>+~-]+$/;

export function extractArticle(sourceHtml: string, sourceUrl: string | null): ReferenceSnapshot {
  if (Buffer.byteLength(sourceHtml, 'utf8') > MAX_REFERENCE_BYTES) throw new ReferenceError('too-large', '参考 HTML 大小超过 2 MiB。', 413);
  const $ = load(sourceHtml);
  const bodies = $('[id="js_content"]');
  if (!bodies.length) {
    if (/验证码|访问过于频繁|环境异常|完成验证/.test($('body').text())) throw new ReferenceError('verification-page', '来源要求验证码或访问验证，请使用自己保存的文章 HTML。');
    throw new ReferenceError('missing-body', '未找到公众号正文区域 #js_content，可能是失效链接或非文章页面。');
  }
  if (bodies.length !== 1) throw new ReferenceError('ambiguous-body', '发现多个正文区域，无法确定参考来源。');
  const body = bodies.first();
  const textBody = body.clone();
  textBody.find(`${active},${media}`).remove();
  if (!textBody.text().trim()) throw new ReferenceError('empty-body', '正文为空，或只有当前不支持的媒体内容。');
  const diagnostics = new Map<string, string>();
  const diagnose = (code: string, message: string) => diagnostics.set(code, message);
  if ($('script,iframe,object,embed').length || body.find('*').add(body).toArray().some(e => Object.keys(e.attribs).some(k => /^on/i.test(k)))) {
    diagnose('active-content', '来源含脚本或事件属性，仅保存为原始数据，不执行或展示原始 HTML。');
  }
  if (body.find(media).length) diagnose('media', '来源包含媒体或图片装饰，不能在纯文字模板中直接复用。');
  if ($('link[rel="stylesheet"]').length) diagnose('external-css', '未读取外部样式表；静态证据可能不完整。');
  diagnose('static-evidence', '记录的是 HTML/CSS 声明，未运行浏览器计算继承、最终层叠或实际布局。');

  const nodes = body.find('*').addBack().toArray().filter(node => 'tagName' in node);
  if (nodes.length > 1000) throw new ReferenceError('too-complex', '正文结构超过 1000 个元素，暂不支持分析。');
  const records = new Map<(typeof nodes)[number], StyleEvidence>();
  const styleEvidence: StyleEvidence[] = [];
  for (const node of nodes) {
    const element = $(node);
    if (element.is(`${active},${media}`) || element.parents(`${active},${media}`).length) continue;
    const parent = element.parent()[0];
    const evidence: StyleEvidence = {
      id: `e${styleEvidence.length + 1}`, parentId: records.get(parent)?.id ?? null,
      tag: node.tagName, text: element.clone().find(`${active},${media}`).remove().end().text().trim().slice(0, 120), declarations: [],
    };
    records.set(node, evidence);
    styleEvidence.push(evidence);
  }
  let declarationCount = 0;
  const add = (record: StyleEvidence, property: string, value: string, origin: 'inline' | 'stylesheet', selector?: string) => {
    if (!properties.test(property) || /url\s*\(|expression\s*\(|var\s*\(|\\|image-set\s*\(/i.test(value) || value.length > 300) {
      diagnose('unsupported-css', '部分样式含动态资源、条件、装饰或暂不支持的属性；未视为可直接复用的文字样式。');
      return;
    }
    if (++declarationCount > 12000) throw new ReferenceError('too-complex', '样式声明过多，暂不支持分析。');
    record.declarations.push({ property, value, origin, ...(selector ? { selector } : {}) });
  };
  const css = $('style').toArray().map(e => $(e).text()).join('\n');
  if (Buffer.byteLength(css) > 128 * 1024) throw new ReferenceError('too-complex', '页面样式超过 128 KiB，暂不支持分析。');
  try {
    const stylesheet = postcss.parse(css);
    stylesheet.walkAtRules(() => { diagnose('unsupported-css', '条件规则和外部字体等样式未计算，需在后续模板阶段处理。'); });
    let ruleCount = 0;
    stylesheet.walkRules(rule => {
      if (++ruleCount > 1500) throw new ReferenceError('too-complex', '样式规则过多，暂不支持分析。');
      if (rule.parent?.type !== 'root' || rule.selector.length > 256 || !selectorPattern.test(rule.selector)) {
        diagnose('unsupported-css', '条件、动态选择器和伪元素不能作为已还原的样式。'); return;
      }
      let matched;
      try { matched = $(rule.selector).toArray(); }
      catch { diagnose('unsupported-css', '部分选择器无法解析，未用于风格提取。'); return; }
      for (const node of matched) {
        const record = 'tagName' in node ? records.get(node) : undefined;
        if (record) rule.each(item => { if (item.type === 'decl') add(record, item.prop, item.value + (item.important ? ' !important' : ''), 'stylesheet', rule.selector); });
      }
    });
  } catch (error) {
    if (error instanceof ReferenceError) throw error;
    diagnose('invalid-css', '页面样式存在语法错误，样式表证据未能完整解析。');
  }
  for (const [node, record] of records) {
    const inline = node.attribs.style;
    if (!inline) continue;
    try {
      const rule = postcss.parse(`x{${inline}}`).first;
      if (rule?.type !== 'rule') throw new Error('invalid declaration');
      rule.each(item => { if (item.type === 'decl') add(record, item.prop, item.value + (item.important ? ' !important' : ''), 'inline'); });
    } catch (error) {
      if (error instanceof ReferenceError) throw error;
      diagnose('invalid-css', '部分行内样式无法完整解析。');
    }
  }
  const contentHash = createHash('sha256').update(sourceHtml).digest('hex');
  return {
    version: 1, id: contentHash, sourceUrl, fetchedAt: new Date().toISOString(), contentHash,
    title: ($('#activity-name').first().text().trim() || $('title').first().text().trim() || textBody.text().trim()).slice(0, 120),
    sourceHtml, articleHtml: $.html(body), styleEvidence,
    diagnostics: [...diagnostics].map(([code, message]) => ({ code, message })),
  };
}
