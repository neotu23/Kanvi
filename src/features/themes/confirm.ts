import { lstat, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ReferenceError } from '../references/contracts';
import { MAX_THEME_MARKDOWN_BYTES, MAX_PREVIEW_OUTPUT_BYTES, draftsRoot } from './factory';
import { readDesign } from './design';
import { themeDir, themesRoot } from './library';
import { runLintTheme } from './python';
import { MAX_THEME_FILE_BYTES, validateThemeJson, validateThemeSource } from './schema';

export interface DraftSummary {
  themeId: string; name: string; createdAt: string; model: string; promptVersion: string; skillCommit: string; briefHash: string;
  lint: { ok: boolean; errorCount: number; warnCount: number };
}
export interface DraftEntry { themeId: string; ok: boolean; draft?: DraftSummary; error?: string }
export interface ConfirmOptions { draftsRoot?: string; themesRoot?: string; projectRoot?: string; signal?: AbortSignal }
export interface ConfirmedTheme { themeId: string; name: string; path: string; origin: 'generated' }

async function readText(path: string, limit: number, label: string): Promise<string> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > limit) throw new ReferenceError('draft-invalid', `草案的 ${label} 缺失或过大。`, 422);
    const value = await readFile(path, 'utf8');
    if (!value.trim()) throw new ReferenceError('draft-invalid', `草案的 ${label} 为空。`, 422);
    return value;
  } catch (error) {
    if (error instanceof ReferenceError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ReferenceError('not-found', '没有找到这份草案。', 404);
    throw new ReferenceError('draft-read', '草案读取失败。', 500);
  }
}

export async function listDrafts(root: string = draftsRoot()): Promise<DraftEntry[]> {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new ReferenceError('draft-read', '草案目录读取失败。', 500);
  }
  const ids = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => entry.name).sort();
  if (ids.length > 200) throw new ReferenceError('draft-read', '待确认草案超过当前上限。', 500);
  const result: DraftEntry[] = [];
  for (const themeId of ids) {
    try {
      const raw = JSON.parse(await readText(join(themeDir(themeId, root), 'draft.json'), MAX_THEME_FILE_BYTES, 'draft.json')) as Record<string, unknown>;
      const lint = raw.lint as DraftSummary['lint'] | undefined;
      if (raw.version !== 1 || raw.themeId !== themeId || typeof raw.name !== 'string' || typeof raw.createdAt !== 'string' || !Number.isFinite(Date.parse(raw.createdAt))
        || typeof raw.model !== 'string' || typeof raw.promptVersion !== 'string' || typeof raw.skillCommit !== 'string' || typeof raw.briefHash !== 'string'
        || !lint || typeof lint.ok !== 'boolean' || typeof lint.errorCount !== 'number' || typeof lint.warnCount !== 'number') {
        throw new ReferenceError('draft-invalid', '草案记录损坏。', 422);
      }
      result.push({ themeId, ok: true, draft: {
        themeId, name: raw.name, createdAt: raw.createdAt, model: raw.model, promptVersion: raw.promptVersion, skillCommit: raw.skillCommit, briefHash: raw.briefHash,
        lint: { ok: lint.ok, errorCount: lint.errorCount, warnCount: lint.warnCount },
      } });
    } catch (error) {
      result.push({ themeId, ok: false, error: error instanceof ReferenceError ? error.message : '草案记录损坏。' });
    }
  }
  return result;
}

export async function discardDraft(themeId: string, root: string = draftsRoot()): Promise<void> {
  const dir = themeDir(themeId, root);
  let info;
  try { info = await lstat(dir); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ReferenceError('not-found', '没有找到这份草案。', 404);
    throw new ReferenceError('draft-read', '草案目录无法读取。', 500);
  }
  if (info.isSymbolicLink() || !info.isDirectory()) throw new ReferenceError('draft-invalid', '该路径不是可丢弃的草案目录。', 422);
  try { await rm(dir, { recursive: true, force: false }); }
  catch { throw new ReferenceError('draft-write', '草案删除失败，请检查本地文件权限。', 500); }
}

/** 确认入库：重跑 lint，校验 id 不冲突，写入来源记录后原子移动进主题库。 */
export async function confirmDraft(themeId: string, options: ConfirmOptions = {}): Promise<ConfirmedTheme> {
  const drafts = options.draftsRoot ?? draftsRoot();
  const themes = options.themesRoot ?? themesRoot();
  const source = themeDir(themeId, drafts);
  const target = themeDir(themeId, themes);
  await readDesign(source);
  const rawRecord = JSON.parse(await readText(join(source, 'draft.json'), MAX_THEME_FILE_BYTES, 'draft.json')) as Record<string, unknown>;
  if (rawRecord.version !== 1 || rawRecord.themeId !== themeId) throw new ReferenceError('draft-invalid', '草案记录与目录不一致。', 422);
  const themeMarkdown = await readText(join(source, 'THEME.md'), MAX_THEME_MARKDOWN_BYTES, 'THEME.md');
  await readText(join(source, 'preview.html'), MAX_PREVIEW_OUTPUT_BYTES, 'preview.html');
  let themeJson;
  try { themeJson = validateThemeJson(JSON.parse(await readText(join(source, 'theme.json'), MAX_THEME_FILE_BYTES, 'theme.json'))); }
  catch (error) { if (error instanceof ReferenceError) throw new ReferenceError('draft-invalid', '草案的 theme.json 不符合主题契约。', 422); throw error; }
  if (themeJson.id !== themeId) throw new ReferenceError('draft-invalid', '草案目录名与 theme.json 的 id 不一致。', 422);

  const lint = await runLintTheme(source, { projectRoot: options.projectRoot, signal: options.signal });
  if (!lint.ok) {
    const detail = lint.issues.slice(0, 5).map(issue => `${issue.level}: ${issue.message}`).join('；') || lint.error || '未知问题';
    throw new ReferenceError('draft-lint', `草案未通过 theme lint（ERROR×${lint.errorCount} WARN×${lint.warnCount}）：${detail}`, 422);
  }
  try { await stat(target); throw new ReferenceError('theme-exists', `主题库中已存在 ${themeId}，请先删除或更换 id。`, 409); }
  catch (error) {
    if (error instanceof ReferenceError) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new ReferenceError('theme-read', '主题库目标路径无法检查。', 500);
  }

  if (!themeMarkdown.trim()) throw new ReferenceError('draft-invalid', '草案的 THEME.md 为空。', 422);
  if (!themeJson.name) throw new ReferenceError('draft-invalid', '草案缺少主题名称。', 422);
  const createdAt = new Date().toISOString();
  const record = validateThemeSource({
    version: 1, origin: 'generated', createdAt,
    generated: { model: rawRecord.model, promptVersion: rawRecord.promptVersion, skillCommit: rawRecord.skillCommit, briefHash: rawRecord.briefHash },
  });
  await writeFile(join(source, 'SOURCE.json'), JSON.stringify(record, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  await writeFile(join(source, 'SOURCE.md'), `# 来源

本主题包由主题工厂按用户 brief 生成，并已通过 lint_theme.py（0 ERROR / 0 WARN）后入库。

- 生成时间：${createdAt}
- 模型：${String(rawRecord.model)}
- 提示词版本：${String(rawRecord.promptVersion)}
- skill commit：${String(rawRecord.skillCommit)}
- brief 指纹：${String(rawRecord.briefHash)}

入库前由用户逐个确认气质；确认时会重新运行 lint。来源为 MIT 的 gzh-beautify-skill 规范，完整许可见仓库根 THIRD_PARTY_NOTICES.md。
`, { encoding: 'utf8', mode: 0o600 });
  // 草案记录只在待确认阶段使用，入库后信息已进入 SOURCE.json。
  try { await rm(join(source, 'draft.json'), { force: true }); } catch { /* 草案记录缺失不影响入库。 */ }
  try { await rename(source, target); }
  catch (error) {
    if (['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw new ReferenceError('theme-exists', `主题库中已存在 ${themeId}，请先删除或更换 id。`, 409);
    throw new ReferenceError('theme-write', '主题入库失败，草案仍保留。', 500);
  }
  return { themeId, name: themeJson.name, path: target, origin: 'generated' };
}
