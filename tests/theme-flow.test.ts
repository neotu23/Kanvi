import { expect, it } from 'vitest';
import { initialThemeFlow, themeFlowReducer as step, type ThemePreviewData } from '../src/features/themes/workspace-flow';

const preview = (id: string): ThemePreviewData => ({ id, html: `<html><body><p>${id} 的完整文章</p></body></html>`, source: '主题包', markdown: '# 示例' });
const ready = (id: string, available = true) => step(step(initialThemeFlow, { type: 'select', id }), { type: 'preview-ready', preview: preview(id), available });

it('已保存主题在预览加载成功后可直接进入正文生成', () => {
  let state = step(initialThemeFlow, { type: 'select', id: 'moss-zen' });
  expect(step(state, { type: 'compose' }).stage).toBe('preview');
  state = step(state, { type: 'preview-ready', preview: preview('moss-zen'), available: true });
  expect(step(state, { type: 'compose' }).stage).toBe('compose');
});

it('切主题需等新预览加载，旧回包和未保存草案不能开放正文入口', () => {
  let state = ready('moss-zen');
  state = step(state, { type: 'compose' });
  state = step(state, { type: 'select', id: 'mist-masthead' });
  expect(state.stage).toBe('preview');
  expect(state.ready).toBe(false);
  state = step(state, { type: 'preview-ready', preview: preview('moss-zen'), available: true });
  expect(step(state, { type: 'compose' }).stage).toBe('preview');
  state = step(state, { type: 'preview-ready', preview: preview('mist-masthead'), available: false });
  expect(step(state, { type: 'compose' }).stage).toBe('preview');
});

it('草案保存入库后可直接使用；重新选择同一主题可以重试预览', () => {
  let state = step(initialThemeFlow, { type: 'select', id: 'new-theme' });
  state = step(state, { type: 'preview-ready', preview: preview('new-theme'), available: false });
  expect(step(state, { type: 'compose' }).stage).toBe('preview');
  state = step(state, { type: 'library', ids: ['new-theme'] });
  expect(step(state, { type: 'compose' }).stage).toBe('compose');
  const before = state.revision;
  state = step(state, { type: 'select', id: 'new-theme' });
  expect(state.revision).toBeGreaterThan(before);
  expect(state.ready).toBe(false);
});

it('换主题时保留上一份完整预览，等新正文到达后再整体替换', () => {
  let state = ready('moss-zen');
  const shown = state.preview;
  state = step(state, { type: 'preview-request' });
  expect(state.preview).toBe(shown);
  state = step(state, { type: 'select', id: 'mist-masthead' });
  // 正文区域不能先清空：清空会让文档变短，滚动位置被浏览器挤回页首。
  expect(state.preview).toBe(shown);
  expect(state.preview?.id).toBe('moss-zen');
  expect(state.pending).toBe(true);
  state = step(state, { type: 'preview-ready', preview: preview('mist-masthead'), available: true });
  expect(state.preview?.id).toBe('mist-masthead');
  expect(state.pending).toBe(false);
});

it('预览读取失败只结束等待，不顶掉已经显示的正文', () => {
  let state = ready('moss-zen');
  state = step(state, { type: 'select', id: 'mist-masthead' });
  const slow = step(state, { type: 'preview-ready', preview: preview('moss-zen'), available: true });
  expect(slow).toBe(state);
  const failed = step(state, { type: 'preview-failed' });
  expect(failed.preview?.id).toBe('moss-zen');
  expect(failed.pending).toBe(false);
  expect(step(failed, { type: 'compose' }).stage).toBe('preview');
});

it('主题库为空时清空正文，不留上一套主题的画面', () => {
  const state = step(ready('moss-zen'), { type: 'library', ids: [] });
  expect(state.id).toBe('');
  expect(state.preview).toBe(null);
  expect(state.pending).toBe(false);
});
