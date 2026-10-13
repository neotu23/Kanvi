import {cpSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {load} from 'cheerio';
import {buildClipboardPayload} from '../src/features/output/clipboard';
import {themeArticleDocument} from '../src/features/themes/document';
import lock from '../docs/upstream-lock.json';
import type {AiOptions} from '../src/features/ai/client';
import type {OutputArtifact} from '../src/features/output/contracts';
import {parseThemeArticle} from '../src/features/themes/article';
import {themesRoot} from '../src/features/themes/library';
import {renderArticle} from '../src/features/themes/render-article';
import {ThemeRenderRepository} from '../src/features/themes/repository';
import {checkFidelity,fragmentsOf} from '../src/features/themes/verify-article';

const CHECKER_COMMIT=(lock.projects as Array<{id:string;commit:string}>).find(project=>project.id==='wechat-spec')!.commit;
type Transport=NonNullable<AiOptions['transport']>;
const article=['---','title: 雨后的傍晚','tags: [日记]','---','','# 雨后的傍晚','','雨停了，沿着河边走一会儿，路上看见几只停在水面的鸟。','','## 走过的那段路','','路灯亮起来之前，天色一点点暗下去。','','> 给自己留一点安静的时间。','','- 走到河边。','- 带一本书，在长椅上坐一会儿。','','---','','回家之前买了一些水果。'].join('\n');
const validHtml=[
 '<section style="max-width:677px;margin:0 auto;background-color:#F7F6F2;padding:24px 20px;font-family:\'Songti SC\',serif;font-size:16px;line-height:1.9;color:#2C2A26;">',
 '<p style="margin:0 0 28px;text-align:center;"><span leaf="" style="font-size:22px;font-weight:600;line-height:1.5;">雨后的傍晚</span></p>',
 '<p style="margin:0 0 20px;font-size:16px;line-height:1.9;"><span leaf="">雨停了，沿着河边走一会儿，路上看见几只停在水面的鸟。</span></p>',
 '<p style="margin:28px 0 14px;font-size:16px;font-weight:800;line-height:1.5;border-left:4px solid #3E5348;padding-left:12px;"><span leaf="">01 走过的那段路</span></p>',
 '<p style="margin:0 0 20px;font-size:16px;line-height:1.9;"><span leaf="">路灯亮起来之前，天色一点点暗下去。</span></p>',
 '<p style="margin:0 0 20px;font-size:16px;line-height:1.9;border-left:3px solid #C5D0C8;padding-left:12px;"><span leaf="">给自己留一点安静的时间。</span></p>',
 '<p style="margin:0 0 8px;font-size:16px;line-height:1.9;"><span leaf="">· 走到河边。</span></p>',
 '<p style="margin:0 0 20px;font-size:16px;line-height:1.9;"><span leaf="">· 带一本书，在长椅上坐一会儿。</span></p>',
 '<section style="height:1px;background-color:#E4E1D8;margin:28px 0;"><span leaf=""><br></span></section>',
 '<p style="margin:0 0 20px;font-size:16px;line-height:1.9;"><span leaf="">回家之前买了一些水果。</span></p>',
 '</section>'].join('');
const transport=(html:string):Transport=>(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({html,notes:['使用 masthead 骨架']})}}]}))as Transport;
const ai=(html:string):AiOptions=>({config:{apiKey:'controlled-test-only',model:'fixture'},transport:transport(html)});
const passedChecker=(artifact:OutputArtifact)=>Promise.resolve({status:'passed' as const,htmlHash:artifact.htmlHash,checkerCommit:CHECKER_COMMIT,issues:[]});
function env(){
 const themes=mkdtempSync(join(tmpdir(),'kanvi-render-themes-'));
 cpSync(join(themesRoot(),'moss-zen'),join(themes,'moss-zen'),{recursive:true});
 return {themes,renders:mkdtempSync(join(tmpdir(),'kanvi-renders-'))};
}
const run=(html:string,env:{themes:string;renders:string},extra:Record<string,unknown>={})=>renderArticle(article,'moss-zen',{
 projectRoot:process.cwd(),themesRootPath:env.themes,repository:new ThemeRenderRepository(env.renders),checker:passedChecker,ai:ai(html),...extra,
});

const optionalLine=(name:string)=>`<p style="margin:0 0 6px;font-size:15px;line-height:1.9;"><span leaf="">{{${name}}}</span></p>`;
const appendToArticle=(html:string,tail:string)=>html.slice(0,html.lastIndexOf('</section>'))+tail+'</section>';
const withOptionalMetadata=(html:string)=>appendToArticle(html,`${optionalLine('date')}<section style="margin:28px 0 0;border-top:1px solid #B42318;">${optionalLine('author')}${optionalLine('bio')}</section>`);
const tocHtml='<section style="margin:0 0 40px;text-align:center;">'+['目录','行走。','阅读。','回家。'].map(text=>`<p style="font-size:15px;line-height:1.9;"><span leaf="">${text}</span></p>`).join('')+'</section>';

it('模型新增目录时即使两道规格检查通过也不能开放复制，重启后仍为需修正',async()=>{
 const current=env();
 try {
  const detail=await run(appendToArticle(validHtml,tocHtml),current);
  expect(detail.record.validate.ok).toBe(true);
  expect(detail.check?.status).toBe('passed');
  expect(detail.status).toBe('needs-fix');
  expect(detail.record.fidelity).toMatchObject({ok:false,missing:[]});
  expect(detail.record.fidelity.unexpectedToc?.length).toBeGreaterThan(0);
  expect(detail.record.artifact.bodyHtml).toContain('目录');
  expect((await new ThemeRenderRepository(current.renders).get(detail.record.id,CHECKER_COMMIT)).status).toBe('needs-fix');
 } finally {rmSync(current.themes,{recursive:true,force:true});rmSync(current.renders,{recursive:true,force:true});}
},120_000);

it('原文已经有目录时保留原条目，按新规则通过',async()=>{
 const current=env();
 try {
  const detail=await renderArticle(article+'\n\n## 目录\n\n- 行走。\n- 阅读。\n- 回家。','moss-zen',{
   projectRoot:process.cwd(),themesRootPath:current.themes,repository:new ThemeRenderRepository(current.renders),checker:passedChecker,ai:ai(appendToArticle(validHtml,tocHtml)),
  });
  expect(detail.status).toBe('rule-passed');
  expect(detail.record.fidelity.unexpectedToc).toEqual([]);
 } finally {rmSync(current.themes,{recursive:true,force:true});rmSync(current.renders,{recursive:true,force:true});}
},120_000);

it('旧版带目录的历史仍按原规则复算，不修改或判成损坏',async()=>{
 const current=env();
 const legacyRoot=mkdtempSync(join(tmpdir(),'kanvi-legacy-renders-'));
 try {
  const detail=await run(appendToArticle(validHtml,tocHtml),current);
  const legacy={...detail.record,skill:{...detail.record.skill,promptVersion:'gzh-theme-render-v3-optional-metadata'},fidelity:checkFidelity(detail.record.parsed,detail.record.artifact.bodyHtml)};
  const repository=new ThemeRenderRepository(legacyRoot);
  const stored=await repository.create(legacy);
  await repository.finish(stored,detail.check!);
  expect((await new ThemeRenderRepository(legacyRoot).get(stored.id,CHECKER_COMMIT)).status).toBe('rule-passed');
  expect(JSON.parse(readFileSync(join(legacyRoot,stored.id,'record.json'),'utf8'))).toEqual(legacy);
 } finally {rmSync(current.themes,{recursive:true,force:true});rmSync(current.renders,{recursive:true,force:true});rmSync(legacyRoot,{recursive:true,force:true});}
},120_000);

it('未提供日期和署名时省略主题可选空行，真实检查后开放富文本复制',async()=>{
 const current=env();
 try {
  const detail=await run(withOptionalMetadata(validHtml),current,{checker:undefined});
  expect(detail.status).toBe('rule-passed');
  expect(detail.check?.status).toBe('passed');
  expect(detail.record.validate).toMatchObject({ok:true,errorCount:0,warnCount:0});
  expect(detail.record.fidelity.ok).toBe(true);
  expect(detail.record.artifact.bodyHtml).not.toMatch(/\{\{(?:date|author|bio)\}\}/);
  expect(detail.record.artifact.bodyHtml).not.toContain('border-top:1px solid #B42318');
  expect(detail.record.artifact.bodyHtml).toContain('回家之前买了一些水果。');
  expect(detail.record.notes.join(' ')).toContain('省略');
  const again=await new ThemeRenderRepository(current.renders).get(detail.record.id,CHECKER_COMMIT);
  expect(buildClipboardPayload(again.record.artifact).html).toBe(detail.record.artifact.bodyHtml);
  expect(again.status).toBe('rule-passed');
 } finally {rmSync(current.themes,{recursive:true,force:true});rmSync(current.renders,{recursive:true,force:true});}
},240_000);

it('主题日期占位符使用原文属性值，保留已有署名及其样式',async()=>{
 const current=env();
 try {
  const html=appendToArticle(validHtml,`${optionalLine('date')}<section style="border-top:1px solid #B42318;"><p style="font-size:15px;line-height:1.9;"><span leaf="">河边记录者</span></p>${optionalLine('bio')}</section>`);
  const detail=await renderArticle(`---\ndate: "2026 年 10 月 12 日 & 秋"\n---\n\n${article.split('---').slice(2).join('---')}`,'moss-zen',{
   projectRoot:process.cwd(),themesRootPath:current.themes,repository:new ThemeRenderRepository(current.renders),checker:passedChecker,ai:ai(html),
  });
  expect(detail.status).toBe('rule-passed');
  expect(detail.record.artifact.bodyHtml).toContain('2026 年 10 月 12 日 &amp; 秋');
  expect(detail.record.artifact.bodyHtml).toContain('<p style="font-size:15px;line-height:1.9;"><span leaf="">河边记录者</span></p>');
  expect(detail.record.artifact.bodyHtml).toContain('border-top:1px solid #B42318');
 } finally {rmSync(current.themes,{recursive:true,force:true});rmSync(current.renders,{recursive:true,force:true});}
},120_000);

it('可选字段处理不删原文标记、未知标记或带正文的标记行',async()=>{
 const current=env();
 try {
  const html=withOptionalMetadata(validHtml).replace('</section>','<p style="font-size:16px;line-height:1.9;"><span leaf="">正文里的 {{author}}。</span></p><p style="font-size:16px;line-height:1.9;"><span leaf="">{{mystery}}</span></p></section>');
  const detail=await run(html,current);
  expect(detail.status).toBe('needs-fix');
  expect(detail.record.artifact.bodyHtml).toContain('正文里的 {{author}}。');
  expect(detail.record.artifact.bodyHtml).toContain('{{mystery}}');
  const literal=await renderArticle('原文保留这个符号。\n\n{{author}}','moss-zen',{
   projectRoot:process.cwd(),themesRootPath:current.themes,repository:new ThemeRenderRepository(current.renders),checker:passedChecker,
   ai:ai('<section style="max-width:677px;margin:0 auto;padding:20px;"><p style="font-size:16px;line-height:1.9;"><span leaf="">原文保留这个符号。</span></p>'+optionalLine('author')+'</section>'),
  });
  expect(literal.record.artifact.bodyHtml).toContain('{{author}}');
  expect(literal.record.fidelity.missing).toEqual([]);
  expect(literal.status).toBe('needs-fix');
 } finally {rmSync(current.themes,{recursive:true,force:true});rmSync(current.renders,{recursive:true,force:true});}
},120_000);

it('省略可选字段不会掩盖原始产物中的违规结构或样式',async()=>{
 const current=env();
 try {
  const html=withOptionalMetadata(validHtml).replace('border-top:1px solid #B42318','position:absolute;border-top:1px solid #B42318');
  const detail=await run(html,current);
  expect(detail.record.artifact.bodyHtml).toContain('position:absolute');
  expect(detail.status).toBe('needs-fix');
  expect(detail.record.validate.errorCount).toBeGreaterThan(0);
 } finally {rmSync(current.themes,{recursive:true,force:true});rmSync(current.renders,{recursive:true,force:true});}
},120_000);

it('受控文章套用主题后通过规格校验并保存完整记录',async()=>{
 const current=env();
 const detail=await run(validHtml,current);
 expect(detail.status).toBe('rule-passed');
 expect(detail.check?.status).toBe('passed');
 expect(detail.record.validate).toMatchObject({ok:true,errorCount:0,warnCount:0});
 expect(detail.record.fidelity).toMatchObject({ok:true,missing:[]});
 expect(detail.record.theme).toMatchObject({id:'moss-zen',origin:'seed'});
 expect(detail.record.theme.themeMarkdown.length).toBeGreaterThan(1000);
 expect(detail.record.skill).toMatchObject({promptVersion:'gzh-theme-render-v4-source-toc',commit:'9accaf5039f29aade5d8ca315739b42845b11225'});
 expect(detail.record.rawOutputHash).toMatch(/^[a-f0-9]{64}$/);
},120_000);

it('模型漏掉留白时在检查前补入正文，复制、预览、导出和历史共用同一产物',async()=>{
 const current=env();
 let checkedHtml='';
 const detail=await run(validHtml.replace('padding:24px 20px','padding:0;padding-left:0!important'),current,{
  checker:(artifact:OutputArtifact)=>{checkedHtml=artifact.bodyHtml;return passedChecker(artifact);},
 });
 const artifact=detail.record.artifact;
 const root=load(artifact.bodyHtml)('body > section');
 expect(root.css('padding')).toBe('28px 20px 40px');
 expect(root.css('padding-left')).toBeUndefined();
 expect(root.css('box-sizing')).toBe('border-box');
 expect(root.css('background-color')).toBe('#F7F6F2');
 expect(root.text()).toContain('回家之前买了一些水果。');
 expect(checkedHtml).toBe(artifact.bodyHtml);
 expect(buildClipboardPayload(artifact).html).toBe(checkedHtml);
 const document=themeArticleDocument(artifact.bodyHtml);
 expect(document).toContain(`<body>${checkedHtml}</body>`);
 expect(load(document)('head style').text()).not.toContain('*{');
 expect(detail.record.theme.themeMarkdown).toContain('28px 20px 40px');
 const again=await new ThemeRenderRepository(current.renders).get(detail.record.id,CHECKER_COMMIT);
 expect(again.record.artifact).toEqual(artifact);
},120_000);

it('真实官方检查器接受该受控产物',async()=>{
 const current=env();
 const detail=await renderArticle(article,'moss-zen',{projectRoot:process.cwd(),themesRootPath:current.themes,repository:new ThemeRenderRepository(current.renders),ai:ai(validHtml)});
 expect(detail.check?.status).toBe('passed');
 expect(detail.status).toBe('rule-passed');
},240_000);

it('原文被改写或换序时判为需修正',async()=>{
 const current=env();
 const rewritten=await run(validHtml.replace('路上看见几只停在水面的鸟。','路上走了很久。'),current);
 expect(rewritten.status).toBe('needs-fix');
 expect(rewritten.record.fidelity.ok).toBe(false);
 expect(rewritten.record.fidelity.missing.length).toBeGreaterThan(0);
 const swapped=await run(validHtml.replace('路灯亮起来之前，天色一点点暗下去。','§A§').replace('回家之前买了一些水果。','路灯亮起来之前，天色一点点暗下去。').replace('§A§','回家之前买了一些水果。'),current);
 expect(swapped.status).toBe('needs-fix');
},120_000);

it('模型输出含脚本、事件属性或可执行 URL 时直接拒绝且不落记录',async()=>{
 const current=env();
 for(const bad of ['<section style="max-width:677px;margin:0 auto;"><p><span leaf="">雨停了。<script>alert(1)</script></span></p></section>','<section style="max-width:677px;margin:0 auto;"><p onclick="alert(1)"><span leaf="">雨停了。</span></p></section>','<section style="max-width:677px;margin:0 auto;"><p><span leaf=""><a href="javascript:alert(1)">雨停了。</a></span></p></section>']){
  await expect(run(bad,current)).rejects.toThrow(/已拒绝保存/);
 }
 expect(readdirSync(current.renders)).toEqual([]);
},120_000);

it('规格不达标的产物流到校验环节并判为需修正',async()=>{
 const current=env();
 const withDiv=validHtml.replace('<p style="margin:0 0 8px;font-size:16px;line-height:1.9;">','<div style="font-size:16px;line-height:1.9;">').replace('</span></p>','</span></div>');
 const detail=await run(withDiv,current);
 expect(detail.status).toBe('needs-fix');
 expect(detail.record.validate.ok).toBe(false);
 expect(detail.record.validate.issues.some(issue=>issue.level==='ERROR')).toBe(true);
},120_000);

it('没有 Key、原文含原始 HTML、超出发送上限都在调用前失败',async()=>{
 const current=env();
 await expect(renderArticle(article,'moss-zen',{projectRoot:process.cwd(),themesRootPath:current.themes,repository:new ThemeRenderRepository(current.renders),checker:passedChecker})).rejects.toThrow(/DEEPSEEK_API_KEY/);
 const htmlArticle=['# 标题','','<div>原始 HTML</div>'].join('\n');
 await expect(renderArticle(htmlArticle,'moss-zen',{projectRoot:process.cwd(),themesRootPath:current.themes,repository:new ThemeRenderRepository(current.renders),checker:passedChecker,ai:ai(validHtml)})).rejects.toThrow(/原始 HTML/);
 const huge=['# 长文','',...Array.from({length:2200},(_,index)=>`第 ${index} 段文字，用于把发送内容推到上限之上。`)].join('\n\n');
 await expect(renderArticle(huge,'moss-zen',{projectRoot:process.cwd(),themesRootPath:current.themes,repository:new ThemeRenderRepository(current.renders),checker:passedChecker,ai:ai(validHtml)})).rejects.toThrow(/KiB/);
},120_000);

it('检查器故障时不标记通过并保留失败历史',async()=>{
 const current=env();
 const broken=await renderArticle(article,'moss-zen',{projectRoot:process.cwd(),themesRootPath:current.themes,repository:new ThemeRenderRepository(current.renders),checker:()=>Promise.reject(new Error('checker down')),ai:ai(validHtml)});
 expect(broken.status).toBe('failed');
 expect(broken.check?.status).toBe('error');
 expect(broken.record.fidelity.ok).toBe(true);
},120_000);

it('删除主题后历史仍可读，重启后记录仍在',async()=>{
 const current=env();
 const detail=await run(validHtml,current);
 rmSync(join(current.themes,'moss-zen'),{recursive:true});
 const reopened=new ThemeRenderRepository(current.renders);
 const again=await reopened.get(detail.record.id,CHECKER_COMMIT);
 expect(again.status).toBe('rule-passed');
 expect(again.record.theme.themeMarkdown).toContain('## 结构标记'.replace('标记','模型'));
 expect((await reopened.list(CHECKER_COMMIT)).renders.map(item=>item.id)).toEqual([detail.record.id]);
},120_000);

it('损坏的记录不会被当作可读历史',async()=>{
 const current=env();
 const detail=await run(validHtml,current);
 const path=join(current.renders,detail.record.id,'record.json');
 const raw=JSON.parse(readFileSync(path,'utf8'));
 writeFileSync(path,JSON.stringify({...raw,artifact:{...raw.artifact,bodyHtml:'<section style="max-width:677px;margin:0 auto;">改动</section>'}}));
 await expect(new ThemeRenderRepository(current.renders).get(detail.record.id,CHECKER_COMMIT)).rejects.toThrow(/损坏|绑定/);
},120_000);

it('图片保留原文 src，保真按句子片段匹配',async()=>{
 const current=env();
 const imageArticle=['# 河边','','![河边的照片](images/river.jpg)','','雨后的水面上有光。'].join('\n');
 const imageHtml='<section style="max-width:677px;margin:0 auto;padding:20px;"><p style="margin:0 0 20px;font-size:16px;line-height:1.9;"><span leaf="">河边</span></p><figure style="margin:0 0 20px;"><img src="images/river.jpg" alt="河边的照片" style="max-width:100%;height:auto;display:block;margin:0 auto;"><figcaption style="font-size:14px;color:#5C5B56;text-align:center;line-height:1.8;"><span leaf="">河边的照片</span></figcaption></figure><p style="margin:0;font-size:16px;line-height:1.9;"><span leaf="">雨后的水面上有光。</span></p></section>';
 const detail=await renderArticle(imageArticle,'moss-zen',{projectRoot:process.cwd(),themesRootPath:current.themes,repository:new ThemeRenderRepository(current.renders),checker:passedChecker,ai:ai(imageHtml)});
 expect(detail.record.fidelity.ok).toBe(true);
 expect(detail.record.artifact.bodyHtml).toContain('src="images/river.jpg"');
 const parsed=parseThemeArticle(imageArticle);
 expect(parsed.units.some(unit=>unit.kind==='image'&&unit.src==='images/river.jpg')).toBe(true);
},120_000);

it('句子片段匹配容忍编号与列表符号，但不容忍丢句',()=>{
 const parsed=parseThemeArticle(article);
 expect(fragmentsOf('第一句。第二句！')).toEqual(['第一句。','第二句！']);
 expect(checkFidelity(parsed,validHtml).ok).toBe(true);
 expect(checkFidelity(parsed,'<section><p><span leaf="">雨停了，沿着河边走一会儿，路上看见几只停在水面的鸟。</span></p></section>').missing.length).toBeGreaterThan(0);
 expect(checkFidelity(parsed,'<section><p><span leaf="">**雨停了，沿着河边走一会儿，路上看见几只停在水面的鸟。**</span></p></section>').residue).toContain('加粗标记未转换');
});
