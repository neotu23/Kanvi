import { ReferenceError } from '../references/contracts';
import { errorResponse, json, readJsonRequest } from '../shared/io';
import { isLocalRequest } from '../validation/local-request';
import { aiConfigurationStatus, aiConnectionTest } from './client';
import { normalizeApiKey, normalizeModel, saveAiSettings, settingsFile } from './settings';

/** 只允许这两个字段进入本地设置，其它字段一律拒绝而不是忽略。 */
const FIELDS = ['apiKey', 'model'] as const;

export interface SettingsHandlerOptions {
  file?: string;
  test?: typeof aiConnectionTest;
}
export function createSettingsHandlers(options: SettingsHandlerOptions = {}) {
  const file = options.file ?? settingsFile();
  const test = options.test ?? aiConnectionTest;
  const denied = () => json({ error: '仅接受本机页面的请求。', code: 'forbidden' }, 403);
  async function patch(request: Request): Promise<Record<string, unknown>> {
    const value = await readJsonRequest(request);
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !FIELDS.includes(key as typeof FIELDS[number]))) {
      throw new ReferenceError('invalid-input', '请求字段不符合要求。', 400);
    }
    return value as Record<string, unknown>;
  }
  return {
    async read(request: Request) {
      if (!isLocalRequest(request)) return denied();
      try { return json({ ai: await aiConfigurationStatus(file) }); } catch (error) { return errorResponse(error); }
    },
    async save(request: Request) {
      if (!isLocalRequest(request)) return denied();
      try {
        const value = await patch(request);
        const update: { apiKey?: string; model?: string } = {};
        if ('apiKey' in value) update.apiKey = normalizeApiKey(value.apiKey);
        if ('model' in value) update.model = normalizeModel(value.model);
        if (!Object.keys(update).length) throw new ReferenceError('invalid-input', '请提供要保存的 API Key 或模型名。', 400);
        await saveAiSettings(update, file);
        return json({ ai: await aiConfigurationStatus(file) });
      } catch (error) { return errorResponse(error); }
    },
    /** 允许用尚未保存的 Key 先验证一次；请求体里的 Key 不写入本地设置。 */
    async test(request: Request) {
      if (!isLocalRequest(request)) return denied();
      try {
        const value = await patch(request);
        const apiKey = 'apiKey' in value ? normalizeApiKey(value.apiKey) : '';
        return json(await test({
          ...(apiKey ? { apiKey } : {}),
          ...('model' in value ? { model: normalizeModel(value.model) } : {}),
        }));
      } catch (error) { return errorResponse(error); }
    },
  };
}
export const settingsHandlers = createSettingsHandlers();
