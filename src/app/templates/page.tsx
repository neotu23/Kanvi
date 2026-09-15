import { TemplateWorkspace } from '../../components/TemplateWorkspace';
export default async function TemplatesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const query=await searchParams;
 return <TemplateWorkspace initialId={typeof query.template==='string'?query.template:undefined} initialVersion={typeof query.version==='string'?query.version:undefined}/>;
}
