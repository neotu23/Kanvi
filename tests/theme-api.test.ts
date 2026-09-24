import {cpSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {createThemeHandlers} from '../src/features/themes/handlers';
import {themesRoot} from '../src/features/themes/library';
import {ThemeRenderRepository,type RenderDetail} from '../src/features/themes/repository';
import {createThemeDraft} from '../src/features/themes/factory';

const base='http://127.0.0.1:8787/api/themes';
const request=(path:string,method:string,body?:unknown,origin='http://127.0.0.1:8787')=>new Request(`${base}${path}`,{method,headers:{host:'127.0.0.1:8787',origin,...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
const get=(path:string,origin?:string)=>request(path,'GET',undefined,origin);
const post=(path:string,body:unknown,origin?:string)=>request(path,'POST',body,origin);
const del=(path:string,origin?:string)=>request(path,'DELETE',undefined,origin);
const stubDetail=(themeId:string)=>({record:{id:'record-1',theme:{id:themeId}},status:'rule-passed'} as unknown as RenderDetail);
function env(){
 const dir=mkdtempSync(join(tmpdir(),'kanvi-theme-api-'));
 const themes=join(dir,'themes'),drafts=join(dir,'drafts'),renders=join(dir,'renders');
 cpSync(join(themesRoot(),'moss-zen'),join(themes,'moss-zen'),{recursive:true});
 return {dir,themes,drafts,renders};
}

it('主题库接口返回可用主题与运行环境，并拒绝非本机请求',async()=>{
 const current=env();
 try{
  const handlers=createThemeHandlers({themesRoot:current.themes,draftsRoot:current.drafts,projectRoot:process.cwd(),repository:new ThemeRenderRepository(current.renders)});
  const response=await handlers.list(get(''));
  expect(response.status).toBe(200);
  const overview=await response.json();
  expect(overview.themes).toHaveLength(1);
  expect(overview.themes[0]).toMatchObject({id:'moss-zen',origin:'seed',hasNote:true});
  expect(overview.themes[0].structure.voice).toBe('journal');
  expect(overview.python.available).toBe(true);
  expect(overview.skill.installed).toBe(true);
  expect(overview.drafts).toEqual([]);
  expect(overview.renders).toEqual([]);
  expect(JSON.stringify(overview)).not.toContain('bodyHtml');
  expect(JSON.stringify(overview)).not.toContain('themeMarkdown');
  expect((await handlers.list(get('','https://external.example'))).status).toBe(403);
 }finally{rmSync(current.dir,{recursive:true,force:true});}
});
it('主题预览会剥掉脚本，渲染接口按字段校验并有并发锁',async()=>{
 const current=env();
 try{
  const previewPath=join(current.themes,'moss-zen','preview.html');
  writeFileSync(previewPath,readFileSync(previewPath,'utf8').replace('</body>','<script>alert(1)</script><p onclick="x()">脚本测试</p></body>'));
  let release:()=>void=()=>{};const wait=new Promise<void>(resolve=>{release=resolve});
  let entered:()=>void=()=>{};const started=new Promise<void>(resolve=>{entered=resolve});
  const handlers=createThemeHandlers({themesRoot:current.themes,draftsRoot:current.drafts,projectRoot:process.cwd(),repository:new ThemeRenderRepository(current.renders),render:async(_markdown:string,themeId:string)=>{entered();await wait;return stubDetail(themeId);}});
  const preview=await (await handlers.preview(get('/moss-zen/preview'),'moss-zen')).json();
  expect(preview.html).not.toContain('<script');
  expect(preview.html).not.toContain('onclick');
  expect((await handlers.preview(get('/no-such/preview'),'no-such-theme')).status).toBe(404);
  expect((await handlers.render(post('/render',{markdown:'正文'},'https://external.example'))).status).toBe(403);
  expect((await handlers.render(post('/render',{markdown:'正文',themeId:'moss-zen',bodyHtml:'fake'}))).status).toBe(400);
  const rendering=handlers.render(post('/render',{markdown:'# 标题',themeId:'moss-zen'}));
  await started;
  expect((await handlers.render(post('/render',{markdown:'# 另一个标题',themeId:'moss-zen'}))).status).toBe(409);
  release();
  const done=await rendering;
  expect(done.status).toBe(201);
  expect((await done.json()).status).toBe('rule-passed');
 }finally{rmSync(current.dir,{recursive:true,force:true});}
});
it('草案接口：无 Key 报配置、字段越权拒绝、确认与丢弃都受校验',async()=>{
 const current=env();
 try{
  const handlers=createThemeHandlers({themesRoot:current.themes,draftsRoot:current.drafts,projectRoot:process.cwd(),repository:new ThemeRenderRepository(current.renders)});
  expect((await handlers.createDraft(post('/drafts',{brief:'禅意留白。'}))).status).toBe(503);
  expect((await handlers.createDraft(post('/drafts',{brief:'禅意留白。',model:'x'}))).status).toBe(400);
  expect((await handlers.draft(post('/drafts/moss-zen',{action:'unknown'}),'moss-zen')).status).toBe(400);
  expect((await handlers.draft(post('/drafts/no-such-draft',{action:'discard'}),'no-such-draft')).status).toBe(404);
  expect((await handlers.draft(post('/drafts/../escape',{action:'confirm'}),'../escape')).status).toBe(400);
 }finally{rmSync(current.dir,{recursive:true,force:true});}
});
it('主题删除需要二次确认，删除后列表不再包含该主题',async()=>{
 const current=env();
 try{
  const handlers=createThemeHandlers({themesRoot:current.themes,draftsRoot:current.drafts,projectRoot:process.cwd(),repository:new ThemeRenderRepository(current.renders)});
  expect((await handlers.remove(del('/moss-zen'),'moss-zen')).status).toBe(400);
  expect((await handlers.remove(del('/moss-zen?confirm=moss-zen'),'moss-zen')).status).toBe(200);
  const overview=await (await handlers.list(get(''))).json();
  expect(overview.themes).toEqual([]);
  expect((await handlers.remove(del('/moss-zen?confirm=moss-zen'),'moss-zen')).status).toBe(404);
  // 种子主题可由主题库脚本重新复制，删除不会影响这条恢复路径。
  cpSync(join(themesRoot(),'moss-zen'),join(current.themes,'moss-zen'),{recursive:true});
  expect((await (await handlers.list(get(''))).json()).themes).toHaveLength(1);
 }finally{rmSync(current.dir,{recursive:true,force:true});}
});
it('主题工厂在缺少 Key 之前不会写出草案目录',async()=>{
 const current=env();
 try{
  await expect(createThemeDraft('禅意留白。',{projectRoot:process.cwd(),draftsRoot:current.drafts})).rejects.toThrow(/DEEPSEEK_API_KEY/);
  const handlers=createThemeHandlers({themesRoot:current.themes,draftsRoot:current.drafts,projectRoot:process.cwd(),repository:new ThemeRenderRepository(current.renders)});
  expect((await (await handlers.list(get(''))).json()).drafts).toEqual([]);
 }finally{rmSync(current.dir,{recursive:true,force:true});}
});
