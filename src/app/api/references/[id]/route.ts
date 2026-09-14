import { referenceHandlers } from '../../../../features/references/handlers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return referenceHandlers.detail(request, (await context.params).id);
}
