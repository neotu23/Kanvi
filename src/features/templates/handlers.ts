import { isLocalRequest } from '../validation/local-request';
import { json,errorResponse,readJsonRequest } from '../shared/io';
import { ReferenceError } from '../references/contracts';
import { ReferenceRepository } from '../references/repository';
import { AnalysisRepository } from '../ai/repository';
import { TemplateRepository,type TemplateDetail } from './repository';
import { templateFromAnalysis } from './from-analysis';
import { runTemplateCheck,officialTemplateCheck,aiRepair } from './workflow';
import { uuid } from './schema';
export interface TemplateSummary {templateId:string;version:string;parentVersion:string|null;createdAt:string;name:string;tags:string[];supported:string[];status:TemplateDetail['status']}
function summary(d:TemplateDetail):TemplateSummary{return {templateId:d.record.templateId,version:d.record.version,parentVersion:d.record.parentVersion,createdAt:d.record.createdAt,name:d.record.definition.name,tags:d.record.definition.tags,supported:Object.keys(d.record.definition.blocks),status:d.status};}
const denied=()=>json({error:'仅接受本机页面的请求。'},403);
function input(value:unknown,keys:string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw new ReferenceError('invalid-input','请求字段无效。',400);return value as Record<string,unknown>;}
export function createTemplateHandlers(templates:TemplateRepository,references:ReferenceRepository,analyses:AnalysisRepository,checker=officialTemplateCheck){
 let creating=false,checking=false;
 return {
  async POST(request:Request){if(!isLocalRequest(request))return denied();if(creating)return json({error:'正在创建模板，请稍后重试。'},409);creating=true;
   try{const body=input(await readJsonRequest(request),['referenceId','analysisId']);if(typeof body.referenceId!=='string'||typeof body.analysisId!=='string'||!uuid.test(body.analysisId))throw new ReferenceError('invalid-input','请选择有效的参考与设计草稿。',400);
    const reference=await references.get(body.referenceId);let after:string|undefined;
    for(let page=0;page<50;page++){const data=await analyses.list(reference,after);const analysis=data.analyses.find(a=>a.id===body.analysisId);if(analysis){const record=await templates.create(templateFromAnalysis(analysis));return json({record,status:'draft'},201);}if(!data.nextCursor)break;after=data.nextCursor;}
    throw new ReferenceError('not-found','找不到这份设计草稿。',404);
   }catch(e){return errorResponse(e);}finally{creating=false;}
  },
  async GET(request:Request){if(!isLocalRequest(request))return denied();try{return json({templates:(await templates.list()).map(summary)});}catch(e){return errorResponse(e);}},
  async detail(request:Request,templateId:string,version:string){if(!isLocalRequest(request))return denied();try{return json(await templates.detail(templateId,version));}catch(e){return errorResponse(e);}},
  async check(request:Request,templateId:string,version:string){if(!isLocalRequest(request))return denied();if(checking)return json({error:'已有模板正在检测，请等待完成。'},409);checking=true;
   try{const body=input(await readJsonRequest(request),['repair']);if(!['none','local','ai'].includes(body.repair as string))throw new ReferenceError('invalid-input','请选择检测或修正方式。',400);
    const record=await templates.get(templateId,version);return json(await runTemplateCheck(templates,record,{checker,signal:request.signal,autoRepair:body.repair!=='none',...(body.repair==='ai'?{suggest:aiRepair}:{})}));
   }catch(e){return errorResponse(e);}finally{checking=false;}
  },
 };
}
export const templateHandlers=createTemplateHandlers(new TemplateRepository(),new ReferenceRepository(),new AnalysisRepository());
