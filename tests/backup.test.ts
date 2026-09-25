import {cpSync,mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import lock from '../docs/upstream-lock.json';
import type {AiOptions} from '../src/features/ai/client';
import type {OutputArtifact} from '../src/features/output/contracts';
import {createThemeHandlers} from '../src/features/themes/handlers';
import {ensureNoSecrets,exportBackup,restoreBackup,validateBackup} from '../src/features/themes/backup';
import {themesRoot} from '../src/features/themes/library';
import {renderArticle} from '../src/features/themes/render-article';
import {ThemeRenderRepository} from '../src/features/themes/repository';

type Transport=NonNullable<AiOptions['transport']>;
const CHECKER_COMMIT=(lock.projects as Array<{id:string;commit:string}>).find(project=>project.id==='wechat-spec')!.commit;
const article=['# 河边','','雨停了，沿着河边走一会儿。'].join('\n');
const html='<section style="max-width:677px;margin:0 auto;padding:20px;"><p style="margin:0 0 16px;font-size:16px;line-height:1.9;"><span leaf="">河边</span></p><p style="margin:0;font-size:16px;line-height:1.9;"><span leaf="">雨停了，沿着河边走一会儿。</span></p></section>';
const transport=(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({html,notes:[]})}}]})) as Transport;
const passedChecker=(artifact:OutputArtifact)=>Promise.resolve({status:'passed' as const,htmlHash:artifact.htmlHash,checkerCommit:CHECKER_COMMIT,issues:[]});

function env(){
 const dir=mkdtempSync(join(tmpdir(),'kanvi-backup-'));
 const themes=join(dir,'themes'),renders=join(dir,'renders');
 cpSync(join(themesRoot(),'moss-zen'),join(themes,'moss-zen'),{recursive:true});
 return {dir,themes,renders,restored:{themes:join(dir,'restored-themes'),renders:join(dir,'restored-renders')}};
}

it('导出主题包与渲染历史，恢复到空目录后内容一致',async()=>{
 const current=env();
 try{
  const detail=await renderArticle(article,'moss-zen',{projectRoot:process.cwd(),themesRootPath:current.themes,repository:new ThemeRenderRepository(current.renders),checker:passedChecker,ai:{config:{apiKey:'controlled-test-only',model:'fixture'},transport}});
  const backup=await exportBackup({themesRoot:current.themes,rendersRoot:current.renders});
  expect(backup.app).toBe('kanvi-theme-backup');
  expect(backup.themes.map(item=>item.id)).toEqual(['moss-zen']);
  expect(backup.renders.map(item=>item.id)).toEqual([detail.record.id]);
  expect(backup.skipped).toEqual({themes:[],renders:[]});
  expect(backup.contentHash).toMatch(/^[a-f0-9]{64}$/);
  expect(Object.keys(backup.themes[0].files).sort()).toEqual(['SOURCE.json','SOURCE.md','THEME.md','preview.html','theme.json']);
  expect(JSON.stringify(backup)).not.toContain('DEEPSEEK_API_KEY');

  const restored=await restoreBackup(backup,{themesRoot:current.restored.themes,rendersRoot:current.restored.renders});
  expect(restored.themes.added).toEqual(['moss-zen']);
  expect(restored.renders.added).toEqual([detail.record.id]);
  expect(readFileSync(join(current.restored.themes,'moss-zen','THEME.md'),'utf8')).toBe(readFileSync(join(current.themes,'moss-zen','THEME.md'),'utf8'));
  expect(readdirSync(current.restored.renders).filter(name=>!name.startsWith('.'))).toEqual([detail.record.id]);
  const reopened=new ThemeRenderRepository(current.restored.renders);
  expect((await reopened.get(detail.record.id,CHECKER_COMMIT)).status).toBe('rule-passed');

  const again=await restoreBackup(backup,{themesRoot:current.restored.themes,rendersRoot:current.restored.renders});
  expect(again.themes).toEqual({added:[],skipped:['moss-zen']});
  expect(again.renders).toEqual({added:[],skipped:[detail.record.id]});
 }finally{rmSync(current.dir,{recursive:true,force:true});}
},120_000);

it('备份结构、指纹与 id 都会被校验',async()=>{
 const current=env();
 try{
  const backup=await exportBackup({themesRoot:current.themes,rendersRoot:current.renders});
  expect(validateBackup(backup).themes).toHaveLength(1);
  expect(()=>validateBackup({...backup,version:2})).toThrow(/版本/);
  expect(()=>validateBackup({...backup,app:'other-tool'})).toThrow(/其它工具/);
  expect(()=>validateBackup({...backup,contentHash:'0'.repeat(64)})).toThrow(/指纹/);
  expect(()=>validateBackup({...backup,themes:[{id:'../escape',files:backup.themes[0].files}]})).toThrow(/id 无效/);
  expect(()=>validateBackup({...backup,themes:[{id:'moss-zen',files:{'theme.json':'{}'}}]})).toThrow(/缺少三件套/);
  expect(()=>validateBackup({...backup,renders:[{id:'not-a-uuid',record:{}}]})).toThrow(/渲染记录 id/);
  expect(()=>validateBackup({...backup,themes:[{id:'moss-zen',files:{...backup.themes[0].files,extra:'x'}}]})).toThrow(/主题文件字段/);
  expect(()=>validateBackup({...backup,themes:[{id:'moss-zen',files:{...backup.themes[0].files,'theme.json':'{"id":"moss-zen"}'}}]})).toThrow(/契约校验/);
 }finally{rmSync(current.dir,{recursive:true,force:true});}
},120_000);

it('备份内容含本机密钥时拒绝导出',async()=>{
 const current=env();
 const previous=process.env.DEEPSEEK_API_KEY;
 try{
  const secret='leak-test-key-abcdef123456';
  process.env.DEEPSEEK_API_KEY=secret;
  writeFileSync(join(current.themes,'moss-zen','THEME.md'),readFileSync(join(current.themes,'moss-zen','THEME.md'),'utf8')+`\n<!-- ${secret} -->\n`);
  await expect(exportBackup({themesRoot:current.themes,rendersRoot:current.renders})).rejects.toThrow(/API Key/);
  expect(()=>ensureNoSecrets({app:'kanvi-theme-backup',version:1,createdAt:new Date().toISOString(),themes:[{id:'x',files:{'THEME.md':secret}}],renders:[],skipped:{themes:[],renders:[]},contentHash:''})).toThrow(/拒绝导出/);
 }finally{
  if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;
  rmSync(current.dir,{recursive:true,force:true});
 }
},120_000);

it('备份接口只接受本机请求，并能导出与恢复',async()=>{
 const current=env();
 try{
  const handlers=createThemeHandlers({themesRoot:current.themes,draftsRoot:join(current.dir,'drafts'),rendersRoot:current.renders,projectRoot:process.cwd(),repository:new ThemeRenderRepository(current.renders)});
  const request=(method:string,body?:unknown,origin='http://127.0.0.1:8787')=>new Request('http://127.0.0.1:8787/api/backup',{method,headers:{host:'127.0.0.1:8787',origin,...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const exported=await handlers.backup(request('GET'));
  expect(exported.status).toBe(200);
  const backup=await exported.json();
  expect(backup.themes).toHaveLength(1);
  expect((await handlers.backup(request('GET',undefined,'https://external.example'))).status).toBe(403);
  const restored=await handlers.restore(request('POST',backup));
  expect(restored.status).toBe(201);
  expect((await restored.json()).themes.skipped).toEqual(['moss-zen']);
  expect((await handlers.restore(request('POST',{app:'kanvi-theme-backup',version:1}))).status).toBe(422);
  expect((await handlers.restore(request('POST',backup,'https://external.example'))).status).toBe(403);
  const overview=await (await handlers.list(request('GET'))).json();
  expect(overview.paths.themes).toBe(current.themes);
  expect(overview.paths.renders).toBe(current.renders);
  expect(typeof overview.paths.artifacts).toBe('string');
 }finally{rmSync(current.dir,{recursive:true,force:true});}
},120_000);

it('设计提示词与调整记录随主题备份恢复，旧备份仍可读取', async () => {
 const current=env();
 try {
  const design={version:1,prompt:'保留纸感与留白。',adjustment:'缩小章节间距。',changes:['章节样式已调整']};
  writeFileSync(join(current.themes,'moss-zen','DESIGN.json'),JSON.stringify(design));
  const backup=await exportBackup({themesRoot:current.themes,rendersRoot:current.renders});
  expect(backup.themes[0].files['DESIGN.json']).toBe(JSON.stringify(design));
  await restoreBackup(backup,{themesRoot:current.restored.themes,rendersRoot:current.restored.renders});
  expect(JSON.parse(readFileSync(join(current.restored.themes,'moss-zen','DESIGN.json'),'utf8'))).toEqual(design);
 } finally {rmSync(current.dir,{recursive:true,force:true});}
});
