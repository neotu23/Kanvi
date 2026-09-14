'use client';
import { useState } from 'react';
import type { OutputArtifact } from '../features/output/contracts';
import type { CheckReport } from '../features/validation/normalize-report';
import { articleDocument } from '../features/output/document';
import { ArticlePreview } from './ArticlePreview';
import { CopyArticleButton } from './CopyArticleButton';
type Result={artifact:OutputArtifact;check:CheckReport};
export function ValidationDemo() {
 const [result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function generate() {
  setBusy(true);setError('');setResult(null);
  try {
   const response=await fetch('/api/preview',{method:'POST'});
   const data=await response.json();
   if(!response.ok) throw new Error(data.error||'生成失败');
   if(data.check.htmlHash!==data.artifact.htmlHash) throw new Error('检测结果与正文不一致，请重新生成。');
   setResult(data);
  } catch(e) {setError(e instanceof Error?e.message:'请求失败');}
  finally {setBusy(false);}
 }
 function download() {
  if(!result)return;
  const url=URL.createObjectURL(new Blob([articleDocument(result.artifact.bodyHtml)],{type:'text/html;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='kanvi-sample.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const passed=result?.check.status==='passed';
 return <main className="workspace">
  <section className="controls">
   <h1>让文字，<br/>有自己的样子。</h1>
   <p className="intro">先用一篇小日记，走通排版、检测与复制。<br/>保留文字，也保留你喜欢的留白。</p>
   <div className="sample-info"><span>本次样例</span><h2>周末记录</h2><p>暖棕标题边框 · 舒展行距 · 浅色引用</p></div>
   <button className="primary" disabled={busy} onClick={generate}>{busy?'正在生成与检测…':result?'重新生成样例':'生成并检测样例'} <span aria-hidden="true">→</span></button>
   <p className="local-note">本阶段使用自写样例，不调用 AI。所有输出保存在本地。</p>
   <div aria-live="polite">
    {error ? <p className="error">{error}</p> : null}
    {result ? <section className="check-report"><h2>{passed?'规则检测通过':result.check.status==='violations'?'有排版问题需要调整':'检测未完成'}</h2>
     <p>{passed?'当前规则未发现问题。请继续在公众号中保存草稿、检查手机预览。':result.check.error||'请查看下面的规则提示。'}</p>
     {result.check.issues.map((issue,i)=><div className="issue" key={i}><strong>{issue.rule}</strong><p>{issue.message}</p>{issue.paragraphIndex!==undefined?<small>段落索引：{issue.paragraphIndex}</small>:null}{issue.outerHTML?<details><summary>节点证据</summary><code>{issue.outerHTML}</code></details>:null}</div>)}
     {result.check.warnings?.map((w,i)=><p className="warning" key={i}>{w}</p>)}
     <div className="output-actions">{passed?<CopyArticleButton key={result.artifact.htmlHash} artifact={result.artifact}/>:null}<button className="secondary" onClick={download}>下载 HTML{passed?'':'（未通过检测）'}</button></div>
     <details className="evidence"><summary>检测记录</summary><p>检查版本：{result.check.checkerCommit}</p><p>正文指纹：{result.artifact.htmlHash}</p><p>公众号实测：待确认</p></details>
    </section>:null}
   </div>
  </section>
  <section className="preview-area" aria-label="预览区域"><div className="preview-heading"><h2>文章预览</h2><span>手机宽度</span></div><div className="paper">{result?<ArticlePreview html={result.artifact.bodyHtml}/>:<div className="empty-preview"><span aria-hidden="true">文</span><p>{busy?'正在准备你的样例…':'你的文字，会在这里展开。'}</p><small>生成后即可查看最终排版</small></div>}</div><p className="preview-note">预览、检测、下载与复制共用同一份正文。</p></section>
 </main>;
}
