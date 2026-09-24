import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { createArticleHandlers } from '../src/features/articles/handlers';
import { ArticleRepository } from '../src/features/articles/repository';
import { TemplateRepository,checkerCommit } from '../src/features/templates/repository';
import { runTemplateCheck } from '../src/features/templates/workflow';
import { templateFromAnalysis } from '../src/features/templates/from-analysis';
import { analysisFixture } from './fixtures/template-source';
const request=(path:string,body?:unknown,origin='http://127.0.0.1:8787')=>new Request(`http://127.0.0.1:8787/api/articles${path}`,{method:body===undefined?'GET':'POST',headers:{host:'127.0.0.1:8787',origin,'content-type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
it('文章 API 只接受 Markdown 与保存的模板版本，不信任外部正文/报告；并发与错误可恢复',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'kanvi-article-api-'));
 try{
  const templates=new TemplateRepository(join(dir,'templates')),articles=new ArticleRepository(join(dir,'articles'),templates);
  const t=await templates.create(templateFromAnalysis(analysisFixture()));
  await runTemplateCheck(templates,t,{checker:async a=>({status:'passed',htmlHash:a.htmlHash,checkerCommit,issues:[]})});
  let release:()=>void=()=>{};const wait=new Promise<void>(r=>release=r);let entered:()=>void=()=>{};const started=new Promise<void>(r=>entered=r);
  const handlers=createArticleHandlers(articles,templates,async a=>{entered();await wait;return {status:'passed',htmlHash:a.htmlHash,checkerCommit,issues:[]};});
  const prepared=await handlers.prepare(request('/parse',{markdown:'正文'}));expect(prepared.status).toBe(200);
  const preparedBody=await prepared.json();expect(preparedBody.templates[0]).toMatchObject({templateId:t.templateId,eligible:true});expect(JSON.stringify(preparedBody)).not.toContain('sourceHtml');
  expect((await handlers.POST(request('',{markdown:'正文',templateId:t.templateId,version:t.version,bodyHtml:'fake'}))).status).toBe(400);
  expect((await handlers.POST(request('',{markdown:'正文'},'https://external.example'))).status).toBe(403);
  const generation=handlers.POST(request('',{markdown:'正文',templateId:t.templateId,version:t.version}));await started;
  expect((await handlers.POST(request('',{markdown:'第二篇',templateId:t.templateId,version:t.version}))).status).toBe(409);
  release();const response=await generation;expect(response.status).toBe(201);const detail=await response.json();expect(detail.status).toBe('rule-passed');
  const restored=await handlers.detail(request('/'+detail.record.id),detail.record.id);expect((await restored.json()).record.artifact.bodyHtml).toBe(detail.record.artifact.bodyHtml);
  const list=await handlers.GET(request(''));const data=await list.json();expect(data.articles).toHaveLength(1);expect(JSON.stringify(data)).not.toContain('bodyHtml');
  expect((await handlers.detail(request('/bad'),'bad')).status).toBe(400);
  expect((await handlers.prepare(request('/parse',{markdown:'![图](x)'}))).status).toBe(200);
  expect((await handlers.POST(request('',{markdown:'![图](x)',templateId:t.templateId,version:t.version}))).status).toBe(422);
 }finally{await rm(dir,{recursive:true,force:true});}
});
