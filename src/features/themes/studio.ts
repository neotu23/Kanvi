import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ReferenceError } from '../references/contracts';
import { createThemeDraft, draftsRoot, type FactoryOptions } from './factory';
import { describeTheme, readDesign, type DesignParent, type ThemeDesign } from './design';
import { themeDir, themesRoot, loadTheme } from './library';
import { buildThemePreview } from './preview';
import { MAX_THEME_FILE_BYTES, validateThemeJson } from './schema';

export interface StudioOptions extends FactoryOptions { themesRoot?: string }
export interface StudioDetail { id: string; name: string; source: 'saved' | 'draft'; promptSource: 'recorded' | 'derived'; design: ThemeDesign; html: string; baseHtml: string | null }
async function textFile(path: string, limit = MAX_THEME_FILE_BYTES): Promise<string> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > limit) throw new ReferenceError('studio-read', '模板文件过大或无效。', 422);
    return await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new ReferenceError('not-found', '没有找到这份模板或草案。', 404);
    throw e;
  }
}
async function baseTheme(id: string, source: 'saved' | 'draft', options: StudioOptions): Promise<DesignParent> {
  const root = source === 'saved' ? options.themesRoot ?? themesRoot() : options.draftsRoot ?? draftsRoot();
  const dir = themeDir(id, root);
  if (source === 'saved') await loadTheme(id, root);
  const themeJson = validateThemeJson(JSON.parse(await textFile(join(dir, 'theme.json'))));
  if (themeJson.id !== id) throw new ReferenceError('studio-read', '模板目录与内容不一致。', 422);
  return { id, name: themeJson.name, themeJson, themeMarkdown: await textFile(join(dir, 'THEME.md'), 256 * 1024) };
}
export async function readStudioTheme(id: string, source: 'saved' | 'draft', options: StudioOptions = {}): Promise<StudioDetail> {
  const base = await baseTheme(id, source, options);
  const root = source === 'saved' ? options.themesRoot ?? themesRoot() : options.draftsRoot ?? draftsRoot();
  const stored = await readDesign(themeDir(id, root));
  const markdown = await textFile(resolve(options.projectRoot ?? process.cwd(), 'public/samples/slow-afternoon.md'));
  const design = stored ?? { version: 1 as const, prompt: describeTheme(base.themeJson), adjustment: '', changes: [] };
  return { id, name: base.name, source, promptSource: stored ? 'recorded' : 'derived', design,
    html: buildThemePreview(base.themeMarkdown, markdown), baseHtml: design.parent ? buildThemePreview(design.parent.themeMarkdown, markdown) : null };
}

export async function createStudioDraft(input: Record<string, unknown>, options: StudioOptions = {}) {
  if (Object.keys(input).some(k => !['name','prompt','adjustment','baseId','baseSource'].includes(k))) throw new ReferenceError('invalid-input', '设计请求包含不支持的字段。', 400);
  const { name, prompt, baseId, baseSource } = input;
  const adjustment = input.adjustment ?? '';
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 24 || /[<>\u0000-\u001f]/.test(name)
    || typeof prompt !== 'string' || !prompt.trim() || typeof adjustment !== 'string') throw new ReferenceError('invalid-input', '请填写 2–24 字模板名称和设计提示词。', 400);
  if (Buffer.byteLength(prompt) > 8192 || Buffer.byteLength(adjustment) > 8192) throw new ReferenceError('invalid-input', '设计提示词或调整要求超过 8 KiB，未发送请求。', 413);
  if ((baseId === undefined) !== (baseSource === undefined) || (baseSource !== undefined && baseSource !== 'saved' && baseSource !== 'draft') || (baseId !== undefined && typeof baseId !== 'string')) throw new ReferenceError('invalid-input', '请选择有效的基准模板。', 400);
  const parent = typeof baseId === 'string' ? await baseTheme(baseId, baseSource as 'saved' | 'draft', options) : undefined;
  const targetId = `design-${randomUUID()}`.slice(0, 40);
  return createThemeDraft(prompt, { ...options, design: { name: name.trim(), targetId, adjustment, parent } });
}
