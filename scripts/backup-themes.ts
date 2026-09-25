import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { exportBackup } from '../src/features/themes/backup';

function options(argv: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) { values.set(token.slice(2), ''); continue; }
    values.set(token.slice(2), value);
    index += 1;
  }
  return values;
}

const parsed = options(process.argv.slice(2));
const out = resolve(parsed.get('out') || `artifacts/backup/kanvi-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
try {
  const backup = await exportBackup();
  await mkdir(dirname(out), { recursive: true, mode: 0o700 });
  await writeFile(out, JSON.stringify(backup, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  console.log(JSON.stringify({
    out, themes: backup.themes.length, renders: backup.renders.length,
    skipped: backup.skipped, contentHash: backup.contentHash,
    scope: '主题包（三件套 + 来源记录）与渲染历史；不含草案、artifacts、vendor、冻结链路 data 与密钥',
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : '备份导出失败。');
  process.exitCode = 2;
}
