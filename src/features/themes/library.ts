import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ReferenceError } from '../references/contracts';
import {
  MAX_PREVIEW_BYTES, MAX_THEME_FILE_BYTES, fail, themeIdPattern, validateThemeJson, validateThemeSource,
  type ThemeJson, type ThemeSource,
} from './schema';

export type ThemeOrigin = ThemeSource['origin'] | 'local';
export interface ThemeLocalSource { version: 1; origin: 'local'; createdAt: string }
export interface ThemePackage {
  id: string; path: string; theme: ThemeJson; source: ThemeSource | ThemeLocalSource;
  origin: ThemeOrigin; hasNote: boolean;
}
export interface ThemeEntry { id: string; ok: boolean; theme?: ThemePackage; error?: string }

export const themesRoot = () => resolve(process.env.KANVI_THEMES_ROOT ?? 'themes');

/** id 必须通过格式校验，且解析结果只能落在主题库根目录内。 */
export function themeDir(id: string, root: string = themesRoot()): string {
  if (typeof id !== 'string' || !themeIdPattern.test(id)) throw new ReferenceError('invalid-id', '主题 id 无效。', 400);
  const base = resolve(root);
  const dir = resolve(base, id);
  if (dir !== join(base, id)) throw new ReferenceError('invalid-id', '主题路径无效。', 400);
  return dir;
}
async function readJson(path: string, limit: number, label: string): Promise<unknown> {
  let info;
  try { info = await stat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fail(`主题包缺少 ${label}。`); throw error; }
  if (!info.isFile() || info.size > limit) return fail(`主题包的 ${label} 缺失或过大。`);
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return fail(`主题包的 ${label} 无法解析。`); }
}
async function readLibrary(path: string): Promise<void> {
  let info;
  try { info = await stat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fail('主题包缺少 THEME.md。'); throw error; }
  if (!info.isFile() || info.size > MAX_THEME_FILE_BYTES) return fail('主题包的 THEME.md 缺失或过大。');
  if (!(await readFile(path, 'utf8')).trim()) return fail('主题包的 THEME.md 为空。');
}
async function readPreview(path: string): Promise<void> {
  let info;
  try { info = await stat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fail('主题包缺少 preview.html。'); throw error; }
  if (!info.isFile() || info.size > MAX_PREVIEW_BYTES) return fail('主题包的 preview.html 缺失或过大。');
}
async function loadSource(dir: string): Promise<ThemeSource | ThemeLocalSource> {
  try { await stat(join(dir, 'SOURCE.json')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, origin: 'local', createdAt: new Date().toISOString() };
    throw error;
  }
  return validateThemeSource(await readJson(join(dir, 'SOURCE.json'), MAX_THEME_FILE_BYTES, 'SOURCE.json'));
}

export async function loadTheme(id: string, root: string = themesRoot()): Promise<ThemePackage> {
  const dir = themeDir(id, root);
  try {
    await stat(dir);
    const theme = validateThemeJson(await readJson(join(dir, 'theme.json'), MAX_THEME_FILE_BYTES, 'theme.json'));
    if (theme.id !== id) return fail('主题目录名必须与 theme.json 的 id 一致。');
    await readLibrary(join(dir, 'THEME.md'));
    await readPreview(join(dir, 'preview.html'));
    const source = await loadSource(dir);
    let hasNote = false;
    try { hasNote = (await stat(join(dir, 'SOURCE.md'))).isFile(); } catch { hasNote = false; }
    return { id, path: dir, theme, source, origin: source.origin, hasNote };
  } catch (error) {
    if (error instanceof ReferenceError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && (error as NodeJS.ErrnoException).path === dir) {
      throw new ReferenceError('not-found', '没有找到这个主题包。', 404);
    }
    throw new ReferenceError('theme-read', '主题包读取失败或记录损坏，未使用不完整数据。', 500);
  }
}

export async function listThemes(root: string = themesRoot()): Promise<ThemeEntry[]> {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new ReferenceError('theme-read', '主题库读取失败。', 500);
  }
  const names = entries
    .filter(entry => (entry.isDirectory() || entry.isSymbolicLink()) && !entry.name.startsWith('.'))
    .map(entry => entry.name)
    .sort();
  if (names.length > 200) throw new ReferenceError('theme-read', '主题库超过当前存储上限。', 500);
  const result: ThemeEntry[] = [];
  for (const id of names) {
    if (!themeIdPattern.test(id)) { result.push({ id, ok: false, error: '目录名不是合法的主题 id。' }); continue; }
    try { result.push({ id, ok: true, theme: await loadTheme(id, root) }); }
    catch (error) {
      // 损坏的主题包逐个报错，不隐藏问题，也不影响其它主题。
      result.push({ id, ok: false, error: error instanceof ReferenceError ? error.message : '主题包读取失败。' });
    }
  }
  return result;
}
