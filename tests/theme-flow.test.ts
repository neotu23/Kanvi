import { expect, it } from 'vitest';
import { initialThemeFlow, themeFlowReducer as step } from '../src/features/themes/workspace-flow';

it('已保存主题在预览加载成功后可直接进入正文生成', () => {
  let state = step(initialThemeFlow, { type: 'select', id: 'moss-zen' });
  expect(step(state, { type: 'compose' }).stage).toBe('preview');
  state = step(state, { type: 'loaded', id: 'moss-zen', available: true });
  expect(step(state, { type: 'compose' }).stage).toBe('compose');
});

it('切主题需等新预览加载，旧回包和未保存草案不能开放正文入口', () => {
  let state = step(initialThemeFlow, { type: 'select', id: 'moss-zen' });
  state = step(state, { type: 'loaded', id: 'moss-zen', available: true });
  state = step(state, { type: 'compose' });
  state = step(state, { type: 'select', id: 'mist-masthead' });
  expect(state.stage).toBe('preview');
  expect(state.ready).toBe(false);
  state = step(state, { type: 'loaded', id: 'moss-zen', available: true });
  expect(step(state, { type: 'compose' }).stage).toBe('preview');
  state = step(state, { type: 'loaded', id: 'mist-masthead', available: false });
  expect(step(state, { type: 'compose' }).stage).toBe('preview');
});

it('草案保存入库后可直接使用；重新选择同一主题可以重试预览', () => {
  let state = step(initialThemeFlow, { type: 'select', id: 'new-theme' });
  state = step(state, { type: 'loaded', id: 'new-theme', available: false });
  expect(step(state, { type: 'compose' }).stage).toBe('preview');
  state = step(state, { type: 'library', ids: ['new-theme'] });
  expect(step(state, { type: 'compose' }).stage).toBe('compose');
  const before = state.revision;
  state = step(state, { type: 'select', id: 'new-theme' });
  expect(state.revision).toBeGreaterThan(before);
  expect(state.ready).toBe(false);
});
