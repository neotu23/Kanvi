'use client';
import { useEffect, useRef, useState } from 'react';
import type { PreparedArticle } from '../features/articles/handlers';
import type { ArticleDetail, ArticleSummary } from '../features/articles/repository';
import { ArticlePreview } from './ArticlePreview';
import { CopyArticleButton } from './CopyArticleButton';
import { articleDocument } from '../features/output/document';
const labels={checking:'检测中',failed:'检测失败','needs-fix':'需调整','rule-passed':'规则检测通过'};
type History={articles:ArticleSummary[];nextCursor:string|null};
async function api<T>(path:string,signal:AbortSignal,body?:unknown):Promise<T>{
 const response=await fetch(`/api/articles${path}`,{signal,...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
 const value=await response.json();if(!response.ok)throw Error(value.error??'请求失败，请重试。');return value;
}
export function ArticleWorkspace(){
 const [markdown,setMarkdown]=useState(''),[filename,setFilename]=useState(''),[prepared,setPrepared]=useState<PreparedArticle|null>(null),[selected,setSelected]=useState('');
 const [detail,setDetail]=useState<ArticleDetail|null>(null),[history,setHistory]=useState<History>({articles:[],nextCursor:null});
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>{
  const c=new AbortController();controller.current=c;setBusy('正在读取本地历史…');
  api<History>('',c.signal).then(setHistory).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(controller.current===c){controller.current=null;setBusy('');}});
  return ()=>{c.abort();controller.current?.abort();};
 },[]);
 async function run(label:string,work:(signal:AbortSignal)=>Promise<void>){
  if(controller.current)return;const c=new AbortController();controller.current=c;setBusy(label);setError('');
  try{await work(AbortSignal.any([c.signal,AbortSignal.timeout(120000)]));}
  catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'操作失败。');}
  finally{if(controller.current===c){controller.current=null;setBusy('');}}
 }
 function importFile(file:File){void run('正在解析 Markdown…',async signal=>{
  setPrepared(null);setDetail(null);setSelected('');setMarkdown('');setFilename(file.name);
  if(!/\.md(?:own)?$/i.test(file.name)&&!/\.markdown$/i.test(file.name))throw Error('请选择 Markdown 文件。');
  if(file.size>256*1024)throw Error('文档超过 256 KiB，请拆分后导入。');
  let source;try{source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());}catch{throw Error('文档不是有效 UTF-8 编码。');}
  const data=await api<PreparedArticle>('/parse',signal,{markdown:source});
  if(signal.aborted)return;setMarkdown(source);setPrepared(data);
 });}
 function generate(){if(!prepared)return;const template=prepared.templates.find(t=>t.version===selected&&t.eligible);if(!template)return;
  void run('正在生成正文并独立检测…',async signal=>{
   setDetail(null);const value=await api<ArticleDetail>('',signal,{markdown,templateId:template.templateId,version:template.version});setDetail(value);setHistory(await api<History>('',signal));
  });
 }
 function download(){if(!detail)return;const url=URL.createObjectURL(new Blob([articleDocument(detail.record.artifact.bodyHtml)],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`kanvi-${detail.record.id.slice(0,8)}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const blocked=prepared?.parsed.diagnostics.some(d=>d.severity==='error');
 return <main className="reference-workspace"><div className="reference-intro"><span className="eyebrow">文章生成</span><h1>把自己的文字，放进喜欢的风格</h1><p className="intro">导入单篇 Markdown，手选模板，保留原文生成正文。</p></div>
  <div className="reference-columns"><aside className="reference-sidebar"><section className="reference-card"><h2>导入文档</h2><label className="file-picker">选择 Markdown 文件<input type="file" accept=".md,.markdown,text/markdown" disabled={Boolean(busy)} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)importFile(file);}}/></label><p className="local-note">UTF-8，最多 256 KiB。文件在本机解析，不发送到 AI；成功生成的原文与历史保存在 data/articles/。</p>{filename&&<p>{filename}</p>}</section>
   <section className="reference-card"><h2>本地文章历史</h2><ul className="reference-list">{history.articles.map(item=><li key={item.id}><button disabled={Boolean(busy)} aria-current={detail?.record.id===item.id?'true':undefined} onClick={()=>run('正在读取文章…',async signal=>{setDetail(await api<ArticleDetail>('/'+item.id,signal));})}><strong>{item.title}</strong><span>{labels[item.status]} · {item.templateName}</span><span>{new Date(item.createdAt).toLocaleString('zh-CN')}</span></button></li>)}</ul>
   {!history.articles.length&&<p className="muted">还没有生成记录。</p>}<button className="text-button" disabled={Boolean(busy)} onClick={()=>run('正在刷新历史…',async s=>setHistory(await api<History>('',s)))}>刷新历史</button>
   {history.nextCursor&&<button className="text-button" disabled={Boolean(busy)} onClick={()=>run('正在读取更多记录…',async s=>{const next=await api<History>('?after='+history.nextCursor,s);setHistory(old=>({articles:[...old.articles,...next.articles],nextCursor:next.nextCursor}));})}>加载更多</button>}</section></aside>
   <section className="reference-detail" aria-busy={Boolean(busy)}><p role="status" className="status-message">{busy}</p>{error&&<p role="alert" className="error">{error}</p>}
   {prepared&&<section className="reference-card"><h2>{prepared.parsed.metadata.title??'已导入文档'}</h2><p className="muted">{prepared.parsed.blocks.length} 个内容块 · {prepared.parsed.metadata.date??''} · {prepared.parsed.metadata.tags?.join('、')??''}</p>
    {prepared.parsed.diagnostics.length>0&&<ul className="diagnostics">{prepared.parsed.diagnostics.map((d,i)=><li key={i} className={d.severity==='error'?'error':'warning'}>第 {d.line} 行，第 {d.column} 列：{d.message}</li>)}</ul>}
    <label>选择模板版本<select disabled={Boolean(busy)||Boolean(blocked)} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">请选择模板</option>{prepared.templates.filter(t=>t.eligible).map(t=><option key={t.version} value={t.version}>{t.name} · {t.version.slice(0,8)}</option>)}</select></label>
    {!prepared.templates.some(t=>t.eligible)&&<p className="warning">暂无适配且样例规则通过的模板。请处理文档诊断，或前往<a href="/templates">模板工作台</a>检测对应模板。</p>}
    <details className="evidence"><summary>模板筛选原因与原文位置</summary>{prepared.templates.filter(t=>!t.eligible).map(t=><p key={t.version}>{t.name}（{t.version.slice(0,8)}）：{t.reasons.join(' ')}</p>)}{prepared.parsed.sources.map(s=><details key={s.blockId}><summary>第 {s.line} 行 · {s.blockId}</summary><pre className="source-excerpt">{s.sourceText}</pre></details>)}</details>
    <button className="primary" disabled={Boolean(busy)||Boolean(blocked)||!selected} onClick={generate}>生成并检测本篇</button><p className="local-note">使用模板不代表本篇已通过检测。检测失败仍保留历史，不自动改动模板或原文。</p>
   </section>}
   {detail&&<section className="reference-card"><span className="eyebrow">{labels[detail.status]}</span><h2>{detail.record.parsed.metadata.title??'生成的正文'}</h2><p className="muted">{detail.record.template.record.definition.name} · {detail.record.template.record.version.slice(0,8)} · {new Date(detail.record.createdAt).toLocaleString('zh-CN')}</p><div className="paper"><ArticlePreview html={detail.record.artifact.bodyHtml}/></div>
    {detail.error&&<p className="error">{detail.error}</p>}{detail.check?.error&&<p className="error">{detail.check.error}</p>}{detail.check?.issues.map((issue,i)=><div className="issue" key={i}><strong>{issue.rule}</strong><p>{issue.message}</p>{issue.outerHTML&&<details><summary>节点证据</summary><code>{issue.outerHTML}</code></details>}</div>)}{detail.check?.warnings?.map((w,i)=><p className="warning" key={i}>{w}</p>)}
    <div className="output-actions">{detail.status==='rule-passed'&&!busy&&<CopyArticleButton key={detail.record.artifact.htmlHash} artifact={detail.record.artifact}/>}<button className="secondary" disabled={Boolean(busy)} onClick={download}>下载 HTML{detail.status==='rule-passed'?'':'（未通过检测）'}</button></div>
    <p className="local-note">规则检测不是公众号实际兼容保证。原文、模板版本和本篇报告已分别保存。</p><details className="evidence"><summary>本篇检测记录</summary><p>原文指纹：{detail.record.parsed.sourceHash}</p><p>正文指纹：{detail.record.artifact.htmlHash}</p><p>检查器版本：{detail.check?.checkerCommit??'未完成'}</p><p>解析版本：{detail.record.parsed.parserVersion}</p><pre className="source-excerpt">{detail.record.markdown}</pre></details>
   </section>}
   {!prepared&&!detail&&!busy&&<div className="reference-empty"><h2>从一篇日记开始</h2><p>选择本机 Markdown 文件。无需配置 AI，即可使用已通过样例检测的模板。</p></div>}
   </section></div></main>;
}
