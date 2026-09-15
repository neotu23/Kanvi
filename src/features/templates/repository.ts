import { randomUUID,createHash } from 'node:crypto';
import { mkdir,readFile,readdir,stat } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import lock from '../../../docs/upstream-lock.json';
import { ReferenceError } from '../references/contracts';
import { publishRecord } from '../references/repository';
import type { OutputArtifact } from '../output/contracts';
import type { CheckReport } from '../validation/normalize-report';
import { validateTemplate,uuid,type TemplateDefinition } from './schema';
import { renderTemplate,sampleBlocks } from './render';
export const checkerCommit=lock.projects.find(p=>p.id==='wechat-spec')!.commit;
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export interface TemplateVersion {templateId:string;version:string;parentVersion:string|null;createdAt:string;definitionHash:string;definition:TemplateDefinition}
export interface CheckAttempt {id:string;version:string;definitionHash:string;createdAt:string;artifact:OutputArtifact}
export type TemplateStatus='draft'|'checking'|'needs-fix'|'rule-passed'|'failed';
export interface TemplateDetail {record:TemplateVersion;status:TemplateStatus;attempt?:CheckAttempt;check?:CheckReport;error?:string}
const active=new Set<string>();let lastTime=0;
const timestamp=()=>new Date(lastTime=Math.max(Date.now(),lastTime+1)).toISOString();
function id(value:string){if(!uuid.test(value))throw new ReferenceError('invalid-id','模板或版本 ID 无效。',400);}
async function read(path:string,max=2*1024*1024){if((await stat(path)).size>max)throw Error('record too large');return JSON.parse(await readFile(path,'utf8'));}
function report(value:unknown,artifact:OutputArtifact):CheckReport {
 const r=value as CheckReport;
 if(!r||!['passed','violations','error'].includes(r.status)||r.htmlHash!==artifact.htmlHash||r.checkerCommit!==checkerCommit||!Array.isArray(r.issues)||r.issues.length>1000||(r.status==='passed'&&r.issues.length)||(r.status==='violations'&&!r.issues.length)||r.issues.some(i=>!i||typeof i.rule!=='string'||typeof i.message!=='string'||(i.outerHTML!==undefined&&typeof i.outerHTML!=='string'))||(r.error!==undefined&&typeof r.error!=='string')||(r.warnings!==undefined&&(!Array.isArray(r.warnings)||r.warnings.some(w=>typeof w!=='string'))))throw Error('report binding invalid');
 return r;
}
export class TemplateRepository {
 constructor(private root=resolve('data/templates')){}
 async create(definition:TemplateDefinition,parent?:TemplateVersion):Promise<TemplateVersion>{
  const safe=validateTemplate(definition);
  if(parent){const stored=await this.get(parent.templateId,parent.version);if(stored.definitionHash!==parent.definitionHash||JSON.stringify(stored.definition.source)!==JSON.stringify(safe.source))throw new ReferenceError('version-conflict','模板父版本或来源不一致。',409);}
  const record:TemplateVersion={templateId:parent?.templateId??randomUUID(),version:randomUUID(),parentVersion:parent?.version??null,createdAt:timestamp(),definitionHash:hash(JSON.stringify(safe)),definition:safe};
  try{if(!await publishRecord(join(this.root,record.templateId),record.version,'version.json',record))throw Error('duplicate version');return record;}
  catch{throw new ReferenceError('template-write','模板保存失败，未覆盖已有版本。',500);}
 }
 async get(templateId:string,version:string):Promise<TemplateVersion>{
  id(templateId);id(version);const dir=join(this.root,templateId,version);
  try{await stat(dir);const raw=await read(join(dir,'version.json'));const definition=validateTemplate(raw.definition);
   if(raw.templateId!==templateId||raw.version!==version||(raw.parentVersion!==null&&(typeof raw.parentVersion!=='string'||!uuid.test(raw.parentVersion)))||typeof raw.createdAt!=='string'||!Number.isFinite(Date.parse(raw.createdAt))||raw.definitionHash!==hash(JSON.stringify(definition)))throw Error('invalid version');
   return {templateId,version,parentVersion:raw.parentVersion,createdAt:raw.createdAt,definitionHash:raw.definitionHash,definition};
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'&&(e as NodeJS.ErrnoException).path===dir)throw new ReferenceError('not-found','未找到模板版本。',404);throw new ReferenceError('template-read','模板记录损坏或读取失败。',500);}
 }
 async start(record:TemplateVersion,artifact:OutputArtifact):Promise<CheckAttempt>{
  const current=await this.get(record.templateId,record.version);const expected=renderTemplate(current.definition,sampleBlocks(current.definition));
  if(current.definitionHash!==record.definitionHash||JSON.stringify(expected)!==JSON.stringify(artifact))throw new ReferenceError('sample-mismatch','样例与模板版本不一致。',409);
  const attempt:CheckAttempt={id:randomUUID(),version:record.version,definitionHash:record.definitionHash,createdAt:timestamp(),artifact};
  try{if(!await publishRecord(join(this.root,record.templateId,record.version,'checks'),attempt.id,'attempt.json',attempt))throw Error('duplicate');active.add(attempt.id);return attempt;}
  catch{throw new ReferenceError('check-write','无法保存检测任务。',500);}
 }
 async finish(record:TemplateVersion,attempt:CheckAttempt,check:CheckReport):Promise<void>{
  try{report(check,attempt.artifact);if(attempt.version!==record.version||attempt.definitionHash!==record.definitionHash)throw Error('version mismatch');
   const dir=join(this.root,record.templateId,record.version,'checks',attempt.id);
   if(JSON.stringify(await read(join(dir,'attempt.json')))!==JSON.stringify(attempt))throw Error('attempt mismatch');
   if(!await publishRecord(dir,'result','report.json',check))throw Error('result immutable');
  }catch{throw new ReferenceError('check-write','检测报告保存失败或与版本不匹配。',500);}finally{active.delete(attempt.id);}
 }
 async detail(templateId:string,version:string):Promise<TemplateDetail>{
  const record=await this.get(templateId,version),dir=join(this.root,templateId,version,'checks');
  try{
   let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {record,status:'draft'};throw e;}
   const names=entries.filter(e=>e.isDirectory()&&uuid.test(e.name)).map(e=>e.name);if(names.length>200)throw Error('too many checks');
   const attempts:CheckAttempt[]=[];
   for(const name of names){const a=await read(join(dir,name,'attempt.json')) as CheckAttempt;if(a.id!==name||a.version!==version||a.definitionHash!==record.definitionHash||typeof a.createdAt!=='string'||!Number.isFinite(Date.parse(a.createdAt)))throw Error('attempt invalid');attempts.push(a);}
   const attempt=attempts.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];if(!attempt)return {record,status:'draft'};
   const expected=renderTemplate(record.definition,sampleBlocks(record.definition));if(JSON.stringify(expected)!==JSON.stringify(attempt.artifact))throw Error('artifact mismatch');
   const path=join(dir,attempt.id,'result','report.json');let raw;
   try{raw=await read(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {record,attempt,status:active.has(attempt.id)?'checking':'failed',error:active.has(attempt.id)?undefined:'上次检测中断或报告缺失，请重新检测。'};throw e;}
   const check=report(raw,attempt.artifact);
   return {record,attempt,check,status:check.status==='passed'?'rule-passed':check.status==='violations'?'needs-fix':'failed'};
  }catch{throw new ReferenceError('check-read','检测记录损坏或绑定不一致，未标记为通过。',500);}
 }
 async list():Promise<TemplateDetail[]>{
  try{await mkdir(this.root,{recursive:true,mode:0o700});const ids=(await readdir(this.root,{withFileTypes:true})).filter(e=>e.isDirectory()&&uuid.test(e.name));if(ids.length>200)throw Error('limit');const result:TemplateDetail[]=[];
   for(const entry of ids){const versions=(await readdir(join(this.root,entry.name),{withFileTypes:true})).filter(e=>e.isDirectory()&&uuid.test(e.name));if(versions.length>100||result.length+versions.length>1000)throw Error('limit');for(const v of versions)result.push(await this.detail(entry.name,v.name));}
   return result.sort((a,b)=>b.record.createdAt.localeCompare(a.record.createdAt));
  }catch(e){if(e instanceof ReferenceError)throw e;throw new ReferenceError('template-read','模板列表读取失败或超过当前存储上限。',500);}
 }
}
export function checkedReport(value:unknown,artifact:OutputArtifact):CheckReport {
 try{return report(value,artifact);}catch{return {status:'error',htmlHash:artifact.htmlHash,checkerCommit,issues:[],error:'检查器报告与正文、版本或状态不匹配。'};}
}
