import type { AnalysisRecord } from '../../src/features/ai/design-analysis';
export function analysisFixture():AnalysisRecord {
 const basis={evidenceIds:['e1'],basis:'observed' as const,reason:'SOURCE_AUTHOR 的原始声明'};
 return {version:1,id:'11111111-1111-4111-8111-111111111111',referenceId:'a'.repeat(64),referenceHash:'a'.repeat(64),inputHash:'b'.repeat(64),createdAt:'2026-09-15T00:00:00.000Z',model:'test-fixture',promptVersion:'design-analysis-v1',status:'draft',design:{version:1,tags:['生活记录'],textStyles:[
 {role:'container',...basis,properties:{paddingLeft:12,paddingRight:12,color:'#333333'}},
 {role:'body',...basis,properties:{fontSize:16,lineHeight:1.8,marginBottom:20}},
 {role:'heading',...basis,properties:{fontSize:22,lineHeight:1.5,borderLeftWidth:3,borderLeftStyle:'solid',borderLeftColor:'#718064',paddingLeft:12}},
 {role:'quote',...basis,properties:{fontSize:16,lineHeight:1.8,paddingLeft:12,paddingRight:12,backgroundColor:'#f1f3ec',marginLeft:0,marginRight:0}},
 {role:'list',...basis,properties:{fontSize:16,lineHeight:1.8}},
 {role:'emphasis',...basis,properties:{fontWeight:700}},
 {role:'divider',...basis,properties:{borderWidth:1,borderStyle:'solid',borderColor:'#dddddd'}}],regions:[{name:'正文',role:'body',...basis}],estimates:[],unsupported:[]}};
}
