import { expect, it } from 'vitest';
import { applyArticleLayout } from '../src/features/themes/layout';

it('调整纸面只改根样式，不让 HTML 解析器重排或修补正文', () => {
  const body = '<p>第一段<div>不支持的结构</div>后文</p><p>原样 &amp; &#x4e66;</p>';
  const result = applyArticleLayout(`<section style="max-width:677px;margin:0 auto;">${body}</section>`);
  expect(result.slice(result.indexOf('>') + 1)).toBe(`${body}</section>`);
  expect(applyArticleLayout(result)).toBe(result);
  const invalidRoot = '<section>第一段</section><section>第二段</section>';
  expect(applyArticleLayout(invalidRoot)).toBe(invalidRoot);
});

it('不是声明列表的根样式会明确失败，不截取其中一部分继续排版', () => {
  expect(() => applyArticleLayout('<section style="color:red} p{display:none"><p>原文</p></section>')).toThrow(/容器样式/);
});
