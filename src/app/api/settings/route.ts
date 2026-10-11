import { settingsHandlers } from '../../../features/ai/settings-handlers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = settingsHandlers.read;
export const PUT = settingsHandlers.save;
