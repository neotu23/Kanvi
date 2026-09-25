import { readFileSync, readdirSync } from 'node:fs';
import { load } from 'cheerio';
import { expect, it } from 'vitest';
import { createThemeHandlers } from '../src/features/themes/handlers';

it('六套主题预览包含同一篇完整文章，不再展示槽位占位文案', async () => {
  const handlers = createThemeHandlers();
  for (const id of readdirSync('themes')) {
    const response = await handlers.preview(new Request(`http://127.0.0.1:8787/api/themes/${id}`, { headers: { host: '127.0.0.1:8787' } }), id);
    expect(response.status).toBe(200);
    const preview = await response.json();
    const $ = load(preview.html);
    expect($('body').text()).toContain('把一个下午还给自己');
    expect($('body').text()).toContain('明天仍然会忙，但今天的这一页已经写完了。');
    expect($('body').text()).not.toMatch(/占位|slot:|sig:|\{\{|\*\*/);
    expect($('body section').length).toBeGreaterThan(3);
    expect(preview.markdown).toBe(readFileSync('public/samples/slow-afternoon.md', 'utf8'));
    expect($('meta[http-equiv="Content-Security-Policy"]').attr('content')).toContain("default-src 'none'");
  }
});

it('主题槽位不能执行脚本、事件或导航，且预览不丢正文', async () => {
  const { buildThemePreview } = await import('../src/features/themes/preview');
  const source = readFileSync('themes/moss-zen/THEME.md', 'utf8');
  const markdown = '# 安静的一天\n\n杯子 & 书都在桌上。';
  const html = buildThemePreview(source.replace('{{body}}', '{{body}}<script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(1)">附注</a><iframe src="/api/themes"></iframe>'), markdown);
  const $ = load(html);
  expect($('script, iframe, a, [onclick]').length).toBe(0);
  expect($('body').text()).toContain('杯子 & 书都在桌上。');
  expect(() => buildThemePreview(source.replace('{{body}}', '{{unsupported}}'), markdown)).toThrow(/不支持的变量/);
  expect(() => buildThemePreview(source.replace('{{body}}', ''), markdown)).toThrow(/正文/);
});
