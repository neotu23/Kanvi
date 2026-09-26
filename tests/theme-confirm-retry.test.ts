import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createThemeDraft } from '../src/features/themes/factory';
import { confirmDraft, listDrafts } from '../src/features/themes/confirm';

const fault=vi.hoisted(()=>({move:false}));
vi.mock('node:fs/promises',async importOriginal=>{
 const fs=await importOriginal<typeof import('node:fs/promises')>();
 return {...fs,rename:async (from:string,to:string)=>{
  if (fault.move) throw Object.assign(new Error('simulated move failure'),{code:'EACCES'});
  return fs.rename(from,to);
 }};
});
it('入库移动失败后草案记录仍在，可重试保存到尚不存在的主题库', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'kanvi-confirm-retry-'));
 const draftsRoot=join(dir,'drafts'),themesRoot=join(dir,'themes');
 try {
  const themeJson={...JSON.parse(await readFile('themes/moss-zen/theme.json','utf8')),id:'retry-theme',name:'重试主题'};
  const themeMarkdown=await readFile('themes/moss-zen/THEME.md','utf8');
  const previewHtml=await readFile('themes/moss-zen/preview.html','utf8');
  let calls=0;
  await createThemeDraft('安静、留白。',{draftsRoot,ai:{config:{apiKey:'fixture',model:'fixture'},transport:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(calls++===0?{id:'retry-theme',name:'重试主题',themeJson,themeMarkdown}:{previewHtml})}}]})}});
  fault.move=true;
  await expect(confirmDraft('retry-theme',{draftsRoot,themesRoot})).rejects.toThrow(/入库失败/);
  const entries=await listDrafts(draftsRoot);
  expect(entries[0].ok).toBe(true);
  fault.move=false;
  await expect(confirmDraft('retry-theme',{draftsRoot,themesRoot})).resolves.toMatchObject({themeId:'retry-theme'});
  expect(JSON.parse(await readFile(join(themesRoot,'retry-theme','DESIGN.json'),'utf8')).prompt).toBe('安静、留白。');
 } finally {fault.move=false;await rm(dir,{recursive:true,force:true});}
});
