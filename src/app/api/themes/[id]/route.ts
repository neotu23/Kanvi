import { themeHandlers } from '../../../../features/themes/handlers';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){const p=await context.params;return themeHandlers.remove(request,p.id);}
