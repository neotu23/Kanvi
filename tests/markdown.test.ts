import { expect, it } from 'vitest';
import { load } from 'cheerio';
import { parseMarkdown } from '../src/features/articles/parse-markdown';
import { renderTemplate } from '../src/features/templates/render';
import { templateFromAnalysis } from '../src/features/templates/from-analysis';
import { analysisFixture } from './fixtures/template-source';

it('保留源位置、重复段落、转义字符与行内结构，渲染不增删文字', () => {
 const source = '# 周末\n\n雨停了。\n\n雨停了。\n\n**树叶**和*晚风*，\\*原样\\* &amp; <https://example.com>。';
 const result = parseMarkdown(source);
 expect(result.diagnostics.some(d => d.code === 'unsupported-link')).toBe(true);
 const good = parseMarkdown(source.replace(' <https://example.com>', ''));
 expect(good.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
 expect(good.blocks.map(b=>b.kind)).toEqual(['heading','body','body','body']);
 expect(good.sources.map(s=>source.slice(s.start,s.end)).slice(0,3)).toEqual(['# 周末','雨停了。','雨停了。']);
 expect(new Set(good.blocks.map(b=>b.id)).size).toBe(4);
 const html=renderTemplate(templateFromAnalysis(analysisFixture()),good.blocks).bodyHtml;
 const $=load(html);expect($('strong').text()).toBe('树叶');expect($('em').text()).toBe('晚风');
 expect($('.kb-3').text()).toBe('树叶和晚风，*原样* &。');
 expect(parseMarkdown(source).sources).toEqual(result.sources);
});
it('保留有序列表起始编号、标题级别和换行',()=>{
 const result=parseMarkdown('###### 小标题\n\n7. 第七件事\n8. 第八件事\n\n第一行  \n第二行\n第三行');
 expect(result.diagnostics).toEqual([]);
 const $=load(renderTemplate(templateFromAnalysis(analysisFixture()),result.blocks).bodyHtml);
 expect($('h6').text()).toBe('小标题');expect($('ol').attr('start')).toBe('7');
 expect($('li').map((_,el)=>$(el).text()).get()).toEqual(['第七件事','第八件事']);
 expect($('br').length).toBe(2);
});
it('属性区不生成正文标题，双链与提示块保留显示文字并记录转换',()=>{
 const result=parseMarkdown('---\ntitle: 我的记录\ndate: 2026-09-15\ntags: [生活, 散步]\n---\n\n去[[公园|河边]]走走。\n\n> [!note] 今天想记住\n> 慢慢来。\n>\n> 多看一会儿。');
 expect(result.metadata).toEqual({title:'我的记录',date:'2026-09-15',tags:['生活','散步']});
 expect(result.blocks.map(b=>b.kind)).toEqual(['body','quote']);
 const $=load(renderTemplate(templateFromAnalysis(analysisFixture()),result.blocks).bodyHtml);
 expect($('.kb-0').text()).toBe('去河边走走。');
 $('br').replaceWith('\n');
 expect($('blockquote').text()).toBe('今天想记住\n慢慢来。多看一会儿。');
 expect(result.diagnostics.map(d=>d.code)).toEqual(['wikilink-text','callout-quote']);
 expect(result.sources.every(s=>s.end>s.start&&s.line>0)).toBe(true);
});
it.each(['![图片](https://example.com/a.png)','![[图片.png]]','正文[^1]\n\n[^1]: 脚注','| 一 | 二 |\n| - | - |\n| 三 | 四 |','- [x] 任务','- 外层\n  - 内层','> > 嵌套引用','<script>alert(1)</script>','`代码`','~~删除线~~','正文 ^block','%%隐藏内容%%','==高亮==','> [!note]- 折叠\n> 内容'])('不支持的语法不能丢弃后成功：%s',source=>{
 const result=parseMarkdown(source);expect(result.diagnostics.some(d=>d.severity==='error')).toBe(true);
 expect(result.diagnostics.every(d=>Number.isInteger(d.start)&&d.end>=d.start&&d.line>=1)).toBe(true);
});
it.each(['---\ntitle: a\ntitle: b\n---\n正文','---\ntitle: &x 值\ntags: [*x]\n---\n正文','---\ntitle: !evil 值\n---\n正文','---\ntitle: [复杂, 标题]\n---\n正文','---\ntitle: 没有结尾',''])('损坏或过于复杂的属性区、空文档会阻止生成：%s',source=>{
 expect(parseMarkdown(source).diagnostics.some(d=>d.severity==='error')).toBe(true);
});
it('转义的双链仍是字面文字，文档大小与非法控制字符有限制',()=>{
 const p=parseMarkdown('保留\\[\\[文字\\]\\]。');
 expect(p.diagnostics).toEqual([]);expect(p.blocks[0]).toMatchObject({content:[{text:'保留[[文字]]。'}]});
 expect(()=>parseMarkdown('a'.repeat(300000))).toThrow();
 expect(()=>parseMarkdown('坏\u0000字符')).toThrow();
});
it('提示块的强调标题不补写类型，转义提示标记保持原样',()=>{
 const parsed=parseMarkdown('> [!note] **标题**\n> 正文');
 const $=load(renderTemplate(templateFromAnalysis(analysisFixture()),parsed.blocks).bodyHtml);$('br').replaceWith('\n');
 expect($('blockquote').text()).toBe('标题\n正文');expect($('strong').text()).toBe('标题');
 const escaped=parseMarkdown('> \\[!note] 原样文字');
 expect(escaped.diagnostics).toEqual([]);
 expect(escaped.blocks[0]).toMatchObject({paragraphs:[[{text:'[!note] 原样文字'}]]});
});
it('有效双链旁边的未闭合双链仍阻止生成',()=>{
 expect(parseMarkdown('[[河边]]和[[未写完').diagnostics.some(d=>d.severity==='error')).toBe(true);
});
it('诊断数量过多时阻止生成，不能让前面的提示吞掉后续错误',()=>{
 const result=parseMarkdown('[[文字]] '.repeat(205)+'\n\n<script>不能执行</script>');
 expect(result.diagnostics.some(d=>d.severity==='error')).toBe(true);
 expect(result.diagnostics.length).toBeLessThanOrEqual(200);
});
it('正文标题可作历史标题，属性区优先；BOM 和 CRLF 的源偏移仍准确',()=>{
 const source='\uFEFF---\r\ntitle: 属性标题\r\n---\r\n\r\n# 正文标题\r\n\r\n正文';
 const parsed=parseMarkdown(source);
 expect(parsed.metadata.title).toBe('属性标题');expect(parsed.diagnostics).toEqual([]);
 expect(parsed.sources.map(s=>source.slice(s.start,s.end))).toEqual(['# 正文标题','正文']);
 expect(parseMarkdown('# **周末**的记录\n\n正文').metadata.title).toBe('周末的记录');
});
