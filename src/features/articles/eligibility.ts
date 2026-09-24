import type { ParsedMarkdown } from './parse-markdown';
import type { TemplateDetail } from '../templates/repository';
import type { ContentBlock, InlineText } from '../templates/render';
const texts=(b:ContentBlock):InlineText[]=>b.kind==='list'?b.items.flat():b.kind==='quote'?b.paragraphs.flat():b.kind==='divider'?[]:b.content;
export function templateEligibility(parsed:ParsedMarkdown,template:TemplateDetail):{eligible:boolean;reasons:string[]}{
 const reasons:string[]=[];
 if(parsed.diagnostics.some(d=>d.severity==='error'))reasons.push('文档存在尚未处理的语法诊断。');
 if(template.status!=='rule-passed'||!template.check||!template.attempt)reasons.push('此版本的样例尚未通过规则检测。');
 for(const kind of new Set(parsed.blocks.map(b=>b.kind)))if(!template.record.definition.blocks[kind])reasons.push(`模板不支持 ${kind} 内容。`);
 if(!template.record.definition.emphasis&&parsed.blocks.some(b=>texts(b).some(t=>t.marks?.length)))reasons.push('模板不支持原文中的行内强调。');
 return {eligible:!reasons.length,reasons};
}
