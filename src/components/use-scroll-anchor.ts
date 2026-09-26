'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** 服务端渲染时退化成 useEffect，避免 useLayoutEffect 的 SSR 警告。 */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** 换主题后正文高度会变，文档变短时浏览器会把页面挤回顶部。
 *  这里记住点击那一刻的滚动位置，等新正文测量完成、绘制之前再放回去；
 *  超出 ttl 就不再干预，用户之后的滚动不受影响。 */
export function useScrollAnchor(ttl = 3000) {
  const anchor = useRef<{ y: number; at: number } | null>(null);
  const [height, setHeight] = useState(0);
  useBrowserLayoutEffect(() => {
    const saved = anchor.current;
    if (!saved) return;
    if (Date.now() - saved.at > ttl) { anchor.current = null; return; }
    if (Math.abs(window.scrollY - saved.y) > 1) window.scrollTo(0, saved.y);
  }, [height, ttl]);
  return {
    /** 在切换内容之前调用，记住当前滚动位置。 */
    hold: () => { anchor.current = { y: window.scrollY, at: Date.now() }; },
    /** 传给 ThemePreview：正文高度变化时重新对齐滚动位置。 */
    setHeight,
  };
}
