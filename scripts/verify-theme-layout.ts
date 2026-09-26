import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { load } from 'cheerio';
import { parseThemeArticle } from '../src/features/themes/article';
import { buildThemePreview } from '../src/features/themes/preview';
import { listThemes, themesRoot } from '../src/features/themes/library';
import { runLintTheme } from '../src/features/themes/python';
import { artifactFromHtml, verifyArticle } from '../src/features/themes/verify-article';
import { articleThemeMarkdown } from '../src/features/themes/layout';
import { sha256 } from '../src/features/themes/repository';

// 全部使用项目自写样例和实际主题槽位，不调用模型、不进行浏览器交互模拟。
const root = resolve('artifacts/theme-layout', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(root, { recursive: true });
const markdown = await readFile('public/samples/slow-afternoon.md', 'utf8');
const parsed = parseThemeArticle(markdown);
const lint = await runLintTheme(themesRoot());
const results = [];
for (const entry of await listThemes()) {
  if (!entry.ok || !entry.theme) throw new Error(entry.error ?? `主题读取失败：${entry.id}`);
  const themeMarkdown = await readFile(join(entry.theme.path, 'THEME.md'), 'utf8');
  const preview = buildThemePreview(themeMarkdown, markdown);
  const $ = load(preview);
  const artifact = artifactFromHtml($('body').html()!);
  const verification = await verifyArticle(parsed, artifact);
  const dir = join(root, entry.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'body.html'), artifact.bodyHtml);
  await writeFile(join(dir, 'preview.html'), preview);
  await writeFile(join(dir, 'THEME.md'), articleThemeMarkdown(themeMarkdown));
  // lint 的 preview.html 是主题契约资产，和上面的正文预览分别保存。
  const lintDir = join(root, 'effective-themes', entry.id);
  await mkdir(lintDir, { recursive: true });
  await writeFile(join(lintDir, 'THEME.md'), articleThemeMarkdown(themeMarkdown));
  for (const file of ['theme.json', 'preview.html']) {
    await writeFile(join(lintDir, file), await readFile(join(entry.theme.path, file)));
  }
  const effectiveLint = await runLintTheme(lintDir);
  const passed = verification.validate.ok && verification.fidelity.ok && verification.check.status === 'passed' && effectiveLint.ok;
  const result = { id: entry.id, passed, htmlHash: artifact.htmlHash, themeHash: sha256(articleThemeMarkdown(themeMarkdown)), rootStyle: $('body > section').attr('style'), effectiveLint, ...verification };
  await writeFile(join(dir, 'report.json'), JSON.stringify(result, null, 2));
  results.push(result);
  console.log(JSON.stringify({ theme: entry.id, passed, skill: [verification.validate.errorCount, verification.validate.warnCount], official: verification.check.status, issues: verification.check.issues, fidelity: verification.fidelity.ok }));
}
await writeFile(join(root, 'report.json'), JSON.stringify({ checkedAt: new Date().toISOString(), scope: '六套主题完整自写样例；真实 skill 严格校验与官方检查器；未执行模型调用、浏览器交互模拟或公众号实测', lint, results }, null, 2));
console.log(`报告：${root}`);
process.exitCode = lint.ok && results.length > 0 && results.every(item => item.passed) ? 0 : 1;
