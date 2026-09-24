import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { ArticleRepository } from '../src/features/articles/repository';
import { generateArticle, templateEligibility } from '../src/features/articles/workflow';
import { parseMarkdown } from '../src/features/articles/parse-markdown';
import { TemplateRepository, checkerCommit } from '../src/features/templates/repository';
import { templateFromAnalysis } from '../src/features/templates/from-analysis';
import { runTemplateCheck } from '../src/features/templates/workflow';
import { analysisFixture } from './fixtures/template-source';
import type { OutputArtifact } from '../src/features/output/contracts';
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
const passed=async(a:OutputArtifact)=>({status:'passed' as const,htmlHash:a.htmlHash,checkerCommit,issues:[]});
async function setup(){const dir=await mkdtemp(join(tmpdir(),'kanvi-article-'));dirs.push(dir);const templates=new TemplateRepository(join(dir,'templates'));const template=await templates.create(templateFromAnalysis(analysisFixture()));const articles=new ArticleRepository(join(dir,'articles'),templates);return {dir,templates,template,articles};}
it('模板样例未通过或缺少正文结构时，不能生成文章',async()=>{
 const {templates,template,articles}=await setup();
 await expect(generateArticle(articles,'正文',template.templateId,template.version,{checker:passed})).rejects.toMatchObject({code:'template-ineligible'});
 await runTemplateCheck(templates,template,{checker:passed});
 await expect(generateArticle(articles,'`不能丢掉的代码`',template.templateId,template.version,{checker:passed})).rejects.toMatchObject({code:'markdown-diagnostics'});
 const detail=await templates.detail(template.templateId,template.version);delete detail.record.definition.blocks.quote;
 expect(templateEligibility(parseMarkdown('> 引用'),detail).eligible).toBe(false);
});
it('每篇文章单独检测，保留两篇不同结构的日记及同一最终正文',async()=>{
 const {dir,templates,template,articles}=await setup();await runTemplateCheck(templates,template,{checker:passed});
 let checked='';
 const short=await generateArticle(articles,'雨停了。\n\n沿着河边走。',template.templateId,template.version,{checker:async a=>{checked=a.htmlHash;return passed(a);}});
 expect(short.status).toBe('rule-passed');expect(short.record.artifact.plainText).toBe('雨停了。\n沿着河边走。');expect(short.check?.htmlHash).toBe(checked);
 expect(short.check?.htmlHash).not.toBe(short.record.template.attempt.artifact.htmlHash);
 const long=await generateArticle(articles,'# 周末\n\n'+('走到河边，看树影落在水上。'.repeat(30))+'\n\n> 慢慢走。\n\n1. 带一本书。\n2. 买一些水果。',template.templateId,template.version,{checker:passed});
 expect(long.record.parsed.blocks.map(b=>b.kind)).toEqual(['heading','body','quote','list']);
 expect(long.record.artifact.plainText).toContain('慢慢走。\n带一本书。\n买一些水果。');
 const restored=await new ArticleRepository(join(dir,'articles'),templates).get(short.record.id);
 expect(restored.record.artifact).toEqual(short.record.artifact);expect(restored.status).toBe('rule-passed');
 expect((await articles.list()).articles).toHaveLength(2);
});
it('检查器故障、取消和报告绑定不符不可变为通过',async()=>{
 const {templates,template,articles}=await setup();await runTemplateCheck(templates,template,{checker:passed});
 const mismatch=await generateArticle(articles,'正文',template.templateId,template.version,{checker:async a=>({...await passed(a),htmlHash:'wrong'})});expect(mismatch.status).toBe('failed');
 const controller=new AbortController();const cancelled=await generateArticle(articles,'另一篇正文',template.templateId,template.version,{signal:controller.signal,checker:async a=>{controller.abort();return passed(a);}});expect(cancelled.status).toBe('failed');
 const failed=await generateArticle(articles,'重试仍保留历史',template.templateId,template.version,{checker:async()=>{throw Error('offline');}});expect(failed.status).toBe('failed');
 expect((await articles.list()).articles).toHaveLength(3);
});
it('行内误报保留强调和原报告，文章不会自动修正模板',async()=>{
 const {templates,template,articles}=await setup();await runTemplateCheck(templates,template,{checker:passed});
 const detail=await generateArticle(articles,'把**小事**记下来。',template.templateId,template.version,{checker:async a=>({status:'violations',htmlHash:a.htmlHash,checkerCommit,issues:[{rule:'line-height',message:'controlled',outerHTML:'<p>把<strong>小事</strong>记下来。</p>'}]})});
 expect(detail.status).toBe('needs-fix');expect(detail.record.artifact.bodyHtml).toContain('<strong');expect(detail.check?.issues).toHaveLength(1);expect(detail.check?.warnings?.length).toBeGreaterThan(0);expect((await templates.list()).length).toBe(1);
});
it('中断、记录损坏和重复报告不能冒充成功',async()=>{
 const {dir,templates,template,articles}=await setup();await runTemplateCheck(templates,template,{checker:passed});
 const record=await articles.create('保存前的正文',template.templateId,template.version);
 expect((await articles.get(record.id)).status).toBe('checking');
 expect((await new ArticleRepository(join(dir,'articles'),templates).get(record.id)).status).toBe('failed');
 await articles.finish(record,await passed(record.artifact));
 await expect(articles.finish(record,await passed(record.artifact))).rejects.toThrow();
 const path=join(dir,'articles',record.id,'article.json');const raw=JSON.parse(await readFile(path,'utf8'));raw.markdown='被替换的正文';await writeFile(path,JSON.stringify(raw));
 await expect(articles.get(record.id)).rejects.toMatchObject({code:'article-read'});
 await expect(articles.get('../escape')).rejects.toMatchObject({code:'invalid-id'});
});
