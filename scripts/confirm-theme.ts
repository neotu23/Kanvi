import { confirmDraft, discardDraft, listDrafts } from '../src/features/themes/confirm';

function options(argv: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) { values.set(token.slice(2), '1'); continue; }
    values.set(token.slice(2), value);
    index += 1;
  }
  return values;
}

const parsed = options(process.argv.slice(2));
const themeId = parsed.get('draft') ?? '';
try {
  if (!themeId) {
    const drafts = await listDrafts();
    console.log(JSON.stringify({ drafts: drafts.map(entry => (entry.ok ? { themeId: entry.themeId, name: entry.draft?.name, lint: entry.draft?.lint } : { themeId: entry.themeId, error: entry.error })) }, null, 2));
    console.log('确认：npm run theme:confirm -- --draft <主题id>；丢弃：npm run theme:confirm -- --draft <主题id> --discard');
  } else if (parsed.has('discard')) {
    await discardDraft(themeId);
    console.log(JSON.stringify({ discarded: themeId }, null, 2));
  } else {
    const confirmed = await confirmDraft(themeId);
    console.log(JSON.stringify({ ...confirmed, next: '主题已入库，可在 /styles 选择并渲染文章；如需删除：npm run theme:remove -- --id ' + confirmed.themeId + ' --confirm ' + confirmed.themeId }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : '草案处理失败。');
  process.exitCode = 2;
}
