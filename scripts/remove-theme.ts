import { removeTheme } from '../src/features/themes/remove';

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
const id = parsed.get('id') ?? '';
const confirm = parsed.get('confirm') ?? '';
if (!id) {
  console.error('用法: npm run theme:remove -- --id <主题id> --confirm <主题id>');
  process.exitCode = 2;
} else {
  try {
    const removed = await removeTheme(id, confirm);
    console.log(JSON.stringify({
      removed: removed.id, origin: removed.origin,
      note: removed.origin === 'seed'
        ? '这是种子主题，可用 npm run theme:seed 从固定版本重新复制。'
        : '这是自有主题，删除后不可恢复；已有渲染历史仍可读取。',
      git: '删除只是移除工作副本，是否提交由你决定。',
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : '主题删除失败。');
    process.exitCode = 2;
  }
}
