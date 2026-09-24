import { ReferenceError } from '../references/contracts';
import { checkedReport, checkerCommit } from '../templates/repository';
import { officialTemplateCheck } from '../templates/workflow';
import { hasInlineFragments } from '../templates/repair';
import type { OutputArtifact } from '../output/contracts';
import type { CheckReport } from '../validation/normalize-report';
import { ArticleRepository } from './repository';
export { templateEligibility } from './eligibility';
export interface ArticleOptions {signal?:AbortSignal;checker?:(a:OutputArtifact,signal?:AbortSignal)=>Promise<CheckReport>}
export async function generateArticle(repository:ArticleRepository,markdown:string,templateId:string,version:string,options:ArticleOptions={}){
 if(options.signal?.aborted)throw new ReferenceError('cancelled','生成已取消。',408);
 const record=await repository.create(markdown,templateId,version);
 let check:CheckReport;
 const failed=(message:string):CheckReport=>({status:'error',htmlHash:record.artifact.htmlHash,checkerCommit,issues:[],error:message});
 try{
  if(options.signal?.aborted)check=failed('生成已取消，未标记为通过。');
  else check=checkedReport(await (options.checker??officialTemplateCheck)(record.artifact,options.signal),record.artifact);
 }catch{check=failed('本篇检查器执行失败，请确认本地配置后重新生成。');}
 if(options.signal?.aborted)check=failed('生成已取消，未标记为通过。');
 if(check.issues.some(hasInlineFragments))check={...check,warnings:[...(check.warnings??[]),'检查器可能将行内强调片段误计为多行；已保留原文和原始诊断，未自动调整模板。']};
 await repository.finish(record,check);return repository.get(record.id);
}
