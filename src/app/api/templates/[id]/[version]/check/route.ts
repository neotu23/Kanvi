import { templateHandlers } from '../../../../../../features/templates/handlers';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string;version:string}>}){const p=await context.params;return templateHandlers.check(request,p.id,p.version);}
