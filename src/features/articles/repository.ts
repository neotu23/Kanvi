import { randomUUID } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ReferenceError } from '../references/contracts';
import { publishRecord } from '../references/repository';
import { TemplateRepository, hash, checkedReport, type TemplateDetail, type TemplateVersion, type CheckAttempt } from '../templates/repository';
import { validateTemplate, uuid } from '../templates/schema';
import { renderTemplate, sampleBlocks } from '../templates/render';
import type { OutputArtifact } from '../output/contracts';
import type { CheckReport } from '../validation/normalize-report';
import { parseMarkdown, parserVersion, type ParsedMarkdown } from './parse-markdown';
import { templateEligibility } from './eligibility';
export interface ArticleRecord {
 schemaVersion:1;id:string;createdAt:string;markdown:string;parsed:ParsedMarkdown;
 template:{record:TemplateVersion;attempt:CheckAttempt;check:CheckReport};artifact:OutputArtifact;
}
export interface ArticleDetail {record:ArticleRecord;status:'checking'|'failed'|'needs-fix'|'rule-passed';check?:CheckReport;error?:string}
export interface ArticleSummary {id:string;createdAt:string;title:string;templateName:string;templateVersion:string;status:ArticleDetail['status']}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const assertId=(id:string)=>{if(typeof id!=='string'||!uuid.test(id))throw new ReferenceError('invalid-id','文章 ID 无效。',400);};
const maxRecordBytes=8*1024*1024;
async function read(path:string){if((await stat(path)).size>maxRecordBytes)throw Error('oversized article');return JSON.parse(await readFile(path,'utf8'));}
function validateRecord(raw:ArticleRecord,id:string):ArticleRecord {
 if(!raw||raw.schemaVersion!==1||raw.id!==id||typeof raw.createdAt!=='string'||!Number.isFinite(Date.parse(raw.createdAt))||raw.parsed?.parserVersion!==parserVersion)throw Error('invalid article');
 const parsed=parseMarkdown(raw.markdown);if(!same(parsed,raw.parsed)||parsed.diagnostics.some(d=>d.severity==='error'))throw Error('source mismatch');
 const t=raw.template?.record,a=raw.template?.attempt;
 if(!t||!uuid.test(t.templateId)||!uuid.test(t.version)||typeof t.createdAt!=='string'||!Number.isFinite(Date.parse(t.createdAt))||(t.parentVersion!==null&&!uuid.test(t.parentVersion)))throw Error('invalid template');
 const definition=validateTemplate(t.definition);
 if(hash(JSON.stringify(definition))!==t.definitionHash||!a||!uuid.test(a.id)||a.version!==t.version||a.definitionHash!==t.definitionHash||typeof a.createdAt!=='string'||!Number.isFinite(Date.parse(a.createdAt)))throw Error('template mismatch');
 if(!same(renderTemplate(definition,sampleBlocks(definition)),a.artifact))throw Error('sample mismatch');
 const sample=checkedReport(raw.template.check,a.artifact);if(sample.status!=='passed')throw Error('sample not passed');
 if(!templateEligibility(parsed,{...raw.template,status:'rule-passed'}).eligible)throw Error('ineligible');
 if(!same(renderTemplate(definition,parsed.blocks),raw.artifact))throw Error('article mismatch');
 return raw;
}
export class ArticleRepository {
 private active=new Set<string>();
 constructor(private root=resolve('data/articles'),private templates=new TemplateRepository()){}
 async create(markdown:string,templateId:string,version:string):Promise<ArticleRecord>{
  const parsed=parseMarkdown(markdown);
  if(parsed.diagnostics.some(d=>d.severity==='error'))throw new ReferenceError('markdown-diagnostics','文档有未处理的语法问题，请先查看导入诊断。',422);
  const template=await this.templates.detail(templateId,version);
  const eligibility=templateEligibility(parsed,template);if(!eligibility.eligible)throw new ReferenceError('template-ineligible',eligibility.reasons.join(' '),422);
  const record:ArticleRecord={schemaVersion:1,id:randomUUID(),createdAt:new Date().toISOString(),markdown,parsed,template:{record:template.record,attempt:template.attempt!,check:template.check!},artifact:renderTemplate(template.record.definition,parsed.blocks)};
  try{
   if(Buffer.byteLength(JSON.stringify(record))>maxRecordBytes)throw Error('large article');
   if(!await publishRecord(this.root,record.id,'article.json',record))throw Error('immutable');
   this.active.add(record.id);return record;
  }catch{throw new ReferenceError('article-write','文章保存失败或输出过大，未覆盖历史。',500);}
 }
 private async record(id:string):Promise<ArticleRecord>{
  assertId(id);const dir=join(this.root,id);
  try{await stat(dir);return validateRecord(await read(join(dir,'article.json')),id);}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'&&(e as NodeJS.ErrnoException).path===dir)throw new ReferenceError('not-found','未找到文章。',404);throw new ReferenceError('article-read','文章记录损坏、版本不支持或正文绑定不一致，未使用不完整数据。',500);}
 }
 async finish(record:ArticleRecord,check:CheckReport):Promise<void>{
  try{
   const stored=await this.record(record.id);if(!same(stored,record)||!same(checkedReport(check,record.artifact),check))throw Error('report mismatch');
   if(!await publishRecord(join(this.root,record.id),'result','report.json',check))throw Error('immutable report');
  }catch{throw new ReferenceError('article-check-write','本篇报告保存失败或绑定不一致，未覆盖历史。',500);}finally{this.active.delete(record.id);}
 }
 async get(id:string):Promise<ArticleDetail>{
  const record=await this.record(id);const dir=join(this.root,id,'result');
  try{
   // Only a completely absent result is an interrupted attempt; partial records are corrupt.
   try{await stat(dir);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {record,status:this.active.has(id)?'checking':'failed',...(this.active.has(id)?{}:{error:'上次检测中断，请重新生成；旧记录仍保留。'})};throw e;}
   const raw=await read(join(dir,'report.json')),check=checkedReport(raw,record.artifact);
   if(!same(raw,check))throw Error('report mismatch');
   return {record,check,status:check.status==='passed'?'rule-passed':check.status==='violations'?'needs-fix':'failed'};
  }catch{throw new ReferenceError('article-read','本篇报告损坏或与正文不匹配，未标记为通过。',500);}
 }
 async list(after?:string):Promise<{articles:ArticleSummary[];nextCursor:string|null}>{
  if(after)assertId(after);
  try{
   const names=(await readdir(this.root,{withFileTypes:true})).filter(e=>e.isDirectory()&&uuid.test(e.name)&&(!after||e.name>after)).map(e=>e.name).sort();
   const page=names.slice(0,20),articles:ArticleSummary[]=[];
   for(const id of page){const d=await this.get(id);const r=d.record;articles.push({id,createdAt:r.createdAt,title:r.parsed.metadata.title??'未命名文章',templateName:r.template.record.definition.name,templateVersion:r.template.record.version,status:d.status});}
   return {articles,nextCursor:names.length>page.length?page.at(-1)!:null};
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {articles:[],nextCursor:null};if(e instanceof ReferenceError)throw e;throw new ReferenceError('article-read','无法读取本地文章历史。',500);}
 }
}
