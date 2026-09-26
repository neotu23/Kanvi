/** 服务端生成的完整文章预览（受限 HTML）。 */
export interface ThemePreviewData { id: string; html: string; source: string; markdown: string }
export interface ThemeFlow {
  id: string;
  revision: number;
  ready: boolean;
  available: boolean;
  stage: 'preview' | 'compose';
  /** 最近一次成功读取的预览。切换主题时保留旧值，避免正文区域瞬间塌陷、把滚动位置拉回页首。 */
  preview: ThemePreviewData | null;
  /** 正在读取新预览：旧预览继续显示，等新内容到达后整体替换。 */
  pending: boolean;
}
export type ThemeFlowAction =
  | { type: 'select'; id: string }
  | { type: 'library'; ids: string[] }
  | { type: 'preview-request' }
  | { type: 'preview-ready'; preview: ThemePreviewData; available: boolean }
  | { type: 'preview-failed' }
  | { type: 'preview-idle' }
  | { type: 'compose' | 'back' };
export const initialThemeFlow: ThemeFlow = { id: '', revision: 0, ready: false, available: false, stage: 'preview', preview: null, pending: false };
export function themeFlowReducer(state: ThemeFlow, action: ThemeFlowAction): ThemeFlow {
  switch (action.type) {
    case 'select': return { ...state, id: action.id, revision: state.revision + 1, ready: false, available: false, stage: 'preview', pending: true };
    case 'library': {
      if (action.ids.includes(state.id)) return { ...state, available: state.ready };
      const next = action.ids[0] ?? '';
      return next
        ? { ...state, id: next, revision: state.revision + 1, ready: false, available: false, stage: 'preview', pending: true }
        : { ...state, id: '', ready: false, available: false, stage: 'preview', preview: null, pending: false };
    }
    case 'preview-request': return { ...state, pending: true };
    case 'preview-ready': return action.preview.id === state.id ? { ...state, preview: action.preview, pending: false, ready: true, available: action.available } : state;
    case 'preview-failed': return { ...state, pending: false };
    case 'preview-idle': return { ...state, preview: null, pending: false, ready: false, available: false };
    case 'compose': return state.ready && state.available ? { ...state, stage: 'compose' } : state;
    case 'back': return { ...state, stage: 'preview' };
  }
}
