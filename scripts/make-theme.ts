import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createThemeDraft } from '../src/features/themes/factory';

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
const input = parsed.get('brief') ?? '';
if (!input) {
  console.error('用法: npm run theme:make -- --brief <风格说明.md>');
  process.exitCode = 2;
} else {
  try {
    const brief = await readFile(resolve(input), 'utf8');
    const draft = await createThemeDraft(brief);
    console.log(JSON.stringify({
      themeId: draft.themeId, name: draft.name, path: draft.path,
      lint: { ok: draft.lint.ok, errors: draft.lint.errorCount, warnings: draft.lint.warnCount, issues: draft.lint.issues.slice(0, 5) },
      model: draft.model, promptVersion: draft.promptVersion, skillCommit: draft.skillCommit,
      next: '草案不会自动入库：在 /styles 预览气质后确认，或运行 npm run theme:confirm -- --draft ' + draft.themeId,
      scope: '受控流程：lint 为本地真实执行；未执行公众号实测',
    }, null, 2));
    process.exitCode = draft.lint.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : '主题草案生成失败。');
    process.exitCode = 2;
  }
}
