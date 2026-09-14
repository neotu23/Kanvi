import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { extractArticle } from '../src/features/references/extract-article';

const html = readFileSync('tests/fixtures/reference.html', 'utf8');
it('提取正文原文、层级和可追溯的 CSS 声明，重复提取证据稳定', () => {
  const a = extractArticle(html, null);
  const b = extractArticle(html, null);
  expect(a.contentHash).toBe(b.contentHash);
  expect(a.styleEvidence).toEqual(b.styleEvidence);
  expect(a.articleHtml).toContain('沿着河边走了一会儿。');
  const heading = a.styleEvidence.find(e => e.tag === 'h2')!;
  expect(heading.parentId).toBe(a.styleEvidence[0].id);
  expect(heading.declarations).toContainEqual({ property: 'padding-left', value: '12px', origin: 'stylesheet', selector: '.heading' });
  expect(a.styleEvidence.find(e => e.tag === 'p')!.declarations).toContainEqual({ property: 'font-size', value: '16px', origin: 'inline' });
});
it.each([
  ['<p>无正文</p>', '正文区域'],
  ['<p>请输入验证码</p>', '验证码'],
  ['<div id="js_content"></div>', '正文为空'],
  ['<div id="js_content"><script>非正文</script></div>', '正文为空'],
  ['<div id="js_content">甲</div><div id="js_content">乙</div>', '多个'],
])('拒绝错误或不明确的正文：%s', (input, message) => {
  expect(() => extractArticle(input, null)).toThrow(message);
});
it('脚本和媒体作为原始数据保留并诊断，不作为可用文字风格', () => {
  const s = extractArticle('<script src="https://evil.invalid/x.js"></script><div id="js_content" onclick="evil()"><p>原文</p><img src="x"><svg><text>装饰</text></svg></div>', null);
  expect(s.sourceHtml).toContain('<script');
  expect(s.articleHtml).toContain('onclick');
  expect(s.diagnostics.map(d => d.code)).toEqual(expect.arrayContaining(['active-content', 'media']));
  expect(s.styleEvidence.some(e => ['script', 'svg', 'img'].includes(e.tag))).toBe(false);
});
it('无法静态还原的规则和超限内容明确报错或诊断', () => {
  const s = extractArticle('<style>@media(max-width:400px){p{color:red}}p::before{content:"装饰"}</style><div id="js_content"><p>原文</p></div>', null);
  expect(s.diagnostics.map(d => d.code)).toContain('unsupported-css');
  expect(() => extractArticle('x'.repeat(2 * 1024 * 1024 + 1), null)).toThrow('大小');
});
