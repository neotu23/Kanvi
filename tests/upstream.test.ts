import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {expect,it} from 'vitest';
import {checkUpstream} from '../scripts/check-upstream.mjs';
it('固定提交之外新增的源码必须让版本检查失败',()=>{
 const root=mkdtempSync(join(tmpdir(),'kanvi-version-'));
 try {
  const cwd=join(root,'vendor/wechat-spec');mkdirSync(join(cwd,'cli/src'),{recursive:true});mkdirSync(join(root,'docs/locks'),{recursive:true});
  const git=(args:string[])=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
  git(['init','-q']);writeFileSync(join(cwd,'cli/src/index.ts'),'export const test=true;');git(['add','.']);git(['-c','user.name=Kanvi Test','-c','user.email=test@example.invalid','commit','-qm','fixture']);
  const commit=git(['rev-parse','HEAD']);
  writeFileSync(join(root,'docs/upstream-lock.json'),JSON.stringify({projects:[{id:'wechat-spec',commit}]}));
  writeFileSync(join(root,'docs/locks/wechat-cli.package-lock.json'),'{}');writeFileSync(join(cwd,'cli/package-lock.json'),'{}');
  expect(checkUpstream(root)).toBe(commit);
  writeFileSync(join(cwd,'cli/src/extra.ts'),'export const surprise=true;');
  expect(()=>checkUpstream(root)).toThrow();
 } finally {rmSync(root,{recursive:true,force:true});}
});
