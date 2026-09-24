import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { confirmDraft, discardDraft, listDrafts } from '../src/features/themes/confirm';
import { createThemeDraft } from '../src/features/themes/factory';
import { listThemes, loadTheme, themesRoot } from '../src/features/themes/library';
import { runLintTheme, pythonVersion } from '../src/features/themes/python';
import { renderArticle } from '../src/features/themes/render-article';
import { ThemeRenderRepository } from '../src/features/themes/repository';

const root = resolve(process.env.KANVI_VERIFY_DATA_ROOT ?? join('artifacts/theme-validation', new Date().toISOString().replace(/[:.]/g, '-')));
const seed = themesRoot();
const ai = (html: string) => ({
  config: { apiKey: 'controlled-verification-only', model: 'fixture' },
  transport: (async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ html, notes: ['受控验证响应'] }) } }] })) as never,
});
const article = [
  '---', 'title: 雨后的傍晚', 'tags: [日记]', '---', '',
  '# 雨后的傍晚', '', '雨停了，沿着河边走一会儿，路上看见几只停在水面的鸟。', '',
  '## 走过的那段路', '', '路灯亮起来之前，天色一点点暗下去。', '',
  '> 给自己留一点安静的时间。', '',
  '- 走到河边。', '- 带一本书，在长椅上坐一会儿。', '',
  '```js', 'const quiet = true;', '```', '',
  '---', '', '回家之前买了一些水果。',
].join('\n');
const controlledHtml = [
  '<section style="max-width:677px;margin:0 auto;background-color:#F7F6F2;padding:24px 20px;font-family:\'Songti SC\',serif;font-size:16px;line-height:1.9;color:#2C2A26;">',
  '<p style="margin:0 0 28px;text-align:center;"><span leaf="" style="font-size:22px;font-weight:600;line-height:1.5;">雨后的傍晚</span></p>',
  '<p style="margin:0 0 20px;font-size:16px;line-height:1.9;"><span leaf="">雨停了，沿着河边走一会儿，路上看见几只停在水面的鸟。</span></p>',
  '<p style="margin:28px 0 14px;font-size:16px;font-weight:800;line-height:1.5;border-left:4px solid #3E5348;padding-left:12px;"><span leaf="">01 走过的那段路</span></p>',
  '<p style="margin:0 0 20px;font-size:16px;line-height:1.9;"><span leaf="">路灯亮起来之前，天色一点点暗下去。</span></p>',
  '<p style="margin:0 0 20px;font-size:16px;line-height:1.9;border-left:3px solid #C5D0C8;padding-left:12px;"><span leaf="">给自己留一点安静的时间。</span></p>',
  '<p style="margin:0 0 8px;font-size:16px;line-height:1.9;"><span leaf="">· 走到河边。</span></p>',
  '<p style="margin:0 0 20px;font-size:16px;line-height:1.9;"><span leaf="">· 带一本书，在长椅上坐一会儿。</span></p>',
  '<p style="margin:0 0 20px;font-size:16px;line-height:1.8;color:#2F4038;background-color:#E8EDE9;padding:10px 12px;"><span leaf="">const quiet = true;</span></p>',
  '<section style="height:1px;background-color:#E4E1D8;margin:28px 0;"><span leaf=""><br></span></section>',
  '<p style="margin:0 0 20px;font-size:16px;line-height:1.9;"><span leaf="">回家之前买了一些水果。</span></p>',
  '</section>'].join('');
const factoryResponse = (themeId: string, name: string, themeMarkdown: string, previewHtml: string) => {
  let call = 0;
  const theme = { ...(JSON.parse(readFileSync(join(seed, 'moss-zen', 'theme.json'), 'utf8')) as Record<string, unknown>), id: themeId, name };
  return (async () => {
    call += 1;
    const payload = call === 1
      ? { id: themeId, name, themeJson: theme, themeMarkdown, notes: ['受控验证响应'] }
      : { previewHtml, notes: ['受控验证响应'] };
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }] });
  }) as never;
};

await mkdir(root, { recursive: true });
const report: Record<string, unknown> = { checkedAt: new Date().toISOString(), root, python: await pythonVersion(), scope: '真实上游脚本与真实官方检查器；模型响应为受控 fixture；未执行公众号实测' };

const entries = await listThemes(seed);
assert.equal(entries.filter(entry => entry.ok).length, 6);
report.library = entries.map(entry => ({ id: entry.id, ok: entry.ok, origin: entry.ok ? entry.theme?.origin : undefined }));
const lint = await runLintTheme(seed);
assert.equal(lint.ok, true);
report.libraryLint = { ok: lint.ok, errors: lint.errorCount, warnings: lint.warnCount };

const renders = new ThemeRenderRepository(join(root, 'renders'));
const rendered = await renderArticle(article, 'moss-zen', { themesRootPath: seed, repository: renders, projectRoot: process.cwd(), ai: ai(controlledHtml) });
assert.equal(rendered.status, 'rule-passed');
assert.equal(rendered.check?.status, 'passed');
assert.equal(rendered.record.validate.ok, true);
assert.equal(rendered.record.fidelity.ok, true);
report.render = {
  recordId: rendered.record.id, status: rendered.status, htmlHash: rendered.record.artifact.htmlHash,
  validate: `${rendered.record.validate.errorCount} ERROR / ${rendered.record.validate.warnCount} WARN`,
  checker: rendered.check?.status, checkerCommit: rendered.check?.checkerCommit, fidelity: rendered.record.fidelity,
};

const tampered = await renderArticle(article, 'moss-zen', { themesRootPath: seed, repository: renders, projectRoot: process.cwd(), ai: ai(controlledHtml.replace('路上看见几只停在水面的鸟。', '路上走了很久。')) });
assert.equal(tampered.status, 'needs-fix');
assert.equal(tampered.record.fidelity.ok, false);
report.tampered = { status: tampered.status, missing: tampered.record.fidelity.missing };

const draftsRoot = join(root, 'drafts');
const themesCopy = join(root, 'themes');
await mkdir(themesCopy, { recursive: true });
const themeMarkdown = readFileSync(join(seed, 'moss-zen', 'THEME.md'), 'utf8');
const previewSource = readFileSync(join(seed, 'moss-zen', 'preview.html'), 'utf8');
const factoryAi = (themeId: string, name: string) => ({ config: { apiKey: 'controlled-verification-only', model: 'fixture' }, transport: factoryResponse(themeId, name, themeMarkdown, previewSource) });
const draft = await createThemeDraft('禅意留白，适合随笔；大段距与细线。', { draftsRoot, projectRoot: process.cwd(), ai: factoryAi('verify-theme-one', '验证主题') });
assert.equal(draft.lint.ok, true);
assert.equal((await listDrafts(draftsRoot)).length, 1);
const confirmed = await confirmDraft(draft.themeId, { draftsRoot, themesRoot: themesCopy, projectRoot: process.cwd() });
const stored = await loadTheme(confirmed.themeId, themesCopy);
assert.equal(stored.origin, 'generated');
report.factory = { themeId: draft.themeId, lint: draft.lint.ok, origin: stored.origin, sourceRecord: stored.source.origin, noteCount: stored.theme.signature_slots.length };

const discardTarget = await createThemeDraft('极简、几乎无装饰。', { draftsRoot, projectRoot: process.cwd(), ai: factoryAi('verify-theme-two', '验证主题二') });
await discardDraft(discardTarget.themeId, draftsRoot);
report.discard = { themeId: discardTarget.themeId, remaining: (await listDrafts(draftsRoot)).length };

await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
const reopened = await new ThemeRenderRepository(join(root, 'renders')).get(rendered.record.id, rendered.check!.checkerCommit);
assert.equal(reopened.status, 'rule-passed');
await writeFile(join(root, 'body.html'), rendered.record.artifact.bodyHtml, { encoding: 'utf8', mode: 0o600 });
console.log(JSON.stringify({ root, library: report.libraryLint, render: report.render, tampered: (report.tampered as { status: string }).status, factory: (report.factory as { themeId: string }).themeId, reopen: reopened.status }, null, 2));
