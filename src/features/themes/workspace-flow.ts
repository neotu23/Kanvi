export interface ThemeFlow { id: string; revision: number; ready: boolean; available: boolean; stage: 'preview' | 'compose' }
export type ThemeFlowAction = { type: 'select'; id: string } | { type: 'library'; ids: string[] } | { type: 'loaded'; id: string; available: boolean } | { type: 'compose' | 'back' };
export const initialThemeFlow: ThemeFlow = { id: '', revision: 0, ready: false, available: false, stage: 'preview' };
export function themeFlowReducer(state: ThemeFlow, action: ThemeFlowAction): ThemeFlow {
  switch (action.type) {
    case 'select': return { ...initialThemeFlow, id: action.id, revision: state.revision + 1 };
    case 'library': return action.ids.includes(state.id) ? { ...state, available: state.ready } : { ...initialThemeFlow, id: action.ids[0] ?? '', revision: state.revision + 1 };
    case 'loaded': return action.id === state.id ? { ...state, ready: true, available: action.available } : state;
    case 'compose': return state.ready && state.available ? { ...state, stage: 'compose' } : state;
    case 'back': return { ...state, stage: 'preview' };
  }
}
