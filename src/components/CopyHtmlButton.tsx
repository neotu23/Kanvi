'use client';
import { useState } from 'react';
import { writeHtmlSource } from '../features/output/clipboard';
export function CopyHtmlButton({html,disabled=false}:{html:string;disabled?:boolean}) {
 const [message,setMessage]=useState('');
 async function copy() {
  try {
   if(!navigator.clipboard?.writeText) throw new Error('当前浏览器不支持写入剪贴板，请改用下载 HTML。');
   await writeHtmlSource(navigator.clipboard,html);
   setMessage('已复制完整 HTML 源码，可直接粘贴保存。');
  } catch(error) {setMessage(error instanceof Error?`复制失败：${error.message}`:'复制失败，请检查浏览器剪贴板权限。');}
 }
 return <div className="copy-action"><button className="secondary" disabled={disabled} onClick={copy}>复制全文</button><p role="status" className="copy-message">{message}</p></div>;
}
