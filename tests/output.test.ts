import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { load } from 'cheerio';
import { buildOutput } from '../src/features/output/build-output';
import { inline } from '../src/features/output/inline';

it('内联失败不能产生成功输出', () => {
  expect(() => buildOutput('<p>原文</p>', 'p{color:#333}', () => ({ok:false,error:'inlining failed'}))).toThrow('inlining failed');
});
it('自定义边框、留白与文字结构保留并绑定哈希', () => {
  const html = readFileSync('tests/fixtures/styled-source.html','utf8');
  const css = readFileSync('tests/fixtures/styled-source.css','utf8');
  const result = buildOutput(html,css,inline);
  const $ = load(result.bodyHtml);
  expect($('h2').attr('style')).toContain('border-left: 3px solid #8a6f59');
  expect($('h2').attr('style')).toContain('padding-left: 12px');
  expect($('p').first().attr('style')).toContain('line-height: 1.8');
  expect($('p').length).toBe(4);
  expect($('blockquote p').text()).toBe('把这些平常的小事记下来。');
  expect(result.plainText).toContain('周末记录\n今天沿着河边走了一会儿。');
  expect(result.htmlHash).toBe(createHash('sha256').update(result.bodyHtml).digest('hex'));
});
it('清理主动内容、事件与绕过检测属性，保留合法文字', () => {
  const r = buildOutput('<p onclick="alert(1)" data-ignore-width="">你好<strong>世界</strong></p><script>alert(2)</script>','p{color:red}',inline);
  expect(r.bodyHtml).not.toMatch(/script|onclick|data-ignore/);
  expect(r.plainText).toBe('你好世界');
});
it('拒绝媒体和未知结构，避免静默丢失', () => {
  expect(() => buildOutput('<p>原文</p><img src="x" alt="说明">','',inline)).toThrow();
  expect(() => buildOutput('<custom>原文</custom>','',inline)).toThrow();
});
it('拒绝外部资源、伪元素增文与非内联规则，保留可诊断错误', () => {
  for (const css of ['@import "https://example.com/x";', 'p{background:url(https://example.com/x)}', 'p::before{content:"额外文字"}', '@media(max-width:500px){p{color:red}}', 'p{color:red']) {
    expect(() => buildOutput('<p>原文</p>',css,inline)).toThrow();
  }
});
it('内联过程不可删改原文或段落', () => {
  expect(() => buildOutput('<p>第一段</p><p>第二段</p>','', () => ({ok:true,html:'<p>第一段第二段</p>'}))).toThrow();
  expect(() => buildOutput('<p>原文</p>','', () => ({ok:true,html:'<p>改写</p>'}))).toThrow();
});
