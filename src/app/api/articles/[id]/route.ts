import { articleHandlers } from '../../../../features/articles/handlers';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return articleHandlers.detail(request,(await context.params).id);}
