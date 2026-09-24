import { load } from 'cheerio';
import { buildOutput } from '../output/build-output';
import { inline } from '../output/inline';
import { fail,object,validateTemplate,styleCss,type TemplateDefinition,type Node,type ElementNode,type BlockKind } from './schema';
export interface InlineText {text:string;marks?:Array<'strong'|'em'>}
export type ContentBlock={id:string;kind:'body'|'heading';content:InlineText[];level?:number}|{id:string;kind:'quote';paragraphs:InlineText[][]}|{id:string;kind:'list';items:InlineText[][];ordered?:boolean;start?:number}|{id:string;kind:'divider'};
function escape(text:string){return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
export function validateBlocks(value:unknown):ContentBlock[]{
 if(!Array.isArray(value)||!value.length||value.length>500)fail('文章内容为空或段落过多。');
 const ids=new Set<string>();let length=0;
 function tokens(input:unknown):InlineText[]{if(!Array.isArray(input)||!input.length||input.length>1000)fail('文字内容无效。');return input.map(raw=>{const item=object(raw,['text','marks']);if(typeof item.text!=='string'||!item.text.length||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(item.text))fail();length+=item.text.length;if(length>200000)fail('文章文字过多。');if(item.marks!==undefined&&(!Array.isArray(item.marks)||item.marks.length>2||new Set(item.marks).size!==item.marks.length||!item.marks.every(x=>x==='strong'||x==='em')))fail();return {text:item.text,...(item.marks?{marks:item.marks as InlineText['marks']}:{})};});}
 return value.map(raw=>{const b=object(raw,['id','kind','content','level','paragraphs','items','ordered','start']);if(typeof b.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(b.id)||ids.has(b.id))fail('内容块 ID 无效或重复。');ids.add(b.id);
  const base={id:b.id};
  if(b.kind==='body'||b.kind==='heading'){if(b.items!==undefined||b.paragraphs!==undefined||b.ordered!==undefined||b.start!==undefined||(b.level!==undefined&&(b.kind!=='heading'||!Number.isInteger(b.level)||Number(b.level)<1||Number(b.level)>6)))fail();return {...base,kind:b.kind,content:tokens(b.content),...(b.level!==undefined?{level:b.level as number}:{})};}
  if(b.kind==='quote'||b.kind==='list'){const input=b.kind==='quote'?b.paragraphs:b.items;if(!Array.isArray(input)||!input.length||input.length>100||b.content!==undefined||b.level!==undefined||(b.kind==='quote'&&(b.items!==undefined||b.ordered!==undefined||b.start!==undefined))||(b.kind==='list'&&(b.paragraphs!==undefined||(b.ordered!==undefined&&typeof b.ordered!=='boolean')||(b.start!==undefined&&(!b.ordered||!Number.isInteger(b.start)||Number(b.start)<0||Number(b.start)>999999999)))))fail('引用或列表不可为空，且必须完整声明。');const parts=input.map(tokens);return b.kind==='quote'?{...base,kind:'quote',paragraphs:parts}:{...base,kind:'list',items:parts,...(b.ordered!==undefined?{ordered:b.ordered as boolean}:{}),...(b.start!==undefined?{start:b.start as number}:{})};}
  if(b.kind==='divider'&&Object.keys(b).length===2)return {...base,kind:'divider'};return fail('不支持的内容类型。');
 });
}
function blockText(block:ContentBlock):string {const text=(x:InlineText[])=>x.map(y=>y.text).join('');return block.kind==='quote'?block.paragraphs.map(text).join(''):block.kind==='list'?block.items.map(text).join(''):block.kind==='divider'?'':text(block.content);}
export function renderTemplate(definition:TemplateDefinition,input:ContentBlock[]){
 const t=validateTemplate(definition),blocks=validateBlocks(input);
 type Context={text?:string;block?:ContentBlock;index?:number;group?:string;mark?:'strong'|'em'};
 function renderTokens(tokens:InlineText[]):string{return tokens.map(token=>{let result=escape(token.text).replace(/\n/g,'<br>');for(const mark of token.marks??[]){if(!t.emphasis)fail('模板不支持行内强调，不能删除原文标记。');result=render(t.emphasis,{text:result,mark});}return result;}).join('');}
 function render(node:Node,ctx:Context):string {
  if('slot'in node){if(node.slot==='text'){if(ctx.text===undefined)fail('文字位置缺少内容。');return ctx.text;}return blocks.map((b,i)=>{const renderer=t.blocks[b.kind];if(!renderer)fail(`模板不支持 ${b.kind} 内容。`);const text=b.kind==='body'||b.kind==='heading'?renderTokens(b.content):undefined;return `<section class="kb-${i}">${render(renderer,{block:b,index:i,text})}</section>`;}).join('');}
  if('repeat'in node){const b=ctx.block;const groups=node.repeat==='items'&&b?.kind==='list'?b.items:node.repeat==='paragraphs'&&b?.kind==='quote'?b.paragraphs:null;if(!groups)fail('重复内容位置与文章结构不一致。');return groups.map((parts,i)=>render(node.child,{...ctx,text:renderTokens(parts),group:`kg-${ctx.index}-${i}`})).join('');}
  let tag=node.tag;if(ctx.mark&&['strong','em'].includes(tag))tag=ctx.mark;
  if(ctx.block?.kind==='heading'&&/^h[1-6]$/.test(tag))tag=`h${ctx.block.level??2}`;
  if(ctx.block?.kind==='list'&&['ul','ol'].includes(tag))tag=ctx.block.ordered?'ol':'ul';
  const classes=`kn-${node.id}${ctx.group?' '+ctx.group:''}`;
  const start=`<${tag} class="${classes}" style="${styleCss(node.styles)}"${tag==='ol'&&ctx.block?.kind==='list'&&ctx.block.start!==undefined?` start="${ctx.block.start}"`:''}>`;
  return start+(['br','hr'].includes(tag)?'':node.children.map(c=>render(c,{...ctx,group:undefined})).join('')+`</${tag}>`);
 }
 const artifact=buildOutput(render(t.root,{}),'',inline);
 const $=load(artifact.bodyHtml,{},false);$('br').replaceWith('\n');
 if($('[class^="kb-"]').length!==blocks.length)fail('排版改变了内容块数量。');
 blocks.forEach((b,i)=>{
  if($(`.kb-${i}`).length!==1||$(`.kb-${i}`).text()!==blockText(b))fail('排版改变了原文内容或顺序。');
  const parts=b.kind==='quote'?b.paragraphs:b.kind==='list'?b.items:null;
  if(parts)parts.forEach((tokens,j)=>{if($(`.kg-${i}-${j}`).length!==1||$(`.kg-${i}-${j}`).text()!==tokens.map(x=>x.text).join(''))fail('排版改变了引用或列表的段落。');});
 });
 return artifact;
}
export function sampleBlocks(t:TemplateDefinition):ContentBlock[]{
 const result:ContentBlock[]=[];
 if(t.blocks.heading)result.push({id:'title',kind:'heading',level:2,content:[{text:'慢慢走过一个普通的周末，记录路上看见的小事'}]});
 result.push({id:'short',kind:'body',content:[{text:'雨停了，沿着河边走一会儿。'}]});
 result.push({id:'long',kind:'body',content:[{text:'路边的树叶还带着水珠，晚风吹过来，脚步也慢了下来。'.repeat(8)}]});
 if(t.emphasis)result.push({id:'marked',kind:'body',content:[{text:'把这些'},{text:'平常的小事',marks:['strong']},{text:'记下来。'}]});
 if(t.blocks.quote)result.push({id:'quote',kind:'quote',paragraphs:[[{text:'给自己留一点安静的时间。'}],[{text:'明天也可以继续慢慢走。'}]]});
 if(t.blocks.list)result.push({id:'list',kind:'list',items:[[{text:'走到河边。'}],[{text:'带一本书，在长椅上坐一会儿。'}],[{text:'回家之前买一些水果。'}]]});
 if(t.blocks.divider)result.push({id:'divider',kind:'divider'});
 result.push({id:'end',kind:'body',content:[{text:'这就是今天的记录。'}]});return result;
}
