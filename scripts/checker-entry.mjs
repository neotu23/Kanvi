import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { checkUpstream } from './check-upstream.mjs';
let browser;
try {
 checkUpstream();
 const base=resolve('vendor/wechat-spec/cli');
 const require=createRequire(resolve(base,'package.json'));
 const puppeteer=require('puppeteer');
 const moduleAt=name=>import(pathToFileURL(resolve(base,'src',name)).href);
 const [{loadBrowserBundle},{runVerify},{formatJson}]=await Promise.all([moduleAt('bundle-loader.ts'),moduleAt('browser-runner.ts'),moduleAt('result-formatter.ts')]);
 const html=await readFile(process.argv[2],'utf8');
 browser=await puppeteer.launch({headless:'new',executablePath:process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
 const page=await browser.newPage();
 await page.setViewport({width:677,height:800});
 await page.setRequestInterception(true);
 page.on('request',request=>request.abort());
 await page.setContent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'none\'"><body></body>');
 await page.evaluate((await loadBrowserBundle())+'\nwindow.verifyArticleStructure=__verifyArticleStructureModule__.verifyArticleStructure;');
 const result=await runVerify(page,html);
 await browser.close(); browser=undefined;
 checkUpstream();
 process.stdout.write(formatJson(result,process.argv[2])+'\n');
 process.exitCode=result.isValid?0:1;
} catch(error) {
 console.error('检查器执行失败：'+error.message); process.exitCode=2;
} finally { if(browser) await browser.close(); }
