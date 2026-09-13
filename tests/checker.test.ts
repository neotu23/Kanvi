import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { normalizeReport } from '../src/features/validation/normalize-report';
import { runChecker } from '../src/features/validation/run-checker';
const base={htmlHash:'sample-hash',checkerCommit:'test-only'};
const good=readFileSync('tests/fixtures/basic-report.json','utf8');
const bad=readFileSync('tests/fixtures/overlap-report.json','utf8');
it('真实正常输出转为 passed，真实违规保留规则和段落证据', () => {
 expect(normalizeReport(good,0,base).status).toBe('passed');
 const r=normalizeReport(bad,1,base);
 expect(r.status).toBe('violations');
 expect(r.issues[0].rule).toBe('line-height');
 expect(r.issues[0].paragraphIndex).toBe(0);
 expect(r.issues[0].outerHTML).toContain('第一行');
});
it('不完整 JSON、矛盾退出码与异常不能伪装成功', () => {
 for(const [out,code] of [[good,1],[bad,0],['{}',0],['garbage',0],[good,2],['{"isValid":true,"source":"x","violations":[{}]}',0]] as const) {
  expect(normalizeReport(out,code,base).status).toBe('error');
 }
});
const dir=mkdtempSync(join(tmpdir(),'kanvi-checker-test-'));
const file=join(dir,'article.html');
writeFileSync(file,'<p>测试</p>');
const hash=createHash('sha256').update('<p>测试</p>').digest('hex');
const config={executable:'/nonexistent/kanvi-checker',argsPrefix:[],cwd:process.cwd(),commit:'test-only',timeoutMs:1000};
afterAll(()=>rmSync(dir,{recursive:true,force:true}));
it('检查器不存在时返回 error',async()=>{
 expect((await runChecker(file,hash,config)).status).toBe('error');
});
it('检查输入被修改时拒绝沿用原哈希',async()=>{
 expect((await runChecker(file,'wrong-hash',config)).error).toContain('哈希');
});
it('子进程超时或输出过多时终止并返回 error',async()=>{
 for(const source of ['setInterval(()=>{},1000)', 'process.stdout.write("x".repeat(2000000))']) {
  const script=join(dir,'runner.cjs'); writeFileSync(script,source);
  const r=await runChecker(file,hash,{...config,executable:process.execPath,argsPrefix:[script],timeoutMs:150});
  expect(r.status).toBe('error');
 }
});
