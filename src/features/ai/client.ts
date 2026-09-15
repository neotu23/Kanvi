import { ReferenceError } from '../references/contracts';
import { readBounded } from '../shared/io';
import { ANALYSIS_SYSTEM_PROMPT } from './schema';

export interface AiConfig { apiKey: string; model: string }
export interface AiOptions { config?: AiConfig; transport?: typeof fetch; timeoutMs?: number; signal?: AbortSignal; systemPrompt?: string }
export function aiConfig(): AiConfig {
  return { apiKey: process.env.DEEPSEEK_API_KEY?.trim() ?? '', model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash' };
}
export function aiConfigurationStatus() {
  const config = aiConfig();
  return { configured: Boolean(config.apiKey), model: config.model };
}
export async function completeJson(input: string, options: AiOptions = {}): Promise<unknown> {
  const config = options.config ?? aiConfig();
  if (!config.apiKey) throw new ReferenceError('ai-not-configured', '尚未配置服务端 DEEPSEEK_API_KEY；参考已保存在本地，配置后可分析。', 503);
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(config.model)) throw new ReferenceError('ai-config', '服务端模型名配置无效。', 503);
  if (Buffer.byteLength(input) > 100 * 1024) throw new ReferenceError('ai-input-limit', '参考证据超过 100 KiB，暂不支持完整分析；未截断证据或发送请求。', 413);
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 60_000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new ReferenceError('ai-timeout', '分析请求已取消或超时，请重试。', 408));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    signal.throwIfAborted();
    const response = await Promise.race([(options.transport ?? fetch)('https://api.deepseek.com/chat/completions', {
      method: 'POST', signal, redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, stream: false, thinking: { type: 'disabled' }, max_tokens: 6000, temperature: 0.2,
        response_format: { type: 'json_object' }, messages: [{ role: 'system', content: options.systemPrompt ?? ANALYSIS_SYSTEM_PROMPT }, { role: 'user', content: input }] }),
    }), cancelled]);
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      const messages: Record<number, string> = { 401: 'API Key 无效，请检查服务端配置。', 402: 'DeepSeek 账户余额不足。', 429: 'DeepSeek 请求频率受限，请稍后重试。', 500: 'DeepSeek 服务发生错误，请稍后重试。', 503: 'DeepSeek 服务繁忙，请稍后重试。' };
      throw new ReferenceError('ai-http', messages[response.status] ?? `DeepSeek 返回 HTTP ${response.status}，请检查模型配置后重试。`, 502);
    }
    const body = await readBounded(response.body, 512 * 1024, signal);
    let parsed;
    try { parsed = JSON.parse(body); } catch { throw new ReferenceError('ai-json', '模型服务未返回有效 JSON。', 502); }
    const choice = parsed?.choices?.[0];
    if (choice?.finish_reason !== 'stop' || typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) throw new ReferenceError('ai-incomplete', '模型返回空内容或未完整结束，未保存分析。请重试。', 502);
    try { return JSON.parse(choice.message.content); }
    catch { throw new ReferenceError('ai-json', '模型返回的设计不是有效 JSON，未保存分析。', 502); }
  } catch (error) {
    if (signal.aborted) throw new ReferenceError('ai-timeout', '分析请求已取消或超时，请重试。', 408);
    if (error instanceof ReferenceError) throw error;
    // Never expose provider bodies, request headers, or transport exceptions containing credentials.
    throw new ReferenceError('ai-network', '无法连接 DeepSeek，请检查网络后重试。', 502);
  } finally { signal.removeEventListener('abort', abort); }
}
