import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ReferenceError } from '../references/contracts';

export const DEFAULT_MODEL = 'deepseek-flash';
export const MAX_API_KEY_CHARS = 200;
export const MAX_MODEL_CHARS = 80;
const MAX_SETTINGS_BYTES = 16 * 1024;
const modelPattern = /^[a-zA-Z0-9._-]{1,80}$/;

/** 本地设置文件：只在服务端读取，不进入 Git、备份与浏览器响应。 */
export const settingsFile = () => resolve(process.env.KANVI_SETTINGS_FILE ?? 'data/settings.json');

export interface StoredAiSettings { apiKey: string; model: string }
export interface StoredSettings { version: 1; updatedAt: string; ai: StoredAiSettings }
export type SettingsRead =
  | { state: 'missing' }
  | { state: 'ok'; settings: StoredAiSettings; updatedAt: string }
  | { state: 'damaged'; error: string };

const code = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code;

/** 空字符串表示清除本地密钥；含空白或超长的值一律拒绝，不静默截断。 */
export function normalizeApiKey(value: unknown): string {
  if (typeof value !== 'string') throw new ReferenceError('invalid-input', 'API Key 必须是文本。', 400);
  const key = value.trim();
  if (!key) return '';
  if (key.length > MAX_API_KEY_CHARS) throw new ReferenceError('invalid-input', `API Key 超过 ${MAX_API_KEY_CHARS} 个字符，未保存。`, 400);
  if (/\s/.test(key)) throw new ReferenceError('invalid-input', 'API Key 不能包含空白字符，未保存。', 400);
  return key;
}
export function normalizeModel(value: unknown): string {
  if (typeof value !== 'string') throw new ReferenceError('invalid-input', '模型名必须是文本。', 400);
  const model = value.trim();
  if (!model) return DEFAULT_MODEL;
  if (model.length > MAX_MODEL_CHARS || !modelPattern.test(model)) {
    throw new ReferenceError('invalid-input', '模型名只能是 1-80 位的字母、数字、点、下划线和连字符，未保存。', 400);
  }
  return model;
}
/** 只用于界面回显：绝不把完整密钥发回浏览器。 */
export function apiKeyHint(apiKey: string): string | null {
  const key = apiKey.trim();
  if (!key) return null;
  return key.length > 8 ? `…${key.slice(-4)}` : '已保存';
}

function parseSettings(raw: unknown): StoredSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid settings');
  const value = raw as { version?: unknown; updatedAt?: unknown; ai?: unknown };
  if (value.version !== 1 || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('invalid settings');
  if (!value.ai || typeof value.ai !== 'object' || Array.isArray(value.ai)) throw new Error('invalid settings');
  const { apiKey, model } = value.ai as { apiKey?: unknown; model?: unknown };
  if (typeof apiKey !== 'string' || apiKey.length > MAX_API_KEY_CHARS || /\s/.test(apiKey)) throw new Error('invalid settings');
  if (typeof model !== 'string' || !modelPattern.test(model)) throw new Error('invalid settings');
  return { version: 1, updatedAt: value.updatedAt, ai: { apiKey, model } };
}

/**
 * 读取本地设置。损坏的文件不会被当成“未配置”：调用方需要能把它显示给用户，
 * 但也不因为一个坏文件就阻断主题库、历史等其它功能。
 */
export async function readStoredSettings(file: string = settingsFile()): Promise<SettingsRead> {
  let info;
  try { info = await stat(file); }
  catch (error) { return code(error) === 'ENOENT' ? { state: 'missing' } : { state: 'damaged', error: '本地设置读取失败，未使用其中的配置。' }; }
  if (!info.isFile() || info.size > MAX_SETTINGS_BYTES) return { state: 'damaged', error: '本地设置文件缺失或过大，未使用其中的配置。' };
  try {
    const parsed = parseSettings(JSON.parse(await readFile(file, 'utf8')));
    return { state: 'ok', settings: parsed.ai, updatedAt: parsed.updatedAt };
  } catch { return { state: 'damaged', error: '本地设置文件已损坏，未使用其中的配置。' }; }
}

export interface AiSettingsPatch { apiKey?: string; model?: string }

/** 原子写入：先写同目录临时文件再改名，损坏的旧文件不会被静默覆盖。 */
export async function saveAiSettings(patch: AiSettingsPatch, file: string = settingsFile()): Promise<StoredSettings> {
  const current = await readStoredSettings(file);
  if (current.state === 'damaged') {
    throw new ReferenceError('settings-write', '本地设置文件已损坏，请先移走或修复 data/settings.json 再保存。', 500);
  }
  const previous = current.state === 'ok' ? current.settings : { apiKey: '', model: DEFAULT_MODEL };
  const value: StoredSettings = {
    version: 1, updatedAt: new Date().toISOString(),
    ai: {
      apiKey: normalizeApiKey(patch.apiKey ?? previous.apiKey),
      model: normalizeModel(patch.model ?? previous.model),
    },
  };
  const temp = `${file}.pending-${process.pid}-${Date.now()}`;
  try {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temp, file);
  } catch {
    await rm(temp, { force: true });
    throw new ReferenceError('settings-write', '本地设置保存失败，请检查本地数据目录权限和磁盘空间。', 500);
  }
  return value;
}
