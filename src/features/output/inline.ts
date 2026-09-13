import juice from 'juice';
import type { Inliner } from './contracts';
export const inline: Inliner = (html, css) => {
  try {
    return { ok: true, html: juice.inlineContent(html, css, { preserveImportant: true, inlinePseudoElements: false }) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '样式内联失败' };
  }
};
