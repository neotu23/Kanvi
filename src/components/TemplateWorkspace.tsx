'use client';
import { useEffect,useState } from 'react';
import type { TemplateDetail } from '../features/templates/repository';
import type { TemplateSummary } from '../features/templates/handlers';
import { ArticlePreview } from './ArticlePreview';
import { CopyArticleButton } from './CopyArticleButton';
import { CopyHtmlButton } from './CopyHtmlButton';
import { nodes } from '../features/templates/schema';
import { articleDocument } from '../features/output/document';
const labels={draft:'设计草稿',checking:'正在检测','needs-fix':'需要修正','rule-passed':'规则检测通过',failed:'检测失败'};
const kindLabels:Record<string,string>={body:'正文',heading:'标题',quote:'引用',list:'列表',divider:'分隔线'};
async function api<T>(url:string,options:RequestInit={}):Promise<T>{const response=await fetch(url,{...options,cache:'no-store',signal:options.signal??AbortSignal.timeout(240000)});let value;try{value=await response.json();}catch{throw Error('本地服务未返回有效结果，请刷新重试。');}if(!response.ok)throw Error(value.error??'操作失败');return value;}
export function TemplateWorkspace({initialId,initialVersion}:{initialId?:string;initialVersion?:string}){
 const [items,setItems]=useState<TemplateSummary[]>([]),[detail,setDetail]=useState<TemplateDetail|null>(null),[parent,setParent]=useState<TemplateDetail|null>(null);
 const [busy,setBusy]=useState('正在读取本地模板…'),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const path=(id:string,version:string)=>`/api/templates/${encodeURIComponent(id)}/${encodeURIComponent(version)}`;
 async function select(id:string,version:string,signal?:AbortSignal){setDetail(null);setParent(null);const value=await api<TemplateDetail>(path(id,version),{signal});if(signal?.aborted)return;setDetail(value);if(value.record.parentVersion){const previous=await api<TemplateDetail>(path(id,value.record.parentVersion),{signal});if(!signal?.aborted)setParent(previous);}}
 useEffect(()=>{const controller=new AbortController();(async()=>{try{const value=await api<{templates:TemplateSummary[]}>('/api/templates',{signal:controller.signal});if(controller.signal.aborted)return;setItems(value.templates);if(initialId&&initialVersion)await select(initialId,initialVersion,controller.signal);}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'读取失败');}finally{if(!controller.signal.aborted)setBusy('');}})();return()=>controller.abort();},[initialId,initialVersion]);
 async function run(message:string,fn:()=>Promise<void>){if(busy)return;setBusy(message);setError('');setNotice('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{setBusy('');}}
 async function refresh(){const value=await api<{templates:TemplateSummary[]}>('/api/templates');setItems(value.templates);}
 async function check(repair:'none'|'local'|'ai'){if(!detail)return;const record=detail.record;await run(repair==='none'?'正在生成样例并检测…':'正在检测与局部修正，最多两轮…',async()=>{
  const value=await api<TemplateDetail&{repairError?:string;rounds:Array<{version:string}>}>(path(record.templateId,record.version)+'/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repair})});
  setDetail(value);setNotice(value.repairError??`本次完成 ${value.rounds.length} 次检测。`);setParent(null);if(value.record.parentVersion)setParent(await api<TemplateDetail>(path(record.templateId,value.record.parentVersion)));await refresh();
 });}
 function download(){if(!detail?.attempt)return;const link=document.createElement('a');const url=URL.createObjectURL(new Blob([articleDocument(detail.attempt.artifact.bodyHtml)],{type:'text/html;charset=utf-8'}));link.href=url;link.download=`kanvi-template-${detail.record.version.slice(0,8)}.html`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const selected=detail?.record;
 const changes=parent&&selected?nodes(selected.definition).map(node=>{const before=JSON.stringify(nodes(parent.record.definition).find(n=>n.id===node.id)?.styles),after=JSON.stringify(node.styles);return before!==after?{kind:node.id,before,after}:null;}).filter(x=>x!==null):[];
 return <main className="reference-workspace"><div className="reference-intro"><span className="eyebrow">模板工作台</span><h1>把风格留给下一篇</h1><p className="intro">从设计草稿生成样例，检查、修正并保存可复用版本。</p></div>
 <div className="reference-columns"><aside className="reference-sidebar"><section className="reference-card"><h2>本地模板与版本</h2><p className="local-note">在<a href="/references">参考风格</a>中选择一份设计草稿，点击“制作模板”。</p>
 <ul className="reference-list">{items.map(item=><li key={item.version}><button disabled={Boolean(busy)} aria-current={selected?.version===item.version?'true':undefined} onClick={()=>run('正在读取模板…',()=>select(item.templateId,item.version))}><strong>{item.name}</strong><span>{labels[item.status]} · {item.version.slice(0,8)}</span><span>{new Date(item.createdAt).toLocaleString('zh-CN')}</span></button></li>)}</ul>
 {!items.length&&<p className="muted">还没有模板。</p>}<button className="text-button" disabled={Boolean(busy)} onClick={()=>run('正在刷新列表…',refresh)}>刷新模板列表</button></section></aside>
 <section className="reference-detail" aria-busy={Boolean(busy)}><p role="status" className="status-message">{busy||notice}</p>{error&&<p className="error" role="alert">{error}</p>}
 {detail&&selected?<><section className="reference-card"><span className="eyebrow">{labels[detail.status]}</span><h2 className="reference-title">{selected.definition.name}</h2><p className="muted">版本 {selected.version.slice(0,8)} · 支持 {Object.keys(selected.definition.blocks).map(k=>kindLabels[k]).join('、')}{selected.definition.emphasis?'、行内强调':''}</p>
 <ul className="diagnostics">{selected.definition.notes.map((note,i)=><li key={i}>{note}</li>)}</ul><div className="template-actions"><button className="primary" disabled={Boolean(busy)} onClick={()=>check('none')}>生成样例并检测</button><button className="secondary" disabled={Boolean(busy)} onClick={()=>check('local')}>检测并尝试局部修正</button></div>
 <details className="evidence"><summary>使用 AI 辅助修正</summary><p>仅将可定位的模板行高、字号和补丁候选发送给 DeepSeek；不发送参考原文。只允许增加行高，最多修正两轮。需要服务端 API Key。</p><button className="secondary" disabled={Boolean(busy)} onClick={()=>check('ai')}>调用 DeepSeek 修正</button></details>
 <p className="local-note">检测通过后可复用这个版本。规则检测不保证所有公众号环境表现一致。</p>{detail.error&&<p className="warning">{detail.error}</p>}
 <details className="evidence"><summary>来源与版本记录</summary><p>来源参考：{selected.definition.source.referenceId}</p><p>设计分析：{selected.definition.source.analysisId}</p><p>模板指纹：{selected.definitionHash}</p><p>上个版本：{selected.parentVersion??'初始版本'}</p><p>节点证据：{JSON.stringify(selected.definition.evidence)}</p><p>区域语义映射：{JSON.stringify(selected.definition.regions)}</p><p>按语义生成的结构节点：{selected.definition.syntheticNodes.join('、')}</p></details>
 {parent&&<details className="evidence"><summary>与上个版本的样式差异</summary>{changes.map(change=><div key={change.kind}><strong>{kindLabels[change.kind]??change.kind}</strong><p>修正前：{change.before}</p><p>修正后：{change.after}</p></div>)}<button className="text-button" disabled={Boolean(busy)} onClick={()=>run('正在读取上个版本…',()=>select(parent.record.templateId,parent.record.version))}>查看上个版本及检测记录</button></details>}
 </section>
 {detail.attempt&&<section className="reference-card"><h2>本版本的样例</h2><div className="paper"><ArticlePreview html={detail.attempt.artifact.bodyHtml}/></div>
 {detail.check&&<><p className={detail.status==='rule-passed'?'muted':'warning'}>{detail.check.error??(detail.status==='rule-passed'?'样例在当前规则下未发现问题。':'样例仍有排版问题，请查看诊断。')}</p>{detail.check.issues.map((issue,i)=><div className="issue" key={i}><strong>{issue.rule}</strong><p>{issue.message}</p>{issue.outerHTML&&<details><summary>节点证据</summary><code>{issue.outerHTML}</code></details>}</div>)}{detail.check.warnings?.map((w,i)=><p className="warning" key={i}>{w}</p>)}</>}
 <div className="output-actions">{detail.status==='rule-passed'&&!busy&&<CopyArticleButton key={detail.attempt.artifact.htmlHash} artifact={detail.attempt.artifact}/>}<div className="output-row"><button className="secondary" disabled={Boolean(busy)} onClick={download}>下载 HTML{detail.status==='rule-passed'?'':'（未通过检测）'}</button><CopyHtmlButton html={articleDocument(detail.attempt.artifact.bodyHtml)} disabled={Boolean(busy)}/></div></div>
 <details className="evidence"><summary>样例检测绑定</summary><p>正文指纹：{detail.attempt.artifact.htmlHash}</p><p>检查器版本：{detail.check?.checkerCommit??'尚未返回'}</p></details></section>}</>:!busy&&<div className="reference-empty"><h2>选择一个模板版本</h2><p>从左侧打开，或先从参考设计制作模板。</p></div>}
 </section></div></main>;
}
