import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { frontmatter } from 'micromark-extension-frontmatter';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { parseDocument, visit, isAlias } from 'yaml';
import { createHash } from 'node:crypto';
import { ReferenceError } from '../references/contracts';
import { validateBlocks, type ContentBlock, type InlineText } from '../templates/render';

export const parserVersion = 'kanvi-markdown-1';
export const maxMarkdownBytes = 256 * 1024;
export interface SourceRange { start:number; end:number; line:number; column:number }
export interface ArticleDiagnostic extends SourceRange { code:string; message:string; severity:'error'|'warning' }
export interface ParsedMarkdown {
 parserVersion:string; sourceHash:string; metadata:{title?:string;date?:string;tags?:string[]};
 blocks:ContentBlock[]; sources:Array<SourceRange & {blockId:string;sourceText:string}>; diagnostics:ArticleDiagnostic[];
}
type AstNode={type:string;value?:string;children?:AstNode[];depth?:number;ordered?:boolean;start?:number|null;checked?:boolean|null;position?:{start:{offset?:number;line:number;column:number};end:{offset?:number}}};
export function parseMarkdown(source:string):ParsedMarkdown {
 if(typeof source!=='string'||!source.isWellFormed()||Buffer.byteLength(source,'utf8')>maxMarkdownBytes||source.length>200000)throw new ReferenceError('markdown-size','Markdown 需为有效文字，且不超过 256 KiB / 20 万字符。',413);
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source))throw new ReferenceError('markdown-encoding','文档含不支持的控制字符。',422);
 // micromark strips a leading BOM before computing offsets. Account for it explicitly.
 const bom=source.startsWith('\uFEFF')?1:0;
 const tree=fromMarkdown(source.slice(bom),{extensions:[gfm(),frontmatter(['yaml'])],mdastExtensions:[gfmFromMarkdown(),frontmatterFromMarkdown(['yaml'])]}) as AstNode;
 const result:ParsedMarkdown={parserVersion,sourceHash:createHash('sha256').update(source).digest('hex'),metadata:{},blocks:[],sources:[],diagnostics:[]};
 const range=(node:AstNode):SourceRange=>({start:bom+(node.position?.start.offset??0),end:bom+(node.position?.end.offset??source.length-bom),line:node.position?.start.line??1,column:(node.position?.start.column??1)+((node.position?.start.line??1)===1?bom:0)});
 const raw=(node:AstNode)=>{const r=range(node);return source.slice(r.start,r.end);};
 const diagnose=(node:AstNode,code:string,message:string,severity:'error'|'warning'='error')=>{
  if(result.diagnostics.length===199)result.diagnostics.push({...range(node),code:'too-many-diagnostics',message:'文档诊断过多，请拆分或处理后重试。',severity:'error'});
  else if(result.diagnostics.length<199)result.diagnostics.push({...range(node),code,message,severity});
 };
 let count=0;
 const bounded=(node:AstNode,depth=0):void=>{if(++count>20000||depth>32)throw new ReferenceError('markdown-complexity','文档结构过深或节点过多。',422);node.children?.forEach(n=>bounded(n,depth+1));};bounded(tree);
 if(/^\uFEFF?---\r?\n/.test(source)&&tree.children?.[0]?.type!=='yaml')diagnose(tree,'frontmatter-unclosed','文档开头的属性区缺少结束分隔线。');
 function metadata(node:AstNode){
  try{
   if((node.value?.length??0)>8192)throw Error('large metadata');
   const doc=parseDocument(node.value??'',{version:'1.2',schema:'core',strict:true,uniqueKeys:true,customTags:[],resolveKnownTags:false});
   if(doc.errors.length||doc.warnings.length)throw Error('invalid metadata');
   visit(doc,(_key,n)=>{if(n&&typeof n==='object'&&(isAlias(n)||('anchor'in n&&n.anchor)||('tag'in n&&n.tag)))throw Error('alias/tag');});
   const value=doc.toJS({maxAliasCount:0});
   if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>30)throw Error('metadata map');
   for(const [key,v]of Object.entries(value)){
    if(key==='title'||key==='date'){if(typeof v!=='string'||!v.trim()||v.length>200||/[\r\n\u0000-\u001f]/.test(v))throw Error('metadata scalar');result.metadata[key]=v;}
    else if(key==='tags'){const tags=typeof v==='string'?[v]:v;if(!Array.isArray(tags)||tags.length>30||!tags.every(t=>typeof t==='string'&&t.trim()&&t.length<=80&&!/[\r\n\u0000-\u001f]/.test(t)))throw Error('metadata tags');result.metadata.tags=tags;}
    else diagnose(node,'metadata-unused',`属性 ${key.slice(0,60)} 仅保存在原文，不输出为正文。`,'warning');
   }
  }catch{result.metadata={};diagnose(node,'invalid-frontmatter','属性区无效：只支持简短标题、日期与文字标签，不支持重复字段、别名、标签表达式或复杂值。');}
 }
 function text(node:AstNode,marks:Array<'strong'|'em'>):InlineText[]{
  const value=(node.value??'').replace(/\r\n?/g,'\n'),original=raw(node);
  const token=(s:string):InlineText=>({text:s,...(marks.length?{marks:[...marks]}:{})});
  if(/!\[\[|\[\^|%%|==|(?:^|\s)\^[\w-]+\s*$/.test(original))diagnose(node,'unsupported-obsidian','此处包含尚不支持的嵌入、脚注、注释、高亮或块标识，请先处理原文。');
  if(!original.includes('[['))return value?[token(value)]:[];
  // Recognize the small Obsidian text extension only when source and AST text agree.
  // Escapes/entities otherwise make decoded offsets ambiguous: retain text and block conversion.
  if(original!==value){diagnose(node,'ambiguous-wikilink','双链与转义/实体混排，无法可靠定位，请改为普通显示文字。');return value?[token(value)]:[];}
  const parts:InlineText[]=[];let end=0;
  const remaining=(s:string)=>{if(/\[\[|\]\]/.test(s))diagnose(node,'invalid-wikilink','双链标记不完整。');if(s)parts.push(token(s));};
  for(const match of value.matchAll(/\[\[([^\[\]\n]+)\]\]/g)){
   if(match.index!>end)remaining(value.slice(end,match.index));
   const fields=match[1].split('|');if(fields.length>2||!fields[0].trim()||fields.some(x=>!x.trim())){diagnose(node,'invalid-wikilink','双链目标或显示文字无效。');parts.push(token(match[0]));}
   else {parts.push(token(fields.at(-1)!));diagnose(node,'wikilink-text','双链保留显示文字，输出不包含跳转地址。','warning');}
   end=match.index!+match[0].length;
  }
  if(!end){diagnose(node,'invalid-wikilink','双链缺少结束标记。');return value?[token(value)]:[];}
  if(end<value.length)remaining(value.slice(end));return parts;
 }
 function inline(nodes:AstNode[],marks:Array<'strong'|'em'>=[]):InlineText[]{
  return nodes.flatMap(node=>{
   if(node.type==='text')return text(node,marks);
   if(node.type==='break')return [{text:'\n',...(marks.length?{marks:[...marks]}:{})}];
   if(node.type==='strong'||node.type==='emphasis'){const mark=node.type==='strong'?'strong':'em';return inline(node.children??[],marks.includes(mark)?marks:[...marks,mark]);}
   diagnose(node,`unsupported-${node.type}`,`暂不支持 ${node.type} 行内结构，请处理后重新导入。`);return [];
  });
 }
 function add(node:AstNode,block:ContentBlock){result.blocks.push(block);result.sources.push({...range(node),blockId:block.id,sourceText:raw(node)});}
 for(const node of tree.children??[]){
  const id=`b-${range(node).start}-${range(node).end}`;
  if(node.type==='yaml'){metadata(node);continue;}
  if(node.type==='paragraph'||node.type==='heading'){const content=inline(node.children??[]);if(content.length)add(node,{id,kind:node.type==='heading'?'heading':'body',content,...(node.type==='heading'?{level:node.depth}:{})});continue;}
  if(node.type==='thematicBreak'){add(node,{id,kind:'divider'});continue;}
  if(node.type==='blockquote'){
   const children=node.children??[];
   if(!children.length||children.some(n=>n.type!=='paragraph')){diagnose(node,'unsupported-quote','引用只支持非空文字段落，暂不支持嵌套引用、列表或标题。');continue;}
   const paragraphs=children.map(p=>inline(p.children??[]));
   const first=paragraphs[0]?.[0];
   const marker=raw(children[0]).startsWith('[!')?first?.text.match(/^\[!([a-zA-Z][\w-]*)\]([+-]?)[\t ]*/):null;
   if(marker){
    if(marker[2])diagnose(children[0],'unsupported-callout','暂不支持折叠提示块，请去掉折叠符号后重新导入。');
    else {
     const title=paragraphs[0].map(t=>t.text).join('').slice(marker[0].length).split('\n')[0].trim();
     first.text=(title?'':marker[1])+first.text.slice(marker[0].length);
     paragraphs[0]=paragraphs[0].filter(t=>t.text.length>0);
     diagnose(children[0],'callout-quote','提示块转为引用，保留标题和正文；无标题时以提示类型作标题。','warning');
    }
   }
   if(paragraphs.some(p=>!p.length)){diagnose(node,'empty-quote','引用包含无法输出的空段落。');continue;}
   add(node,{id,kind:'quote',paragraphs});continue;
  }
  if(node.type==='list'){
   const children=node.children??[];
   if(!children.length||children.some(n=>n.checked!=null||n.children?.length!==1||n.children[0].type!=='paragraph')){diagnose(node,'unsupported-list','列表只支持单段文字项，不支持任务、嵌套或多段列表。');continue;}
   const items=children.map(n=>inline(n.children![0].children??[]));
   if(items.some(p=>!p.length)){diagnose(node,'empty-list','列表包含无法输出的空项目。');continue;}
   add(node,{id,kind:'list',items,ordered:Boolean(node.ordered),...(node.ordered?{start:node.start??1}:{})});continue;
  }
  diagnose(node,`unsupported-${node.type}`,`暂不支持 ${node.type} 结构，请处理后重新导入。`);
 }
 if(!result.blocks.some(b=>b.kind!=='divider'))diagnose(tree,'empty-article','文档没有可输出的正文。');
 if(!result.diagnostics.some(d=>d.severity==='error')){
  try{result.blocks=validateBlocks(result.blocks);}catch(e){diagnose(tree,'invalid-content',e instanceof Error?e.message:'文章内容无效。');}
 }
 if(!result.metadata.title){const heading=result.blocks.find(b=>b.kind==='heading');if(heading?.kind==='heading')result.metadata.title=heading.content.map(t=>t.text).join('');}
 return result;
}
