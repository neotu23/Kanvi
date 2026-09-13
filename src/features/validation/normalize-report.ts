export interface CheckIssue { rule: string; message: string; paragraphIndex?: number; outerHTML?: string }
export interface CheckReport {
 status:'passed'|'violations'|'error'; htmlHash:string; checkerCommit:string;
 issues:CheckIssue[]; warnings?:string[]; error?:string;
}
type Binding=Pick<CheckReport,'htmlHash'|'checkerCommit'>;
function object(value:unknown):value is Record<string,unknown> { return !!value && typeof value==='object' && !Array.isArray(value); }
export function normalizeReport(stdout:string,exitCode:number|null,binding:Binding):CheckReport {
 const error=(message:string):CheckReport=>({...binding,status:'error',issues:[],error:message});
 if(exitCode!==0 && exitCode!==1) return error(`检查器执行异常（退出码 ${exitCode}）`);
 try {
  const value:unknown=JSON.parse(stdout);
  if(!object(value)||typeof value.isValid!=='boolean'||typeof value.source!=='string'||!Array.isArray(value.violations)) return error('检查器响应格式无效');
  if(value.isValid !== (exitCode===0) || value.isValid !== (value.violations.length===0)) return error('检查器响应与退出码或违规记录矛盾');
  if(value.warnMsgs!==undefined && (!Array.isArray(value.warnMsgs)||!value.warnMsgs.every(x=>typeof x==='string'))) return error('检查器警告格式无效');
  const issues:CheckIssue[]=[];
  for(const group of value.violations) {
   if(!object(group)||typeof group.key!=='string'||!group.key||typeof group.message!=='string'||!Array.isArray(group.items)||!group.items.every(object)) return error('检查器违规记录格式无效');
   if(!group.items.length) issues.push({rule:group.key,message:group.message});
   for(const item of group.items) {
    const index=typeof item.paragraphIndex==='number'||typeof item.paragraphIndex==='string' ? Number(item.paragraphIndex):NaN;
    issues.push({rule:group.key,message:typeof item.rules==='string'?`${group.message}；${item.rules}`:group.message,...(Number.isInteger(index)&&index>=0?{paragraphIndex:index}:{}),...(typeof item.outerHTML==='string'?{outerHTML:item.outerHTML}:{})});
   }
  }
  return {...binding,status:value.isValid?'passed':'violations',issues,warnings:value.warnMsgs as string[]|undefined};
 } catch { return error('检查器没有返回有效 JSON'); }
}
