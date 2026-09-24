import { lstat, rm } from 'node:fs/promises';
import { ReferenceError } from '../references/contracts';
import { loadTheme, themeDir, themesRoot, type ThemeOrigin } from './library';

export interface RemovedTheme { id: string; origin: ThemeOrigin; path: string }

/**
 * 删除一个主题包。需要显式二次确认；只处理主题库根目录下、id 合法、非符号链接的目录。
 * 删除不影响任何渲染记录，种子主题可由 npm run theme:seed 重新复制。
 */
export async function removeTheme(id: string, confirm: string, root: string = themesRoot()): Promise<RemovedTheme> {
  if (confirm !== id) throw new ReferenceError('invalid-input', '删除主题需要二次确认，确认值与主题 id 不一致。', 400);
  const dir = themeDir(id, root);
  let origin: ThemeOrigin = 'local';
  try { origin = (await loadTheme(id, root)).origin; } catch { origin = 'local'; }
  let info;
  try { info = await lstat(dir); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ReferenceError('not-found', '没有找到这个主题包。', 404);
    throw new ReferenceError('theme-read', '主题目录无法读取。', 500);
  }
  if (info.isSymbolicLink() || !info.isDirectory()) throw new ReferenceError('invalid-theme', '该路径不是可删除的主题目录。', 422);
  try { await rm(dir, { recursive: true, force: false }); }
  catch { throw new ReferenceError('theme-write', '主题包删除失败，请检查本地文件权限。', 500); }
  return { id, origin, path: dir };
}
