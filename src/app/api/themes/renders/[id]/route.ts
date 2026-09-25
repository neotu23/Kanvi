import { themeHandlers } from '../../../../../features/themes/handlers';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return themeHandlers.historyDetail(request, (await context.params).id); }
