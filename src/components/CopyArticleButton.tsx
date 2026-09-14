'use client';
import { useState } from 'react';
import type { OutputArtifact } from '../features/output/contracts';
import { buildClipboardPayload } from '../features/output/clipboard';
export function CopyArticleButton({artifact}:{artifact:OutputArtifact}) {
 const [message,setMessage]=useState('');
 async function copy() {
  try {
   if(!navigator.clipboard?.write || typeof ClipboardItem==='undefined') throw new Error('当前浏览器不支持带格式复制，请改用 Chrome 或下载 HTML 后选中正文复制。');
   const payload=buildClipboardPayload(artifact);
   await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([payload.html],{type:'text/html'}),'text/plain':new Blob([payload.text],{type:'text/plain'})})]);
   setMessage('已复制带格式正文，请粘贴到公众号检查。');
  } catch(error) {setMessage(error instanceof Error?`复制失败：${error.message}`:'复制失败，请检查浏览器剪贴板权限。');}
 }
 return <div><button className="primary" onClick={copy}>复制到公众号 <span aria-hidden="true">↗</span></button><p role="status" className="copy-message">{message}</p></div>;
}
