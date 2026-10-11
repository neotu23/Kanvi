import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { ReferenceError } from '../references/contracts';
import { readStoredSettings } from '../ai/settings';
import { validateDesign } from './design';
import { themeDir, themesRoot } from './library';
import { MAX_PREVIEW_BYTES, MAX_THEME_FILE_BYTES, themeIdPattern, validateThemeJson, validateThemeSource } from './schema';

export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const MAX_RECORD_BYTES = 8 * 1024 * 1024;
const THEME_FILES = ['theme.json', 'THEME.md', 'preview.html', 'SOURCE.json', 'SOURCE.md', 'DESIGN.json'] as const;
const RECORD_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export const rendersRoot = () => resolve(process.env.KANVI_RENDERS_ROOT ?? 'data/renders');
export const draftsRoot = () => resolve(process.env.KANVI_DRAFTS_ROOT ?? 'data/theme-drafts');

export interface BackupTheme { id: string; files: Record<string, string> }
export interface BackupRender { id: string; record: unknown; report?: unknown }
export interface BackupFile {
  app: 'kanvi-theme-backup'; version: 1; createdAt: string;
  themes: BackupTheme[]; renders: BackupRender[];
  skipped: { themes: string[]; renders: string[] };
  contentHash: string;
}
export interface BackupOptions { themesRoot?: string; rendersRoot?: string }
export interface RestoreResult { themes: { added: string[]; skipped: string[] }; renders: { added: string[]; skipped: string[] } }

const fileLimit = (name: string) => (name === 'preview.html' ? MAX_PREVIEW_BYTES : MAX_THEME_FILE_BYTES);
const exists = async (path: string): Promise<boolean> => { try { await stat(path); return true; } catch { return false; } };
const contentHashOf = (themes: BackupTheme[], renders: BackupRender[]) => createHash('sha256').update(JSON.stringify({ themes, renders })).digest('hex');
async function readJson(path: string): Promise<unknown | null> {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile() || info.size > MAX_RECORD_BYTES) return null;
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}
/** 备份内容不得包含本机密钥（环境变量与本地设置都算）；导出前显式校验，不依赖“密钥本来就不在数据里”这个假设。 */
export function ensureNoSecrets(backup: BackupFile, extraSecrets: readonly string[] = []): void {
  const secrets = [process.env.DEEPSEEK_API_KEY ?? '', ...extraSecrets].map(value => value.trim()).filter(value => value.length >= 8);
  if (secrets.some(secret => JSON.stringify(backup).includes(secret))) throw new ReferenceError('backup-secret', '备份内容包含本机 API Key，已拒绝导出。', 500);
}

export async function exportBackup(options: BackupOptions = {}): Promise<BackupFile> {
  const themesPath = options.themesRoot ?? themesRoot();
  const rendersPath = options.rendersRoot ?? rendersRoot();
  const themes: BackupTheme[] = [];
  const renders: BackupRender[] = [];
  const skipped = { themes: [] as string[], renders: [] as string[] };

  for (const entry of (await readdir(themesPath, { withFileTypes: true }).catch(() => []))) {
    if (!entry.isDirectory() || !themeIdPattern.test(entry.name)) continue;
    const dir = themeDir(entry.name, themesPath);
    const files: Record<string, string> = {};
    let usable = true;
    for (const name of THEME_FILES) {
      const info = await stat(join(dir, name)).catch(() => null);
      if (!info?.isFile()) continue;
      if (info.size > fileLimit(name)) { usable = false; break; }
      files[name] = await readFile(join(dir, name), 'utf8');
    }
    if (!usable || !files['theme.json'] || !files['THEME.md'] || !files['preview.html']) { skipped.themes.push(entry.name); continue; }
    try {
      const themeJson = validateThemeJson(JSON.parse(files['theme.json']));
      if (themeJson.id !== entry.name) throw new Error('id mismatch');
      if (files['SOURCE.json']) validateThemeSource(JSON.parse(files['SOURCE.json']));
      if (files['DESIGN.json']) validateDesign(JSON.parse(files['DESIGN.json']));
    } catch { skipped.themes.push(entry.name); continue; }
    themes.push({ id: entry.name, files });
  }

  for (const entry of (await readdir(rendersPath, { withFileTypes: true }).catch(() => []))) {
    if (!entry.isDirectory() || !RECORD_ID.test(entry.name)) continue;
    const record = await readJson(join(rendersPath, entry.name, 'record.json'));
    if (!record || typeof record !== 'object') { skipped.renders.push(entry.name); continue; }
    const report = await readJson(join(rendersPath, entry.name, 'result', 'report.json'));
    renders.push({ id: entry.name, record, ...(report && typeof report === 'object' ? { report } : {}) });
  }

  const backup: BackupFile = {
    app: 'kanvi-theme-backup', version: BACKUP_VERSION, createdAt: new Date().toISOString(),
    themes, renders, skipped, contentHash: contentHashOf(themes, renders),
  };
  const stored = await readStoredSettings();
  ensureNoSecrets(backup, stored.state === 'ok' ? [stored.settings.apiKey] : []);
  return backup;
}

function object(value: unknown, keys: readonly string[], message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) {
    throw new ReferenceError('invalid-backup', message, 422);
  }
  return value as Record<string, unknown>;
}
export function validateBackup(value: unknown): BackupFile {
  if (Buffer.byteLength(JSON.stringify(value ?? ''), 'utf8') > MAX_BACKUP_BYTES) throw new ReferenceError('invalid-backup', '备份文件超过导入上限。', 413);
  const backup = object(value, ['app', 'version', 'createdAt', 'themes', 'renders', 'skipped', 'contentHash'], '备份文件结构不符合要求。');
  if (backup.app !== 'kanvi-theme-backup' || backup.version !== BACKUP_VERSION) throw new ReferenceError('invalid-backup', '备份文件来自其它工具或版本不受支持。', 422);
  if (typeof backup.createdAt !== 'string' || !Number.isFinite(Date.parse(backup.createdAt))) throw new ReferenceError('invalid-backup', '备份文件时间无效。', 422);
  if (!Array.isArray(backup.themes) || backup.themes.length > 200) throw new ReferenceError('invalid-backup', '备份中的主题数量无效。', 422);
  if (!Array.isArray(backup.renders) || backup.renders.length > 1000) throw new ReferenceError('invalid-backup', '备份中的渲染历史数量无效。', 422);

  const themes: BackupTheme[] = backup.themes.map(raw => {
    const theme = object(raw, ['id', 'files'], '备份中的主题记录无效。');
    if (typeof theme.id !== 'string' || !themeIdPattern.test(theme.id)) throw new ReferenceError('invalid-backup', '备份中的主题 id 无效。', 422);
    const rawFiles = object(theme.files, [...THEME_FILES], '备份中的主题文件字段无效。');
    const files: Record<string, string> = {};
    for (const [name, content] of Object.entries(rawFiles)) {
      if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > fileLimit(name)) throw new ReferenceError('invalid-backup', `备份中主题 ${theme.id} 的 ${name} 无效。`, 422);
      files[name] = content;
    }
    if (!files['theme.json'] || !files['THEME.md'] || !files['preview.html']) throw new ReferenceError('invalid-backup', `备份中主题 ${theme.id} 缺少三件套。`, 422);
    try {
      const parsed = validateThemeJson(JSON.parse(files['theme.json']));
      if (parsed.id !== theme.id) throw new Error('id mismatch');
      if (files['SOURCE.json']) validateThemeSource(JSON.parse(files['SOURCE.json']));
      if (files['DESIGN.json']) validateDesign(JSON.parse(files['DESIGN.json']));
    } catch { throw new ReferenceError('invalid-backup', `备份中主题 ${theme.id} 的契约校验未通过。`, 422); }
    return { id: theme.id, files };
  });
  const renders: BackupRender[] = backup.renders.map(raw => {
    const render = object(raw, ['id', 'record', 'report'], '备份中的渲染记录无效。');
    if (typeof render.id !== 'string' || !RECORD_ID.test(render.id)) throw new ReferenceError('invalid-backup', '备份中的渲染记录 id 无效。', 422);
    if (!render.record || typeof render.record !== 'object' || Array.isArray(render.record)) throw new ReferenceError('invalid-backup', '备份中的渲染记录内容无效。', 422);
    if (render.report !== undefined && (!render.report || typeof render.report !== 'object' || Array.isArray(render.report))) throw new ReferenceError('invalid-backup', '备份中的报告内容无效。', 422);
    return { id: render.id, record: render.record, ...(render.report !== undefined ? { report: render.report } : {}) };
  });
  if (backup.contentHash !== contentHashOf(themes, renders)) throw new ReferenceError('invalid-backup', '备份内容与校验指纹不一致，可能已被修改。', 422);
  return {
    app: 'kanvi-theme-backup', version: BACKUP_VERSION, createdAt: backup.createdAt, themes, renders,
    skipped: { themes: [], renders: [] }, contentHash: backup.contentHash,
  };
}

async function writePackage(dir: string, files: Record<string, string>): Promise<void> {
  const parent = dirname(dir);
  const staging = await mkdtemp(join(parent, '.pending-'));
  try {
    for (const [name, content] of Object.entries(files)) await writeFile(join(staging, name), content, { encoding: 'utf8', mode: 0o600 });
    try { await rename(staging, dir); }
    catch (error) {
      if (['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw new ReferenceError('restore-conflict', `恢复目标已存在：${dir}`, 409);
      throw error;
    }
  } finally { await rm(staging, { recursive: true, force: true }); }
}

/** 恢复只新增，不覆盖已存在的主题或历史；返回实际写入与跳过的条目。 */
export async function restoreBackup(input: unknown, options: BackupOptions = {}): Promise<RestoreResult> {
  const backup = validateBackup(input);
  const themesPath = options.themesRoot ?? themesRoot();
  const rendersPath = options.rendersRoot ?? rendersRoot();
  const result: RestoreResult = { themes: { added: [], skipped: [] }, renders: { added: [], skipped: [] } };
  await mkdir(themesPath, { recursive: true, mode: 0o700 });
  await mkdir(rendersPath, { recursive: true, mode: 0o700 });
  for (const theme of backup.themes) {
    const dir = themeDir(theme.id, themesPath);
    if (await exists(dir)) { result.themes.skipped.push(theme.id); continue; }
    await writePackage(dir, theme.files);
    result.themes.added.push(theme.id);
  }
  for (const render of backup.renders) {
    const dir = join(rendersPath, render.id);
    if (await exists(dir)) { result.renders.skipped.push(render.id); continue; }
    const staging = await mkdtemp(join(rendersPath, '.pending-'));
    try {
      await writeFile(join(staging, 'record.json'), JSON.stringify(render.record), { encoding: 'utf8', mode: 0o600 });
      if (render.report !== undefined) {
        await mkdir(join(staging, 'result'), { recursive: true, mode: 0o700 });
        await writeFile(join(staging, 'result', 'report.json'), JSON.stringify(render.report), { encoding: 'utf8', mode: 0o600 });
      }
      try { await rename(staging, dir); }
      catch (error) {
        if (['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) { result.renders.skipped.push(render.id); continue; }
        throw error;
      }
    } finally { await rm(staging, { recursive: true, force: true }); }
    result.renders.added.push(render.id);
  }
  return result;
}
