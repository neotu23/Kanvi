import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach,expect,it } from 'vitest';
import { createTemplateHandlers } from '../src/features/templates/handlers';
import { TemplateRepository,checkerCommit } from '../src/features/templates/repository';
import { ReferenceRepository } from '../src/features/references/repository';
import { AnalysisRepository } from '../src/features/ai/repository';
import { extractArticle } from '../src/features/references/extract-article';
import { analyzeDesign } from '../src/features/ai/design-analysis';
import { analysisFixture } from './fixtures/template-source';
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
function req(body?:unknown,origin='http://localhost:8787'){return new Request('http://localhost:8787/api/templates',{method:body===undefined?'GET':'POST',headers:{host:'localhost:8787',origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
it('从已保存分析创建模板，检测与输出绑定一致，列表不泄露原始参考',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'kanvi-template-api-'));dirs.push(dir);
 const references=new ReferenceRepository(join(dir,'references')),analyses=new AnalysisRepository(join(dir,'analyses')),templates=new TemplateRepository(join(dir,'templates'));
 const snapshot=extractArticle('<div id="js_content"><p>用户原始参考</p></div>',null);await references.save(snapshot);
 const analysis=await analyzeDesign(snapshot,{config:{apiKey:'test-only',model:'fixture'},transport:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(analysisFixture().design)}}]})});await analyses.save(analysis);
 const api=createTemplateHandlers(templates,references,analyses,async a=>({status:'passed',issues:[],htmlHash:a.htmlHash,checkerCommit}));
 const created=await api.POST(req({referenceId:snapshot.id,analysisId:analysis.id}));expect(created.status).toBe(201);const {record}=await created.json();
 const checked=await api.check(req({repair:'none'}),record.templateId,record.version);expect(checked.status).toBe(200);const result=await checked.json();expect(result.status).toBe('rule-passed');expect(result.check.htmlHash).toBe(result.attempt.artifact.htmlHash);
 const listed=await (await api.GET(req())).json();expect(listed.templates[0].status).toBe('rule-passed');expect(JSON.stringify(listed)).not.toContain('用户原始参考');expect(JSON.stringify(listed)).not.toContain('bodyHtml');
 expect((await api.POST(req({referenceId:snapshot.id,analysisId:analysis.id},'https://evil.invalid'))).status).toBe(403);
 expect((await api.check(req({repair:'none',html:'<p>伪造</p>'}),record.templateId,record.version)).status).toBe(400);
 expect((await api.detail(req(),'../bad',record.version)).status).toBe(400);
});
