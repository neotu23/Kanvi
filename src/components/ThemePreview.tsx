'use client';
import { useEffect, useRef, useState } from 'react';

interface ThemePreviewProps {
  html: string;
  /** 正在换新正文：旧正文先淡出，等新正文渲染完成再淡入。 */
  pending?: boolean;
  /** 高度测量完成后回调，供页面在正文变长变短时守住滚动位置。 */
  onHeightChange?: (height: number) => void;
}
/** 只接收服务端生成的受限预览；允许父页读尺寸，始终禁止 iframe 脚本。
 *  切换内容时复用同一个 iframe 并保留上一次高度：正文区域不会先塌陷再长回来，页面滚动位置也就不再被拉回顶部。 */
export function ThemePreview({ html, pending = false, onHeightChange }: ThemePreviewProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const cleanup = useRef<() => void>(() => {});
  const notify = useRef(onHeightChange);
  notify.current = onHeightChange;
  const measured = useRef(1);
  const [height, setHeight] = useState(1);
  const [loading, setLoading] = useState(true);
  const source = useRef(html);
  // 内容变了就在这次渲染里重回加载态，避免旧正文闪一下再淡入。
  if (source.current !== html) { source.current = html; if (!loading) setLoading(true); }
  useEffect(() => () => cleanup.current(), []);

  function measureOnLoad() {
    cleanup.current();
    const body = frame.current?.contentDocument?.body;
    if (!body) { setLoading(false); return; }
    let raf = 0;
    let active = true;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!active) return;
        const next = Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().height)) + 2;
        if (measured.current !== next) { measured.current = next; setHeight(next); notify.current?.(next); }
        setLoading(false);
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    measure();
    void body.ownerDocument.fonts.ready.then(() => { if (active) measure(); });
    cleanup.current = () => { active = false; observer.disconnect(); cancelAnimationFrame(raf); };
  }

  const busy = loading || pending;
  return <iframe ref={frame} className={`theme-preview-frame${busy ? ' is-loading' : ''}`} title="主题完整文章预览" sandbox="allow-same-origin" scrolling="no" srcDoc={html} onLoad={measureOnLoad} style={{ height }} />;
}
