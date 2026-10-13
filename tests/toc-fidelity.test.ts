import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {parseThemeArticle} from '../src/features/themes/article';
import {checkFidelity} from '../src/features/themes/verify-article';

const p=(text:string)=>`<p><span leaf="">${text}</span></p>`;
const block=(...text:string[])=>`<section>${text.map(p).join('')}</section>`;
const wrap=(html:string)=>`<section>${html}</section>`;
const options={enforceSourceToc:true};

it.each(['目录','目次','看点','摘录','本篇三步','CONTENTS'])('原文只有章节时阻断新增的 %s，保留产物供核对',label=>{
 const parsed=parseThemeArticle('# 河边记录\n\n## 出门\n\n沿河散步。\n\n## 回家\n\n买了水果。');
 const html=wrap(p('河边记录')+block(label,'出门','回家','散步与水果')+p('出门')+p('沿河散步。')+p('回家')+p('买了水果。'));
 const result=checkFidelity(parsed,html,options);
 expect(result.ok).toBe(false);
 expect(result.missing).toEqual([]);
 expect(result.unexpectedToc?.length).toBeGreaterThan(0);
});

it('原文目录保留所有条目，不强制压成三个看点',()=>{
 const parsed=parseThemeArticle('# 出游\n\n## 目录\n\n- 出门。\n- 散步。\n- 买书。\n- 回家。\n\n## 正文\n\n沿河走一会儿。');
 const html=wrap(p('出游')+block('目录','1. 出门。','2. 散步。','3. 买书。','4. 回家。')+p('正文')+p('沿河走一会儿。'));
 expect(checkFidelity(parsed,html,options)).toMatchObject({ok:true,unexpectedToc:[]});
});

it('原文目录的单字条目同样保留，不当作新增文字',()=>{
 const parsed=parseThemeArticle('# X\n\n## 目录\n\n- A\n- B\n\n## 正文\n\n内容。');
 expect(checkFidelity(parsed,wrap(p('X')+block('目录','A','B')+p('正文')+p('内容。')),options)).toMatchObject({ok:true,unexpectedToc:[]});
});

it('属性区提供的目录同名文章标题不误报，但不能掩盖另加的目录',()=>{
 const parsed=parseThemeArticle('---\ntitle: 目录\n---\n\n内容。');
 expect(checkFidelity(parsed,wrap('<h1>目录</h1>'+p('内容。')),options)).toMatchObject({ok:true,unexpectedToc:[]});
 expect(checkFidelity(parsed,wrap('<h1>目录</h1>'+block('目录','新增看点')+p('内容。')),options).ok).toBe(false);
});

it.each(['重复目录','扩写目录'])('原文已有目录仍阻断%s',kind=>{
 const parsed=parseThemeArticle('# 出游\n\n## 目录\n\n- 出门。\n- 回家。\n\n## 正文\n\n沿河走一会儿。');
 const toc=block('目录','出门。','回家。');
 const extra=kind==='重复目录'?toc:block('目录','出门。','新增看点。','回家。');
 const html=wrap(p('出游')+(kind==='重复目录'?toc+extra:extra)+p('正文')+p('沿河走一会儿。'));
 expect(checkFidelity(parsed,html,options)).toMatchObject({ok:false,missing:[]});
});

it('正文讨论目录以及代码示例里的目录字样不误报',()=>{
 const parsed=parseThemeArticle('# 文件整理\n\n讨论目录的组织方式。\n\n```text\n目录\n示例文件\n```\n\n正文继续。');
 const html=wrap(p('文件整理')+p('讨论目录的组织方式。')+block('目录','示例文件')+p('正文继续。'));
 expect(checkFidelity(parsed,html,options)).toMatchObject({ok:true,unexpectedToc:[]});
});

it('从自定义主题 toc 槽识别目录标签，不依赖主题名称',()=>{
 const themeMarkdown='### slot:toc\n\n```html\n<section><p><span leaf="">阅读路线</span></p><p><span leaf="">{{item1}}</span></p></section>\n```';
 const parsed=parseThemeArticle('原文只有这一段。');
 expect(checkFidelity(parsed,wrap(block('阅读路线','新增看点')+p('原文只有这一段。')),{...options,themeMarkdown}).ok).toBe(false);
});

it.each(['graphite-editorial','moss-zen','paper-journal','mist-masthead','cinnabar-catalog','step-workshop'])('检测 %s 的真实目录槽',id=>{
 const themeMarkdown=readFileSync(join('themes',id,'THEME.md'),'utf8');
 const slot=themeMarkdown.match(/### slot:toc\s*\n```html\s*\n([\s\S]*?)```/)![1];
 const toc=slot.replace(/\{\{item\d\}\}/g,'新增看点');
 expect(checkFidelity(parseThemeArticle('原文只有这一段。'),wrap(toc+p('原文只有这一段。')),{...options,themeMarkdown}).ok).toBe(false);
});

it('历史保真算法仍允许旧版主题目录并复算原结论',()=>{
 const result=checkFidelity(parseThemeArticle('原文只有这一段。'),wrap(block('目录','旧版看点')+p('原文只有这一段。')));
 expect(result).toEqual({ok:true,missing:[],added:['目录 旧版看点'],residue:[]});
});
