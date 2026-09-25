import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MAX_BACKUP_BYTES, restoreBackup } from '../src/features/themes/backup';
import { ReferenceError } from '../src/features/references/contracts';

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
const input = parsed.get('in') ?? '';
if (!input) {
  console.error('用法: npm run theme:restore -- --in <备份.json>');
  process.exitCode = 2;
} else {
  try {
    const raw = await readFile(resolve(input), 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > MAX_BACKUP_BYTES) throw new ReferenceError('invalid-backup', '备份文件超过导入上限。', 413);
    let value;
    try { value = JSON.parse(raw); } catch { throw new ReferenceError('invalid-backup', '备份文件不是有效 JSON。', 422); }
    const result = await restoreBackup(value);
    console.log(JSON.stringify({
      themes: result.themes, renders: result.renders,
      skippedExisting: { themes: result.themes.skipped, renders: result.renders.skipped },
      note: '恢复只新增，不覆盖已存在的主题或历史；被跳过的条目保持本机现状。',
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : '备份恢复失败。');
    process.exitCode = 2;
  }
}
