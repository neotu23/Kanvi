import { validateDesignProperties, type DesignProperties } from '../ai/schema';
import { ReferenceError } from '../references/contracts';
export type BlockKind='heading'|'body'|'quote'|'list'|'divider';
export type Node=ElementNode|{slot:'blocks'|'text'}|{repeat:'items'|'paragraphs';child:ElementNode};
export interface ElementNode {id:string;tag:string;styles:DesignProperties;children:Node[]}
export interface TemplateDefinition {
 schemaVersion:1;name:string;tags:string[];
 source:{referenceId:string;referenceHash:string;analysisId:string};
 evidence:Record<string,string[]>;notes:string[];
 root:ElementNode;blocks:Partial<Record<BlockKind,ElementNode>>;emphasis?:ElementNode;
}
export const kinds:BlockKind[]=['heading','body','quote','list','divider'];
export const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function fail(message='模板结构或样式无效。'):never {throw new ReferenceError('invalid-template',message,422);}
export function object(value:unknown,keys:string[]):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail();
 return value as Record<string,unknown>;
}
function label(value:unknown,max=200):string {if(typeof value!=='string'||!value.trim()||value.length>max||/[<>\u0000-\u001f]/.test(value))fail();return value;}
const tags=['section','div','p','span','h1','h2','h3','h4','h5','h6','strong','em','blockquote','ul','ol','li','hr','br'];
const inlineTags=['span','strong','em','br'];
export function validateTemplate(value:unknown):TemplateDefinition {
 const t=object(value,['schemaVersion','name','tags','source','evidence','notes','root','blocks','emphasis']);
 if(t.schemaVersion!==1)fail();
 const source=object(t.source,['referenceId','referenceHash','analysisId']);
 if(typeof source.referenceId!=='string'||!/^[a-f0-9]{64}$/.test(source.referenceId)||source.referenceHash!==source.referenceId||typeof source.analysisId!=='string'||!uuid.test(source.analysisId))fail('模板来源记录无效。');
 const ids=new Set<string>(); const seen=new Set<object>(); let count=0;
 function element(input:unknown,depth:number,parent?:string):ElementNode {
  if(depth>8||++count>200||!input||typeof input!=='object'||seen.has(input))fail('模板嵌套过深、循环引用或节点过多。');
  seen.add(input);const n=object(input,['id','tag','styles','children']);
  if(typeof n.id!=='string'||! /^[a-z][a-z0-9-]{0,39}$/.test(n.id)||ids.has(n.id))fail('模板节点 ID 必须唯一且有效。');
  ids.add(n.id);
  if(typeof n.tag!=='string'||!tags.includes(n.tag)||!Array.isArray(n.children)||n.children.length>40)fail();
  if(parent&&(/^(p|h[1-6]|span|strong|em)$/.test(parent))&&!inlineTags.includes(n.tag))fail('块元素不能嵌入文字行内区域。');
  if(['br','hr'].includes(n.tag)&&n.children.length)fail();
  const styles=validateDesignProperties(n.styles,true);
  const children:Node[]=n.children.map(child=>{
   if(child&&typeof child==='object'&&'slot' in child){const slot=object(child,['slot']);if(!['blocks','text'].includes(slot.slot as string))fail();if(slot.slot==='blocks'&&!['div','section'].includes(n.tag as string))fail();return {slot:slot.slot as 'blocks'|'text'};}
   if(child&&typeof child==='object'&&'repeat' in child){const r=object(child,['repeat','child']);if(!['items','paragraphs'].includes(r.repeat as string))fail();const c=element(r.child,depth+1,n.tag as string);if(r.repeat==='items'&&(!['ul','ol'].includes(n.tag as string)||c.tag!=='li'))fail('列表位置必须位于列表和列表项之间。');return {repeat:r.repeat as 'items'|'paragraphs',child:c};}
   return element(child,depth+1,n.tag as string);
  });
  if(['ul','ol'].includes(n.tag)&&children.some(c=>!('repeat' in c)||c.repeat!=='items'))fail();
  return {id:n.id,tag:n.tag,styles,children};
 }
 function shape(node:ElementNode,role:string){const slots:string[]=[];let repeats=0;
  const walk=(n:Node)=>{if('slot'in n){slots.push(n.slot);return;}if('repeat'in n){slots.push(n.repeat);repeats++;walk(n.child);return;}n.children.forEach(walk);};walk(node);
  const expected=role==='root'?['blocks']:role==='quote'?['paragraphs','text']:role==='list'?['items','text']:role==='divider'?[]:['text'];
  if(JSON.stringify(slots)!==JSON.stringify(expected)||repeats>(['quote','list'].includes(role)?1:0))fail(`模板 ${role} 的内容位置必须完整且只出现一次。`);
  if(role==='divider'&&node.tag!=='hr')fail();
 }
 const root=element(t.root,0);shape(root,'root');
 const rawBlocks=object(t.blocks,kinds);if(!rawBlocks.body)fail('模板必须支持正文。');
 const blocks:TemplateDefinition['blocks']={};
 for(const kind of kinds)if(rawBlocks[kind]){blocks[kind]=element(rawBlocks[kind],0);shape(blocks[kind]!,kind);}
 const emphasis=t.emphasis===undefined?undefined:element(t.emphasis,0);if(emphasis){shape(emphasis,'emphasis');if(!['strong','em','span'].includes(emphasis.tag))fail();}
 const ev=object(t.evidence,[...ids]);const evidence:Record<string,string[]>={};
 for(const [id,list]of Object.entries(ev)){if(!Array.isArray(list)||list.length>40||!list.every(x=>typeof x==='string'&&/^e[1-9]\d*$/.test(x)))fail();evidence[id]=[...list];}
 if(!Array.isArray(t.tags)||t.tags.length<1||t.tags.length>8||!Array.isArray(t.notes)||t.notes.length>60)fail();
 return {schemaVersion:1,name:label(t.name,80),tags:t.tags.map(x=>label(x,30)),source:source as TemplateDefinition['source'],evidence,notes:t.notes.map(x=>label(x,400)),root,blocks,...(emphasis?{emphasis}:{})};
}
export function nodes(t:TemplateDefinition):ElementNode[]{const all:ElementNode[]=[];const visit=(n:Node)=>{if('slot'in n)return;if('repeat'in n){visit(n.child);return;}all.push(n);n.children.forEach(visit);};visit(t.root);Object.values(t.blocks).forEach(visit);if(t.emphasis)visit(t.emphasis);return all;}
export function styleCss(styles:DesignProperties):string {
 const safe=validateDesignProperties(styles,true);
 return Object.entries(safe).map(([key,value])=>`${key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}:${value}${typeof value==='number'&&!['lineHeight','fontWeight'].includes(key)?'px':''}`).join(';');
}
