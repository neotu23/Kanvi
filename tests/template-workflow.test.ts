import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach,expect,it } from 'vitest';
import { TemplateRepository } from '../src/features/templates/repository';
import { runTemplateCheck } from '../src/features/templates/workflow';
import { applyPatches, suggestedPatches } from '../src/features/templates/repair';
import { templateFromAnalysis } from '../src/features/templates/from-analysis';
import { renderTemplate,sampleBlocks } from '../src/features/templates/render';
import { analysisFixture } from './fixtures/template-source';
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
async function repo(){const dir=await mkdtemp(join(tmpdir(),'kanvi-templates-'));dirs.push(dir);return {dir,repository:new TemplateRepository(dir)};}
const commit='fa69e37341c86bfec4c8c533845910511e534c0c';
it('版本不可变，重启后校验哈希和样例；新版本不继承通过状态',async()=>{
 const {dir,repository}=await repo();const record=await repository.create(templateFromAnalysis(analysisFixture()));
 expect((await repository.detail(record.templateId,record.version)).status).toBe('draft');
 const result=await runTemplateCheck(repository,record,{checker:async artifact=>({status:'passed',issues:[],htmlHash:artifact.htmlHash,checkerCommit:commit})});
 expect(result.status).toBe('rule-passed');
 expect((await new TemplateRepository(dir).detail(record.templateId,record.version)).status).toBe('rule-passed');
 const changed=structuredClone(record.definition);changed.root.styles.paddingLeft=14;
 const next=await repository.create(changed,record);
 expect(next.parentVersion).toBe(record.version);
 expect((await repository.detail(next.templateId,next.version)).status).toBe('draft');
 const path=join(dir,record.templateId,record.version,'version.json');const data=JSON.parse(await readFile(path,'utf8'));data.definition.root.styles.color='#ffffff';await writeFile(path,JSON.stringify(data));
 await expect(repository.get(record.templateId,record.version)).rejects.toThrow();
});
it('只修正报告中可定位的行高，不改变内容或其他风格',()=>{
 const t=templateFromAnalysis(analysisFixture());t.blocks.body!.styles.lineHeight=1;
 const issue={rule:'line-height',message:'overlap',outerHTML:'<p class="kn-body" style="font-size:16px;line-height:1">'};
 const patches=suggestedPatches(t,[issue]);expect(patches).toHaveLength(1);
 const changed=applyPatches(t,patches,[issue]);expect(changed.blocks.body!.styles.lineHeight).toBe(1.8);
 expect(changed.blocks.body!.styles.marginBottom).toBe(20);
 expect(renderTemplate(t,sampleBlocks(t)).plainText).toBe(renderTemplate(changed,sampleBlocks(changed)).plainText);
 expect(()=>applyPatches(t,[{nodeId:'missing',property:'lineHeight',value:1.8}],[issue])).toThrow();
 expect(()=>applyPatches(t,[{nodeId:'body',property:'color',value:'#ffffff'} as any],[issue])).toThrow();
 expect(suggestedPatches(t,[{rule:'line-height',message:'no node'}])).toEqual([]);
});
it('最多两轮修正，每个修正版本绑定自己的报告；仍有问题保留 needs-fix',async()=>{
 const {repository}=await repo();const t=templateFromAnalysis(analysisFixture());t.blocks.body!.styles.lineHeight=1;
 const record=await repository.create(t);let calls=0;
 const result=await runTemplateCheck(repository,record,{autoRepair:true,checker:async artifact=>{calls++;return {status:'violations',issues:[{rule:'line-height',message:'controlled overlap',outerHTML:'<p class="kn-body" style="font-size:16px;line-height:1">'}],htmlHash:artifact.htmlHash,checkerCommit:commit};},suggest:async(def,issues)=>[{nodeId:'body',property:'lineHeight',value:(def.blocks.body!.styles.lineHeight??1)+.1}]});
 expect(calls).toBe(3);expect(result.status).toBe('needs-fix');expect(result.rounds).toHaveLength(3);
 expect(new Set(result.rounds.map(r=>r.version))).toHaveProperty('size',3);
});
it('检查器错误和报告哈希不符不能变成通过；失败重试不占用状态',async()=>{
 const {repository}=await repo();const record=await repository.create(templateFromAnalysis(analysisFixture()));
 const failed=await runTemplateCheck(repository,record,{checker:async()=>{throw Error('failed');}});expect(failed.status).toBe('failed');
 const mismatch=await runTemplateCheck(repository,record,{checker:async()=>({status:'passed',issues:[],htmlHash:'bad',checkerCommit:commit})});expect(mismatch.status).toBe('failed');
 const fixed=await runTemplateCheck(repository,record,{checker:async a=>({status:'passed',issues:[],htmlHash:a.htmlHash,checkerCommit:commit})});expect(fixed.status).toBe('rule-passed');
});
it('取消不能因检查器忽略 signal 而写成通过',async()=>{
 const {repository}=await repo();const record=await repository.create(templateFromAnalysis(analysisFixture()));const controller=new AbortController();
 const result=await runTemplateCheck(repository,record,{signal:controller.signal,checker:async a=>{controller.abort();return {status:'passed',issues:[],htmlHash:a.htmlHash,checkerCommit:commit};}});
 expect(result.status).toBe('failed');
});
it('带行内片段的疑似误报不触发扩大行高补丁',()=>{
 const t=templateFromAnalysis(analysisFixture());t.blocks.body!.styles.lineHeight=1;
 const issue={rule:'line-height',message:'overlap',outerHTML:'<p class="kn-body">原文<strong>强调</strong></p>'};
 expect(suggestedPatches(t,[issue])).toEqual([]);
 expect(()=>applyPatches(t,[{nodeId:'body',property:'lineHeight',value:1.8}],[issue])).toThrow();
});
it('修正 API 的 JSON 必须引用候选节点，不发送原文；缺少 Key 或无效补丁保留错误',async()=>{
 const {aiRepair}=await import('../src/features/templates/workflow');
 const t=templateFromAnalysis(analysisFixture());t.blocks.body!.styles.lineHeight=1;
 const issues=[{rule:'line-height',message:'original message not sent',outerHTML:'<p class="kn-body">PRIVATE_TEXT</p>'}];
 const config={apiKey:'test-only-key',model:'fixture'};
 const response=(patches:unknown)=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({patches})}}]});
 const patches=await aiRepair(t,issues,undefined,{config,transport:async(_url,init)=>{const body=JSON.parse(init!.body as string);expect(body.messages[1].content).not.toMatch(/PRIVATE_TEXT|SOURCE_AUTHOR/);return response([{nodeId:'body',property:'lineHeight',value:1.8}]);}});
 expect(patches).toHaveLength(1);
 await expect(aiRepair(t,issues,undefined,{config,transport:async()=>response([{nodeId:'unknown',property:'lineHeight',value:1.8}])})).rejects.toThrow();
 await expect(aiRepair(t,issues,undefined,{config:{...config,apiKey:''}})).rejects.toMatchObject({code:'ai-not-configured'});
});
it('样例或检测报告被改动后不得使用旧的通过状态',async()=>{
 const {dir,repository}=await repo();const record=await repository.create(templateFromAnalysis(analysisFixture()));
 const result=await runTemplateCheck(repository,record,{checker:async a=>({status:'passed',issues:[],htmlHash:a.htmlHash,checkerCommit:commit})});
 const path=join(dir,record.templateId,record.version,'checks',result.attempt!.id,'result','report.json');
 const check=JSON.parse(await readFile(path,'utf8'));check.checkerCommit='0'.repeat(40);await writeFile(path,JSON.stringify(check));
 await expect(repository.detail(record.templateId,record.version)).rejects.toMatchObject({code:'check-read'});
 const altered=renderTemplate(record.definition,sampleBlocks(record.definition));altered.bodyHtml+='<p>添加</p>';
 await expect(repository.start(record,altered)).rejects.toMatchObject({code:'sample-mismatch'});
});
