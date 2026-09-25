'use client';
import { useEffect, useRef, useState } from 'react';

/** 只接收服务端生成的受限预览；允许父页读尺寸，始终禁止 iframe 脚本。 */
export function ThemePreview({ html }: { html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const cleanup = useRef<() => void>(() => {});
  const [height, setHeight] = useState(1);
  useEffect(() => () => cleanup.current(), []);

  function measureOnLoad() {
    cleanup.current();
    const body = frame.current?.contentDocument?.body;
    if (!body) return;
    let pending = 0;
    let active = true;
    const measure = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        if (active) setHeight(Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().height)) + 2);
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    measure();
    void body.ownerDocument.fonts.ready.then(() => { if (active) measure(); });
    cleanup.current = () => { active = false; observer.disconnect(); cancelAnimationFrame(pending); };
  }

  return <iframe ref={frame} className="theme-preview-frame" title="主题完整文章预览" sandbox="allow-same-origin" scrolling="no" srcDoc={html} onLoad={measureOnLoad} style={{ height }} />;
}
