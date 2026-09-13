import { resolve } from 'node:path';
import { checkUpstream } from '../../../scripts/check-upstream.mjs';
import type { CheckerConfig } from './run-checker';
export function checkerConfig():CheckerConfig {
 return {executable:process.execPath,argsPrefix:[resolve('node_modules/tsx/dist/cli.mjs'),resolve('scripts/checker-entry.mjs')],cwd:process.cwd(),commit:checkUpstream(),timeoutMs:30000};
}
