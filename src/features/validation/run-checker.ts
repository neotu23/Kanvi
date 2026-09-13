import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { normalizeReport, type CheckReport } from './normalize-report';
export interface CheckerConfig { executable:string; argsPrefix:string[]; cwd:string; commit:string; timeoutMs:number }
export async function runChecker(htmlPath:string,htmlHash:string,config:CheckerConfig,signal?:AbortSignal):Promise<CheckReport> {
 const binding={htmlHash,checkerCommit:config.commit};
 const fail=(error:string):CheckReport=>({...binding,status:'error',issues:[],error});
 try {
  const bytes=await readFile(htmlPath);
  if(createHash('sha256').update(bytes).digest('hex')!==htmlHash) return fail('输入正文哈希不一致');
 } catch { return fail('无法读取待检测正文'); }
 if(signal?.aborted) return fail('检测已取消');
 return new Promise(resolve=>{
  const child=spawn(config.executable,[...config.argsPrefix,htmlPath,'--json'],{cwd:config.cwd,shell:false,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',size=0,finished=false;
  const kill=()=>{ if(!child.pid)return; try { if(process.platform!=='win32') process.kill(-child.pid,'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Process has already exited. */ } };
  const finish=(report:CheckReport)=>{
   if(finished)return; finished=true; clearTimeout(timer); signal?.removeEventListener('abort',abort); kill(); resolve(report);
  };
  const abort=()=>finish(fail('检测已取消'));
  const timer=setTimeout(()=>finish(fail('检查器运行超时')),config.timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});
  const collect=(chunk:Buffer,isError:boolean)=>{
   size+=chunk.length;
   if(size>1024*1024) return finish(fail('检查器输出超过限制'));
   if(isError) stderr+=chunk.toString(); else stdout+=chunk.toString();
  };
  child.stdout.on('data',(c:Buffer)=>collect(c,false)); child.stderr.on('data',(c:Buffer)=>collect(c,true));
  child.once('error',()=>finish(fail('无法启动检查器，请检查本地依赖')));
  child.once('close',async code=>{
   if(finished)return;
   try {
    if(createHash('sha256').update(await readFile(htmlPath)).digest('hex')!==htmlHash) return finish(fail('检测期间正文哈希发生变化'));
   } catch { return finish(fail('检测结束后无法核实正文')); }
   const report=normalizeReport(stdout,code,binding);
   if(report.status==='error' && stderr) report.error+='；'+stderr.slice(0,1000);
   finish(report);
  });
 });
}
