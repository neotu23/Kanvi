import { analysisHandlers } from '../../../../../features/ai/handlers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return analysisHandlers.POST(request, (await context.params).id);
}
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return analysisHandlers.GET(request, (await context.params).id);
}
