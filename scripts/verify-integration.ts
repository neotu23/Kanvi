import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { buildOutput } from '../src/features/output/build-output';
import { inline } from '../src/features/output/inline';
import { runChecker } from '../src/features/validation/run-checker';
import { checkerConfig } from '../src/features/validation/config';
await mkdir('artifacts',{recursive:true});
const config=checkerConfig();
const artifact=buildOutput(await readFile('tests/fixtures/styled-source.html','utf8'),await readFile('tests/fixtures/styled-source.css','utf8'),inline);
await writeFile('artifacts/styled.html',artifact.bodyHtml);
const reports=[];
for (const [path,expected] of [['tests/fixtures/basic.html','passed'],['tests/fixtures/overlap.html','violations'],['artifacts/styled.html','passed']] as const) {
 const html=await readFile(path,'utf8');
 const report=await runChecker(resolve(path),createHash('sha256').update(html).digest('hex'),config);
 reports.push({path,report}); console.log(path,JSON.stringify(report));
 assert.equal(report.status,expected);
}
await writeFile('artifacts/integration.json',JSON.stringify({node:process.version,artifact,reports},null,2));
