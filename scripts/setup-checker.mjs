import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, delimiter } from 'node:path';
import { checkUpstream } from './check-upstream.mjs';
const root=process.cwd();
const lock=JSON.parse(readFileSync('docs/upstream-lock.json','utf8'));
mkdirSync('vendor',{recursive:true});
for(const project of lock.projects) {
 const target=resolve('vendor',project.id);
 if(!existsSync(target)) {
  execFileSync('git',['clone',project.url,target],{stdio:'inherit'});
  execFileSync('git',['checkout','--detach',project.commit],{cwd:target,stdio:'inherit'});
 }
}
const cwd=resolve('vendor/wechat-spec/cli');
const saved=resolve('docs/locks/wechat-cli.package-lock.json');
const dest=resolve(cwd,'package-lock.json');
if(existsSync(dest) && !readFileSync(saved).equals(readFileSync(dest))) throw new Error('现有检查器锁文件不同，请先核查本地更改');
copyFileSync(saved,dest);
checkUpstream(root);
const npm=process.env.npm_execpath;
if(!npm) throw new Error('请使用 npm run setup:checker');
execFileSync(process.execPath,[npm,'ci'],{cwd,stdio:'inherit',env:{...process.env,PUPPETEER_SKIP_DOWNLOAD:'true',PATH:dirname(process.execPath)+delimiter+process.env.PATH}});
console.log('检查器已准备完成；使用系统 Chrome，其他位置可设置 PUPPETEER_EXECUTABLE_PATH。');
