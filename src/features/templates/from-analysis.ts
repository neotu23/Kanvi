import type { AnalysisRecord } from '../ai/design-analysis';
import { validateAnalysis, type DesignProperties } from '../ai/schema';
import { fail,validateTemplate,type ElementNode,type TemplateDefinition,type BlockKind } from './schema';
export function templateFromAnalysis(record:AnalysisRecord):TemplateDefinition {
 // AnalysisRepository verifies source binding before this compiler is called by an API.
 const evidenceIds=[...new Set(record.design.textStyles.flatMap(s=>s.evidenceIds).concat(record.design.regions.flatMap(s=>s.evidenceIds),record.design.estimates.flatMap(s=>s.evidenceIds),record.design.unsupported.flatMap(s=>s.evidenceIds)))];
 const design=validateAnalysis(record.design,evidenceIds.map(id=>({id,parentId:null,tag:'section',text:'',declarations:[]})));
 const profiles=new Map<string,typeof design.textStyles[number]>();
 for(const profile of design.textStyles){if(profiles.has(profile.role))fail(`同一角色 ${profile.role} 存在多个风格，暂不能确定内容分配；请先调整设计分析。`);profiles.set(profile.role,profile);}
 if(!profiles.has('body'))fail('设计没有正文样式，无法生成完整模板。');
 const evidence:Record<string,string[]>={};
 const element=(id:string,tag:string,styles:DesignProperties,children:ElementNode['children']):ElementNode=>({id,tag,styles,children});
 const root=element('container','section',profiles.get('container')?.properties??{},[{slot:'blocks'}]);
 evidence.container=(profiles.get('container')??profiles.get('body'))!.evidenceIds;
 const blocks:TemplateDefinition['blocks']={};
 for(const role of ['body','heading','quote','list','divider'] as BlockKind[]){const p=profiles.get(role);if(!p)continue;
  const tag={body:'p',heading:'h2',quote:'blockquote',list:'ul',divider:'hr'}[role];
  const children:ElementNode['children']=role==='divider'?[]:role==='quote'?[{repeat:'paragraphs',child:element('quote-paragraph','p',{},[{slot:'text'}])}]:role==='list'?[{repeat:'items',child:element('list-item','li',{},[{slot:'text'}])}]:[{slot:'text'}];
  blocks[role]=element(role,tag,p.properties,children);evidence[role]=p.evidenceIds;
  if(role==='quote')evidence['quote-paragraph']=p.evidenceIds;
  if(role==='list')evidence['list-item']=p.evidenceIds;
 }
 const emphasis=profiles.get('emphasis');if(emphasis)evidence.emphasis=emphasis.evidenceIds;
 const regions=design.regions.map(r=>({role:r.role,evidenceIds:r.evidenceIds,nodeIds:r.role==='container'?['container']:profiles.has(r.role)?[r.role]:[]}));
 const notes=['模板采用语义化内容位置；来源的复杂区域布局尚未自动重建。','仅支持已声明的文字类型；没有样式的类型不会自动补成默认主题。'];
 if(design.textStyles.some(s=>s.basis==='estimated')||design.estimates.length)notes.push('设计包含估计值，样例检测不证明其视觉还原准确。');
 if(design.unsupported.length)notes.push(`来源包含 ${design.unsupported.length} 项未支持设计，未加入模板；详情保留在原分析中。`);
 return validateTemplate({schemaVersion:1,name:design.tags.join(' · ').slice(0,80),tags:design.tags,source:{referenceId:record.referenceId,referenceHash:record.referenceHash,analysisId:record.id},evidence,regions,syntheticNodes:Object.keys(evidence),notes,root,blocks,...(emphasis?{emphasis:element('emphasis','strong',emphasis.properties,[{slot:'text'}])}:{})});
}
