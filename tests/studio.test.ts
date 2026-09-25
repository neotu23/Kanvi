import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createStudioDraft, readStudioTheme } from '../src/features/themes/studio';
import { confirmDraft } from '../src/features/themes/confirm';
import { createThemeHandlers } from '../src/features/themes/handlers';
import { validateDesign } from '../src/features/themes/design';
import type { AiOptions } from '../src/features/ai/client';
const themeJson = JSON.parse(readFileSync('themes/moss-zen/theme.json','utf8'));
const original = readFileSync('themes/moss-zen/THEME.md','utf8');
function env() {
 const dir=mkdtempSync(join(tmpdir(),'kanvi-studio-'));
 const options={themesRoot:join(dir,'themes'),draftsRoot:join(dir,'drafts'),projectRoot:process.cwd()};
 cpSync('themes/moss-zen',join(options.themesRoot,'moss-zen'),{recursive:true});
 return {dir,options};
}
function ai(markdown: string, inputs: Record<string,unknown>[] = []): AiOptions {
 return {config:{apiKey:'fixture-key',model:'fixture'},transport:(async (_url, init) => {
  const sent = JSON.parse(String(init?.body)); const input=JSON.parse(sent.messages[1].content); inputs.push(input);
  const value=input.stage==='theme' ? {id:'moss-zen',name:'苔色留白',themeJson,themeMarkdown:markdown,notes:[]} : {previewHtml:'<html><body><p>完整预览</p></body></html>',notes:[]};
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
 }) as typeof fetch};
}
it('旧主题展示整理说明，不伪造原始提示词；损坏设计记录明确报错', async () => {
 const {dir,options}=env();
 try {
  const detail=await readStudioTheme('moss-zen','saved',options);
  expect(detail.promptSource).toBe('derived'); expect(detail.design.prompt).toContain('行高');
  expect(detail.html).toContain('把一个下午还给自己');
  writeFileSync(join(options.themesRoot,'moss-zen','DESIGN.json'),'{}');
  await expect(readStudioTheme('moss-zen','saved',options)).rejects.toThrow(/设计记录损坏/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
it('微调发送原模板全文，以新 ID 保存实际提示词、调整与原版快照，入库后仍可比较', async () => {
 const {dir,options}=env(); const inputs: Record<string,unknown>[]=[];
 try {
  const modified=original.replace('margin:36px 0 16px','margin:24px 0 16px').replaceAll('line-height:1.9','line-height:1.8');
  const draft=await createStudioDraft({name:'苔色慢读',prompt:'保留纸色和字体。',adjustment:'稍微缩小行距。',baseId:'moss-zen',baseSource:'saved'},{...options,ai:ai(modified,inputs)});
  expect(draft.themeId).not.toBe('moss-zen');
  expect((inputs[0].baseTheme as {themeMarkdown:string}).themeMarkdown).toBe(original);
  expect(inputs[0].adjustment).toBe('稍微缩小行距。');
  expect(readFileSync(join(options.themesRoot,'moss-zen','THEME.md'),'utf8')).toBe(original);
  const before=await readStudioTheme(draft.themeId,'draft',options);
  expect(before.promptSource).toBe('recorded'); expect(before.design.prompt).toBe('保留纸色和字体。');
  expect(before.design.parent?.id).toBe('moss-zen'); expect(before.baseHtml).toContain('把一个下午还给自己');
  expect(before.design.changes.some(c=>c.includes('正文段落'))).toBe(true);
  // 用固定上游有效预览资产完成 lint；不把受控模型结果称作真实模型验证。
  writeFileSync(join(options.draftsRoot,draft.themeId,'preview.html'),readFileSync('themes/moss-zen/preview.html','utf8'));
  await confirmDraft(draft.themeId,options);
  const saved=await readStudioTheme(draft.themeId,'saved',options);
  expect(saved.design).toEqual(before.design);
  expect(readdirSync(options.themesRoot)).toContain('moss-zen');
 } finally {rmSync(dir,{recursive:true,force:true});}
},120000);
it('无法完整预览的生成模板拒绝落盘，避免保存不可编辑的草案', async () => {
 const {dir,options}=env();
 try {
  await expect(createStudioDraft({name:'无效模板',prompt:'留白设计。'},{...options,ai:ai(original.replace('{{body}}','{{unsupported}}'))})).rejects.toThrow(/不支持的变量/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
it('设计请求拒绝越权字段、超长输入和路径穿越', async () => {
 const {dir,options}=env();
 try {
  await expect(createStudioDraft({name:'测试主题',prompt:'测试。',html:'unsafe'},options)).rejects.toThrow(/字段/);
  await expect(createStudioDraft({name:'测试主题',prompt:'a'.repeat(8193)},options)).rejects.toThrow(/8 KiB/);
  await expect(createStudioDraft({name:'测试主题',prompt:'测试。',baseId:'../escape',baseSource:'saved'},options)).rejects.toThrow(/id 无效/);
  expect(()=>validateDesign({version:1,prompt:'x',adjustment:'',changes:[],parent:{id:'../escape'}})).toThrow();
 } finally {rmSync(dir,{recursive:true,force:true});}
});
it('设计和历史 API 限本机访问，历史 ID 必须合法', async () => {
 const {dir,options}=env();
 try {
  const handlers=createThemeHandlers({...options,rendersRoot:join(dir,'renders')});
  const request=(path:string,origin='http://127.0.0.1:8787')=>new Request(`http://127.0.0.1:8787${path}`,{headers:{host:'127.0.0.1:8787',origin}});
  expect((await handlers.design(request('/api/themes/moss-zen/design'),'moss-zen')).status).toBe(200);
  expect((await handlers.design(request('/api/themes/moss-zen/design','https://external.example'),'moss-zen')).status).toBe(403);
  expect((await handlers.history(request('/api/themes/renders'))).status).toBe(200);
  expect((await handlers.historyDetail(request('/api/themes/renders/x'),'../x')).status).toBe(400);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
