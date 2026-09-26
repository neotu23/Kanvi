import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { themeArticleDocument } from '../src/features/themes/document';
import { renderArticle } from '../src/features/themes/render-article';

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
const themeId = parsed.get('theme') ?? '';
const input = parsed.get('input') ?? '';
if (!themeId || !input) {
  console.error('用法: npm run theme:render -- --theme <主题id> --input <文章.md>');
  process.exitCode = 2;
} else {
  try {
    const markdown = await readFile(resolve(input), 'utf8');
    const detail = await renderArticle(markdown, themeId);
    const dir = resolve('artifacts/renders', detail.record.id);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(join(dir, 'body.html'), detail.record.artifact.bodyHtml, { encoding: 'utf8', mode: 0o600 });
    await writeFile(join(dir, 'preview.html'), themeArticleDocument(detail.record.artifact.bodyHtml), { encoding: 'utf8', mode: 0o600 });
    await writeFile(join(dir, 'report.json'), JSON.stringify({
      status: detail.status, themeId: detail.record.theme.id, themeName: detail.record.theme.name,
      htmlHash: detail.record.artifact.htmlHash, checkerCommit: detail.check?.checkerCommit,
      check: detail.check, validate: detail.record.validate, fidelity: detail.record.fidelity,
      skill: detail.record.skill, model: detail.record.model, notes: detail.record.notes,
      scope: '受控流程：lint/validate 与官方检查器均为本地真实执行；未执行公众号实测',
    }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    console.log(JSON.stringify({
      status: detail.status, recordId: detail.record.id, dir,
      validate: `${detail.record.validate.errorCount} ERROR / ${detail.record.validate.warnCount} WARN`,
      fidelity: detail.record.fidelity.ok ? '原文保真通过' : `保真问题：缺 ${detail.record.fidelity.missing.length} 段`,
      checker: detail.check?.status, preview: join(dir, 'preview.html'),
      added: detail.record.fidelity.added.slice(0, 5),
    }, null, 2));
    process.exitCode = detail.status === 'rule-passed' ? 0 : detail.status === 'needs-fix' ? 1 : 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : '渲染失败。');
    process.exitCode = 2;
  }
}
