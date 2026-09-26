'use client';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createPreviewSwapper, readViewTransitionEnv, type PreviewSwapper } from './view-transition';

interface ThemePreviewProps {
  html: string;
  /** 正在换新正文：不支持原生过渡时，用它先把旧正文淡出。 */
  pending?: boolean;
  /** 高度测量完成后回调，供页面在正文变长变短时守住滚动位置。 */
  onHeightChange?: (height: number) => void;
}
/** 抓取新画面前的等待上限，避免 iframe 异常时把页面一直冻在旧画面上。 */
const SETTLE_TIMEOUT = 800;

/** 只接收服务端生成的受限预览；允许父页读尺寸，始终禁止 iframe 脚本。
 *  正文切换优先交给浏览器原生视图过渡做交叉淡化（旧正文淡出、新正文淡入，中间不出现空白）；
 *  不支持的浏览器退回组件自己的淡出淡入，两种情况都复用同一个 iframe 并保留上一次高度，
 *  正文区域不会先塌陷再长回来，页面滚动位置也就不再被拉回顶部。 */
export function ThemePreview({ html, pending = false, onHeightChange }: ThemePreviewProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const cleanup = useRef<() => void>(() => {});
  const notify = useRef(onHeightChange);
  notify.current = onHeightChange;
  const measured = useRef(1);
  const settle = useRef<(() => void) | null>(null);
  const swapper = useRef<PreviewSwapper | null>(null);
  const [height, setHeight] = useState(1);
  const [loading, setLoading] = useState(true);
  /** 真正渲染出来的正文；切换成功前一直是上一套，避免中途出现空白。 */
  const [shown, setShown] = useState(html);

  useEffect(() => {
    const swap = createPreviewSwapper(readViewTransitionEnv());
    swapper.current = swap;
    return () => { swap.cancel(); settle.current?.(); };
  }, []);

  useEffect(() => {
    if (shown === html) return;
    const next = html;
    const swap = swapper.current;
    if (!swap?.native) { setLoading(true); setShown(next); return; }
    void swap.run({ apply: () => flushSync(() => setShown(next)), settle: () => waitForFrame() });
  }, [html, shown]);

  function waitForFrame(): Promise<void> {
    settle.current?.(); // 上一次等待直接结束，避免悬挂
    return new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); settle.current = null; resolve(); };
      const timer = setTimeout(finish, SETTLE_TIMEOUT);
      settle.current = finish;
    });
  }

  function measureOnLoad() {
    cleanup.current();
    const body = frame.current?.contentDocument?.body;
    if (!body) { setLoading(false); settle.current?.(); return; }
    let raf = 0;
    let active = true;
    const measure = () => {
      const next = Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().height)) + 2;
      if (measured.current !== next) { measured.current = next; setHeight(next); notify.current?.(next); }
    };
    // iframe 加载完时布局已经算好：先同步量一次，原生过渡要在抓取新画面之前拿到新高度。
    measure();
    setLoading(false);
    settle.current?.();
    const track = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (active) measure(); }); };
    const observer = new ResizeObserver(track);
    observer.observe(body);
    void body.ownerDocument.fonts.ready.then(() => { if (active) measure(); });
    cleanup.current = () => { active = false; observer.disconnect(); cancelAnimationFrame(raf); };
  }

  // 原生过渡期间由浏览器负责淡入淡出，这里不再叠加自己的透明度变化（那会被抓进新画面）。
  const busy = loading || (pending && !swapper.current?.native);
  return <iframe ref={frame} className={`theme-preview-frame${busy ? ' is-loading' : ''}`} title="主题完整文章预览" sandbox="allow-same-origin" scrolling="no" srcDoc={shown} onLoad={measureOnLoad} style={{ height }} />;
}
