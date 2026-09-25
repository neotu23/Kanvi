import {cpSync,existsSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import type {AiOptions} from '../src/features/ai/client';
import {createThemeDraft,sanitizePreview} from '../src/features/themes/factory';
import {confirmDraft,discardDraft,listDrafts} from '../src/features/themes/confirm';
import {loadTheme,themesRoot} from '../src/features/themes/library';

const SEED_COMMIT='9accaf5039f29aade5d8ca315739b42845b11225';
type Transport=NonNullable<AiOptions['transport']>;
const seedText=(file:string)=>readFileSync(join(themesRoot(),'moss-zen',file),'utf8');
const seedTheme=(id:string,name:string):Record<string,unknown>=>({...(JSON.parse(seedText('theme.json')) as Record<string,unknown>),id,name});
function responses(list:unknown[]):Transport {
 let index=0;
 return (async()=>{const payload=list[Math.min(index,list.length-1)];index+=1;
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(payload)}}]});}) as Transport;
}
function env(){
 return {drafts:mkdtempSync(join(tmpdir(),'kanvi-drafts-')),themes:mkdtempSync(join(tmpdir(),'kanvi-themes-'))};
}
const options=(drafts:string,themes:string,transport:Transport)=>({draftsRoot:drafts,themesRoot:themes,projectRoot:process.cwd(),ai:{config:{apiKey:'controlled-test-only',model:'fixture'},transport}});
const themePayload=(id:string,name:string,markdown:string,theme=seedTheme(id,name))=>({id,name,themeJson:theme,themeMarkdown:markdown,notes:['已按 brief 生成']});

it('按 brief 生成草案并保留 lint 结果',async()=>{
 const {drafts,themes}=env();
 const transport=responses([themePayload('draft-one','草案一',seedText('THEME.md')),{previewHtml:seedText('preview.html'),notes:[]}]);
 const draft=await createThemeDraft('禅意留白，适合随笔与生活稿。',options(drafts,themes,transport));
 expect(draft.themeId).toBe('draft-one');
 expect(draft.name).toBe('草案一');
 expect(draft.lint).toMatchObject({ok:true,errorCount:0,warnCount:0});
 expect(draft.promptVersion).toBe('gzh-theme-factory-v1');
 expect(draft.skillCommit).toBe(SEED_COMMIT);
 expect(existsSync(join(drafts,'draft-one','preview.html'))).toBe(true);
 const listed=await listDrafts(drafts);
 expect(listed).toHaveLength(1);
 expect(listed[0]).toMatchObject({themeId:'draft-one',ok:true});
});
it('草案预览页会剥掉脚本、事件属性与可执行 URL',async()=>{
 const {drafts,themes}=env();
 const preview=seedText('preview.html').replace('</body>','<script>alert(1)</script><p onclick="alert(2)" style="color:#333;">x</p></body>');
 const transport=responses([themePayload('draft-two','草案二',seedText('THEME.md')),{previewHtml:preview,notes:[]}]);
 await createThemeDraft('克制、纸感。',options(drafts,themes,transport));
 const saved=readFileSync(join(drafts,'draft-two','preview.html'),'utf8');
 expect(saved).not.toContain('<script');
 expect(saved).not.toContain('onclick');
 expect(saved).toContain('<section');
 expect(sanitizePreview('<a href="javascript:alert(1)" style="color:#000;">x</a>')).not.toContain('javascript:');
});
it('模型返回多余字段或不合法主题时拒绝且不落草案',async()=>{
 const {drafts,themes}=env();
 const extra={...themePayload('draft-three','草案三',seedText('THEME.md')) as Record<string,unknown>,unexpected:1};
 await expect(createThemeDraft('纸感。',options(drafts,themes,responses([extra,{previewHtml:seedText('preview.html')}])))).rejects.toThrow(/字段/);
 expect(existsSync(join(drafts,'draft-three'))).toBe(false);
 const badColor=seedTheme('draft-four','草案四');
 const tokens=badColor.tokens as {color:Record<string,string>};
 tokens.color.brand='red';
 await expect(createThemeDraft('纸感。',options(drafts,themes,responses([themePayload('draft-four','草案四',seedText('THEME.md'),badColor),{previewHtml:seedText('preview.html')}])))).rejects.toThrow(/theme\.json/);
 expect(existsSync(join(drafts,'draft-four'))).toBe(false);
});
it('缺少 Key 与超长 brief 在发送前就报错',async()=>{
 const {drafts,themes}=env();
 const noKey={draftsRoot:drafts,themesRoot:themes,projectRoot:process.cwd(),ai:{config:{apiKey:'',model:'fixture'}}};
 await expect(createThemeDraft('纸感。',noKey)).rejects.toThrow(/DEEPSEEK_API_KEY/);
 await expect(createThemeDraft('x'.repeat(9*1024),options(drafts,themes,responses([themePayload('draft-five','草案五',seedText('THEME.md'))])))).rejects.toThrow(/8 KiB/);
});
it('同一 id 的草案不会被覆盖',async()=>{
 const {drafts,themes}=env();
 const transport=()=>responses([themePayload('draft-six','草案六',seedText('THEME.md')),{previewHtml:seedText('preview.html')}]);
 await createThemeDraft('纸感。',options(drafts,themes,transport()));
 await expect(createThemeDraft('另一种气质。',options(drafts,themes,transport()))).rejects.toThrow(/已存在待确认的草案/);
});
it('确认后主题入库并写入生成来源，草案记录不再留在主题包内',async()=>{
 const {drafts,themes}=env();
 const transport=responses([themePayload('draft-seven','草案七',seedText('THEME.md')),{previewHtml:seedText('preview.html')}]);
 await createThemeDraft('纸感随笔。',options(drafts,themes,transport));
 const confirmed=await confirmDraft('draft-seven',{draftsRoot:drafts,themesRoot:themes,projectRoot:process.cwd()});
 expect(confirmed).toMatchObject({themeId:'draft-seven',origin:'generated',name:'草案七'});
 expect(existsSync(join(drafts,'draft-seven'))).toBe(false);
 const pkg=await loadTheme('draft-seven',themes);
 expect(pkg.origin).toBe('generated');
 expect(pkg.source.origin==='generated'&&pkg.source.generated?.model).toBe('fixture');
 expect(existsSync(join(themes,'draft-seven','draft.json'))).toBe(false);
 expect(existsSync(join(themes,'draft-seven','SOURCE.md'))).toBe(true);
 expect(await listDrafts(drafts)).toEqual([]);
});
it('确认时重新 lint：THEME.md 缺槽位则拒绝入库并保留草案',async()=>{
 const {drafts,themes}=env();
 const transport=responses([themePayload('draft-eight','草案八',seedText('THEME.md')),{previewHtml:seedText('preview.html')}]);
 await createThemeDraft('纸感。',options(drafts,themes,transport));
 const path=join(drafts,'draft-eight','THEME.md');
 writeFileSync(path,readFileSync(path,'utf8').replace('### slot:footer','### slot:footer-renamed'));
 await expect(confirmDraft('draft-eight',{draftsRoot:drafts,themesRoot:themes,projectRoot:process.cwd()})).rejects.toThrow(/未通过 theme lint/);
 expect(existsSync(join(drafts,'draft-eight'))).toBe(true);
 expect(existsSync(join(themes,'draft-eight'))).toBe(false);
});
it('主题库已有同名主题时拒绝入库',async()=>{
 const {drafts,themes}=env();
 cpSync(join(themesRoot(),'moss-zen'),join(themes,'moss-zen'),{recursive:true});
 const transport=responses([themePayload('moss-zen','苔色留白',seedText('THEME.md')),{previewHtml:seedText('preview.html')}]);
 await createThemeDraft('禅意。',options(drafts,themes,transport));
 await expect(confirmDraft('moss-zen',{draftsRoot:drafts,themesRoot:themes,projectRoot:process.cwd()})).rejects.toThrow(/已存在/);
});
it('丢弃草案后目录消失，再次丢弃报未找到',async()=>{
 const {drafts,themes}=env();
 const transport=responses([themePayload('draft-nine','草案九',seedText('THEME.md')),{previewHtml:seedText('preview.html')}]);
 await createThemeDraft('纸感。',options(drafts,themes,transport));
 await discardDraft('draft-nine',drafts);
 expect(existsSync(join(drafts,'draft-nine'))).toBe(false);
 await expect(discardDraft('draft-nine',drafts)).rejects.toThrow(/没有找到/);
 await expect(discardDraft('../escape',drafts)).rejects.toThrow(/id 无效/);
});

it('设计提示词随草案入库保存，后续可读取原文', async () => {
 const {drafts,themes}=env();
 const transport=responses([themePayload('prompt-kept','纸上慢读',seedText('THEME.md')),{previewHtml:seedText('preview.html')}]);
 await createThemeDraft('米白背景，衬线标题，正文宽松。',options(drafts,themes,transport));
 await confirmDraft('prompt-kept',{draftsRoot:drafts,themesRoot:themes,projectRoot:process.cwd()});
 const path=join(themes,'prompt-kept','DESIGN.json');
 expect(existsSync(path)).toBe(true);
 expect(JSON.parse(readFileSync(path,'utf8')).prompt).toBe('米白背景，衬线标题，正文宽松。');
});
