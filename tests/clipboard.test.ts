import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { expect,it } from 'vitest';
import { buildClipboardPayload,writeHtmlSource } from '../src/features/output/clipboard';
import { articleDocument } from '../src/features/output/document';
import { ThemeResult } from '../src/components/ThemeResult';
import type { RenderDetail } from '../src/features/themes/repository';
it('复制载荷保留最终样式，不复制 HTML 代码文本或重新渲染',()=>{
 const artifact={bodyHtml:'<p style="color:#333">周末</p>',plainText:'周末',htmlHash:'bound-to-this-output'};
 expect(buildClipboardPayload(artifact)).toEqual({html:'<p style="color:#333">周末</p>',text:'周末'});
});
it('复制全文写入与下载一致的整份 HTML 源码，没有正文时明确报错',async()=>{
 const written:string[]=[];
 const clipboard={writeText:async(text:string)=>{written.push(text);}};
 const source=articleDocument('<p style="color:#333">周末</p>');
 await writeHtmlSource(clipboard,source);
 expect(written).toEqual([source]);
 expect(source.startsWith('<!doctype html>')).toBe(true);
 expect(source).toContain('<p style="color:#333">周末</p>');
 await expect(writeHtmlSource(clipboard,' \n ')).rejects.toThrow('当前没有可复制的正文。');
 expect(written).toHaveLength(1);
});
it('复制全文按钮排在下载 HTML 右侧，未通过检测时也保留',()=>{
 const detail={record:{
  id:'record-1',parsed:{metadata:{title:'雨后的傍晚'}},
  theme:{id:'moss-zen',name:'苔绿',origin:'seed',definitionHash:'theme-hash'},
  artifact:{bodyHtml:'<section style="padding:24px"><p>雨停了。</p></section>',plainText:'雨停了。',htmlHash:'html-hash'},
  validate:{errorCount:0,warnCount:0,issues:[]},fidelity:{ok:true,missing:[],residue:[],added:[]},notes:[],
  skill:{promptVersion:'v1',commit:'abc'},model:'fixture'},status:'checking'} as unknown as RenderDetail;
 const $=load(renderToStaticMarkup(createElement(ThemeResult,{detail})));
 expect($('.output-actions .output-row button').map((_,node)=>$(node).text()).get()).toEqual(['下载 HTML（未通过检查）','复制全文']);
 expect($('.output-actions .copy-action p[role=status]').text()).toBe('');
});
