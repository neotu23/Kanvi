import { ReferenceError } from '../references/contracts';
import { isLocalRequest } from '../validation/local-request';
import { readBounded, json, errorResponse } from '../shared/io';
import { TemplateRepository } from '../templates/repository';
import { officialTemplateCheck } from '../templates/workflow';
import { ArticleRepository } from './repository';
import { parseMarkdown, maxMarkdownBytes, type ParsedMarkdown } from './parse-markdown';
import { generateArticle, templateEligibility } from './workflow';
export interface TemplateChoice {templateId:string;version:string;name:string;tags:string[];eligible:boolean;reasons:string[]}
export interface PreparedArticle {parsed:ParsedMarkdown;templates:TemplateChoice[]}
async function input(request:Request,keys:string[]):Promise<Record<string,unknown>>{
 if(!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type')??''))throw new ReferenceError('content-type','请使用 JSON 请求。',415);
 const text=await readBounded(request.body,maxMarkdownBytes*6+8192,AbortSignal.any([request.signal,AbortSignal.timeout(15000)]));
 let value;try{value=JSON.parse(text);}catch{throw new ReferenceError('invalid-input','请求 JSON 无效。',400);}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||typeof value.markdown!=='string')throw new ReferenceError('invalid-input','请提供单篇 Markdown 文档及允许的字段。',400);
 return value;
}
const denied=()=>json({error:'仅接受本机页面的请求。'},403);
export function createArticleHandlers(articles:ArticleRepository,templates:TemplateRepository,checker=officialTemplateCheck){
 let generating=false,preparing=false;
 return {
  async prepare(request:Request){
   if(!isLocalRequest(request))return denied();if(preparing)return json({error:'正在解析文档，请稍后重试。'},409);preparing=true;
   try{
    const body=await input(request,['markdown']),parsed=parseMarkdown(body.markdown as string);
    const candidates=(await templates.list()).map(t=>({templateId:t.record.templateId,version:t.record.version,name:t.record.definition.name,tags:t.record.definition.tags,...templateEligibility(parsed,t)}));
    return json({parsed,templates:candidates} satisfies PreparedArticle);
   }catch(e){return errorResponse(e);}finally{preparing=false;}
  },
  async POST(request:Request){
   if(!isLocalRequest(request))return denied();if(generating)return json({error:'已有文章正在生成与检测，请等待完成。'},409);generating=true;
   try{
    const body=await input(request,['markdown','templateId','version']);
    if(typeof body.templateId!=='string'||typeof body.version!=='string')throw new ReferenceError('invalid-input','请选择保存的模板版本。',400);
    return json(await generateArticle(articles,body.markdown as string,body.templateId,body.version,{checker,signal:AbortSignal.any([request.signal,AbortSignal.timeout(60000)])}),201);
   }catch(e){return errorResponse(e);}finally{generating=false;}
  },
  async GET(request:Request){if(!isLocalRequest(request))return denied();try{return json(await articles.list(new URL(request.url).searchParams.get('after')??undefined));}catch(e){return errorResponse(e);}},
  async detail(request:Request,id:string){if(!isLocalRequest(request))return denied();try{return json(await articles.get(id));}catch(e){return errorResponse(e);}},
 };
}
const templates=new TemplateRepository();
export const articleHandlers=createArticleHandlers(new ArticleRepository(undefined,templates),templates);
