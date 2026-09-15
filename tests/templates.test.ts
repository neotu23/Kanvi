import { expect, it } from 'vitest';
import { load } from 'cheerio';
import { templateFromAnalysis } from '../src/features/templates/from-analysis';
import { validateTemplate } from '../src/features/templates/schema';
import { renderTemplate, sampleBlocks } from '../src/features/templates/render';
import { analysisFixture } from './fixtures/template-source';

it('设计草稿映射为带证据的自定义样式，不携带来源文章文字', () => {
 const t=templateFromAnalysis(analysisFixture());
 expect(t.tags).toEqual(['生活记录']);
 expect(t.blocks.heading?.styles.borderLeftColor).toBe('#718064');
 expect(JSON.stringify(t)).not.toContain('SOURCE_AUTHOR');
 const out=renderTemplate(t,sampleBlocks(t));
 expect(load(out.bodyHtml)('h2').attr('style')).toMatch(/border-left-color:\s*#718064/);
 expect(out.plainText).toContain('慢慢走过一个普通的周末');
});
it('自定义嵌套、重复段落、长标题、强调和列表保真，空可选区域可省略', () => {
 const t=templateFromAnalysis(analysisFixture());
 t.blocks.body={id:'custom-wrap',tag:'section',styles:{paddingLeft:12},children:[t.blocks.body!]};
 const blocks=sampleBlocks(t);
 blocks.push({id:'same1',kind:'body',content:[{text:'重复文字<&>。'}]},{id:'same2',kind:'body',content:[{text:'重复文字<&>。'}]});
 const out=renderTemplate(t,blocks); const $=load(out.bodyHtml);
 expect($('.kn-custom-wrap')).toHaveLength(blocks.filter(b=>b.kind==='body').length);
 expect(out.plainText.match(/重复文字<&>。/g)).toHaveLength(2);
 expect($('strong')).toHaveLength(1);
 expect($('li')).toHaveLength(3);
 expect(renderTemplate(t,[{id:'body',kind:'body',content:[{text:'只有正文'}]}]).plainText).toBe('只有正文');
});
it('拒绝代码、任意属性、重复内容位置、过深结构和循环引用', () => {
 const base=templateFromAnalysis(analysisFixture());
 const unknown=structuredClone(base) as any; unknown.root.onclick='alert(1)';
 expect(()=>validateTemplate(unknown)).toThrow();
 const script=structuredClone(base) as any; script.root.tag='script'; expect(()=>validateTemplate(script)).toThrow();
 const duplicate=structuredClone(base); duplicate.root.children.push({slot:'blocks'}); expect(()=>validateTemplate(duplicate)).toThrow();
 const literal=structuredClone(base) as any; literal.blocks.body.children=['SOURCE_AUTHOR']; expect(()=>validateTemplate(literal)).toThrow();
 const cycle=structuredClone(base); cycle.root.children=[cycle.root]; expect(()=>validateTemplate(cycle)).toThrow();
 const deep=structuredClone(base); for(let i=0;i<12;i++)deep.root={id:`deep${i}`,tag:'section',styles:{},children:[deep.root]}; expect(()=>validateTemplate(deep)).toThrow();
});
it('未知或不支持内容不得静默丢弃，重复 ID 和空正文明确失败', () => {
 const t=templateFromAnalysis(analysisFixture()); delete t.blocks.quote; delete t.evidence.quote;
 expect(()=>renderTemplate(t,[{id:'q',kind:'quote',paragraphs:[[{text:'引用'}]]}])).toThrow('不支持');
 expect(()=>renderTemplate(t,[])).toThrow();
 expect(()=>renderTemplate(t,[{id:'x',kind:'body',content:[{text:'一'}]},{id:'x',kind:'body',content:[{text:'二'}]}])).toThrow();
 expect(()=>renderTemplate(t,[{id:'x',kind:'body',content:[{text:'原文'}],html:'<script>x</script>'} as any])).toThrow();
});
it('同一角色多个风格不能静默选择第一个', () => {
 const a=analysisFixture(); a.design.textStyles.push({...a.design.textStyles[0]});
 expect(()=>templateFromAnalysis(a)).toThrow('多个');
});
