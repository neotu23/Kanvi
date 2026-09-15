import { templateHandlers } from '../../../../../features/templates/handlers';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string;version:string}>}){const p=await context.params;return templateHandlers.detail(request,p.id,p.version);}
