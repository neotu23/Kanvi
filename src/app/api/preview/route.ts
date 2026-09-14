import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildOutput } from '../../../features/output/build-output';
import { inline } from '../../../features/output/inline';
import { runChecker } from '../../../features/validation/run-checker';
import { checkerConfig } from '../../../features/validation/config';
import type { CheckReport } from '../../../features/validation/normalize-report';
import { isLocalRequest } from '../../../features/validation/local-request';
export const runtime='nodejs';
let running=false;
export async function POST(request:Request) {
 if(!isLocalRequest(request)) return Response.json({error:'仅接受本机页面的请求'},{status:403});
 if(running) return Response.json({error:'正在检测，请稍后再试'},{status:409});
 running=true;
 try {
  const [html,css]=await Promise.all([readFile(resolve('tests/fixtures/styled-source.html'),'utf8'),readFile(resolve('tests/fixtures/styled-source.css'),'utf8')]);
  const artifact=buildOutput(html,css,inline);
  const dir=resolve('artifacts',artifact.htmlHash);
  await mkdir(dir,{recursive:true});
  const path=resolve(dir,'body.html'); await writeFile(path,artifact.bodyHtml,'utf8');
  let check:CheckReport;
  try { check=await runChecker(path,artifact.htmlHash,checkerConfig(),request.signal); }
  catch { check={status:'error',htmlHash:artifact.htmlHash,checkerCommit:'unavailable',issues:[],error:'检查器尚未准备好或版本不一致，请按 README 安装并核查。'}; }
  await writeFile(resolve(dir,'report.json'),JSON.stringify(check,null,2),'utf8');
  return Response.json({artifact,check},{headers:{'Cache-Control':'no-store'}});
 } catch { return Response.json({error:'样例生成失败，请检查本地样例和依赖。'},{status:500}); }
 finally {running=false;}
}
