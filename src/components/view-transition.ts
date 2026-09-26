/** 换正文时的过渡编排：浏览器支持 View Transitions 就交给它做交叉淡化，
 *  不支持的浏览器（Safari/Firefox）与低动效偏好交给调用方自己的淡出淡入。 */

/** 只用到我们需要的两件事，避免依赖各版本 DOM 类型声明。 */
export interface NativeViewTransition { finished: Promise<unknown>; skipTransition(): void }
export interface ViewTransitionEnv {
  /** document.startViewTransition；缺失表示浏览器不支持。 */
  start?: (update: () => Promise<void>) => NativeViewTransition;
  /** 用户要求减少动效。 */
  reducedMotions: boolean;
}
export interface SwapStep {
  /** 同步把新正文放进 DOM（React 里必须用 flushSync，否则浏览器抓到的还是旧画面）。 */
  apply: () => void;
  /** 等到新正文渲染完成、高度量好；浏览器会等它结束才抓取新画面。 */
  settle: () => Promise<void>;
}
export interface PreviewSwapper {
  /** 是否走浏览器原生过渡；false 时调用方自己淡出淡入。 */
  native: boolean;
  /** 换一次正文；上一次没结束的过渡会被跳过。 */
  run: (step: SwapStep) => Promise<void>;
  /** 组件卸载时收尾。 */
  cancel: () => void;
}

export function readViewTransitionEnv(): ViewTransitionEnv {
  const target = typeof document === 'undefined' ? undefined : (document as Document & { startViewTransition?: unknown });
  const start = typeof target?.startViewTransition === 'function'
    ? (target.startViewTransition as (update: () => Promise<void>) => NativeViewTransition).bind(target)
    : undefined;
  const query = typeof window === 'undefined' ? undefined : window.matchMedia?.('(prefers-reduced-motion: reduce)');
  return { start, reducedMotions: query?.matches === true };
}

export function createPreviewSwapper(env: ViewTransitionEnv): PreviewSwapper {
  const native = Boolean(env.start) && !env.reducedMotions;
  let active: NativeViewTransition | null = null;
  async function run({ apply, settle }: SwapStep): Promise<void> {
    if (!native || !env.start) { apply(); return; }
    active?.skipTransition();
    const transition = env.start(async () => { apply(); await settle(); });
    active = transition;
    try {
      // 过渡被跳过或被打断都不影响正文已经换好，所以这里只等它收尾。
      await transition.finished;
    } catch {
      /* 抓取新状态失败时浏览器会放弃过渡，正文仍是最新的 */
    } finally {
      if (active === transition) active = null;
    }
  }
  return { native, run, cancel: () => { active?.skipTransition(); active = null; } };
}
