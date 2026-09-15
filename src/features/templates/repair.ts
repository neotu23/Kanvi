import type { CheckIssue } from '../validation/normalize-report';
import { nodes,validateTemplate,fail,object,type TemplateDefinition } from './schema';
export interface TemplatePatch {nodeId:string;property:'lineHeight';value:number}
function target(issue:CheckIssue):string|null {
 if(issue.rule!=='line-height'||!issue.outerHTML)return null;
 const opening=/^<[a-z][a-z0-9]*\b[^>]*>/i.exec(issue.outerHTML)?.[0];if(!opening)return null;
 const classes=/\bclass=["']([^"']*)["']/.exec(opening)?.[1].split(/\s+/)??[];
 const ids=classes.filter(c=>/^kn-[a-z][a-z0-9-]{0,39}$/.test(c));return ids.length===1?ids[0].slice(3):null;
}
export function suggestedPatches(t:TemplateDefinition,issues:CheckIssue[]):TemplatePatch[]{
 const ids=new Set(issues.map(target));return nodes(t).filter(n=>ids.has(n.id)&&typeof n.styles.fontSize==='number'&&typeof n.styles.lineHeight==='number'&&n.styles.lineHeight<1.8).map(n=>({nodeId:n.id,property:'lineHeight',value:1.8}));
}
export function applyPatches(t:TemplateDefinition,input:unknown,issues:CheckIssue[]):TemplateDefinition {
 const definition=validateTemplate(t);if(!Array.isArray(input)||!input.length||input.length>20)fail('修正补丁为空或超过上限。');
 const eligible=new Set(issues.map(target));const seen=new Set<string>();const all=nodes(definition);
 for(const raw of input){const patch=object(raw,['nodeId','property','value']);if(typeof patch.nodeId!=='string'||!eligible.has(patch.nodeId)||seen.has(patch.nodeId)||patch.property!=='lineHeight'||typeof patch.value!=='number')fail('补丁必须来自可定位的行高问题。');const node=all.find(n=>n.id===patch.nodeId);if(!node||typeof node.styles.fontSize!=='number'||typeof node.styles.lineHeight!=='number'||patch.value<=node.styles.lineHeight||patch.value>3)fail('行高补丁不能删除或缩小原有样式。');node.styles.lineHeight=patch.value;seen.add(patch.nodeId);}
 return validateTemplate(definition);
}
