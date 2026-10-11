import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { aiConfig, aiConfigurationStatus, aiConnectionTest } from '../src/features/ai/client';
import { createSettingsHandlers } from '../src/features/ai/settings-handlers';
import { apiKeyHint, saveAiSettings } from '../src/features/ai/settings';

const base = 'http://127.0.0.1:8787/api/settings';
const call = (path: string, method: string, body?: unknown, origin = 'http://127.0.0.1:8787') => new Request(`${base}${path}`, {
  method,
  headers: { host: '127.0.0.1:8787', origin, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
const env = () => {
  const dir = mkdtempSync(join(tmpdir(), 'kanvi-ai-settings-'));
  return { dir, file: join(dir, 'settings.json') };
};
/** 本机可能已配置环境变量；除明确验证回退的用例外，测试都在无 env 的前提下运行。 */
async function withoutEnvKey(run: () => Promise<void>): Promise<void> {
  const previous = process.env.DEEPSEEK_API_KEY;
  const previousModel = process.env.DEEPSEEK_MODEL;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_MODEL;
  try { await run(); }
  finally {
    if (previous === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previous;
    if (previousModel === undefined) delete process.env.DEEPSEEK_MODEL; else process.env.DEEPSEEK_MODEL = previousModel;
  }
}
function transportFor(status: number, payload: unknown, log: Array<{ url: string; method: string; authorization: string }>) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    log.push({ url: String(input), method: init?.method ?? 'GET', authorization: new Headers(init?.headers).get('authorization') ?? '' });
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

it('本地设置优先于环境变量，清除后回退到环境变量', async () => {
  const current = env();
  const previous = process.env.DEEPSEEK_API_KEY;
  const previousModel = process.env.DEEPSEEK_MODEL;
  try {
    process.env.DEEPSEEK_API_KEY = 'env-key-1234567890';
    process.env.DEEPSEEK_MODEL = 'env-model';
    expect(await aiConfig(current.file)).toEqual({ apiKey: 'env-key-1234567890', model: 'env-model' });
    await saveAiSettings({ apiKey: 'local-key-abcdefgh', model: 'deepseek-chat' }, current.file);
    expect(await aiConfig(current.file)).toEqual({ apiKey: 'local-key-abcdefgh', model: 'deepseek-chat' });
    const local = await aiConfigurationStatus(current.file);
    expect(local).toMatchObject({ configured: true, model: 'deepseek-chat', source: 'local', keyHint: '…efgh', fileError: null });
    expect(JSON.stringify(local)).not.toContain('local-key-abcdefgh');
    await saveAiSettings({ apiKey: '' }, current.file);
    const fallback = await aiConfigurationStatus(current.file);
    expect(fallback).toMatchObject({ configured: true, model: 'deepseek-chat', source: 'env', keyHint: '…7890' });
  } finally {
    if (previous === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previous;
    if (previousModel === undefined) delete process.env.DEEPSEEK_MODEL; else process.env.DEEPSEEK_MODEL = previousModel;
    rmSync(current.dir, { recursive: true, force: true });
  }
});

it('设置文件按 0600 写入，损坏的文件不会被静默覆盖', () => withoutEnvKey(async () => {
  const current = env();
  try {
    await saveAiSettings({ apiKey: 'local-key-abcdefgh', model: 'deepseek-chat' }, current.file);
    if (process.platform !== 'win32') expect(statSync(current.file).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(current.file, 'utf8'))).toMatchObject({ version: 1, ai: { apiKey: 'local-key-abcdefgh', model: 'deepseek-chat' } });
    writeFileSync(current.file, '{ not json');
    const damaged = await aiConfigurationStatus(current.file);
    expect(damaged.configured).toBe(false);
    expect(damaged.fileError).toContain('损坏');
    // 损坏时不回退到“未配置”的假象，也不静默丢内容：写入被拒绝，文件原样保留。
    await expect(saveAiSettings({ apiKey: 'another-key-12345678' }, current.file)).rejects.toThrow(/损坏/);
    expect(readFileSync(current.file, 'utf8')).toBe('{ not json');
  } finally { rmSync(current.dir, { recursive: true, force: true }); }
}));

it('非法 Key 与模型名在写入前被拒绝，不留半个文件', () => withoutEnvKey(async () => {
  const current = env();
  try {
    await expect(saveAiSettings({ apiKey: 'has space-1234' }, current.file)).rejects.toThrow(/空白/);
    await expect(saveAiSettings({ apiKey: 'x'.repeat(201) }, current.file)).rejects.toThrow(/200 个字符/);
    await expect(saveAiSettings({ model: 'bad model name' }, current.file)).rejects.toThrow(/模型名/);
    expect(existsSync(current.file)).toBe(false);
    expect(apiKeyHint('short')).toBe('已保存');
    expect(apiKeyHint('sk-abcdefgh1234')).toBe('…1234');
    expect(apiKeyHint('')).toBeNull();
  } finally { rmSync(current.dir, { recursive: true, force: true }); }
}));

it('设置接口拒绝非本机请求与越权字段，且响应不含完整密钥', () => withoutEnvKey(async () => {
  const current = env();
  const handlers = createSettingsHandlers({ file: current.file });
  try {
    expect((await handlers.read(call('', 'GET', undefined, 'https://external.example'))).status).toBe(403);
    expect((await handlers.save(call('', 'PUT', { apiKey: 'sk-local-abcdefgh1234' }, 'https://external.example'))).status).toBe(403);
    expect((await handlers.save(call('', 'PUT', { apiKey: 'sk-local-abcdefgh1234', extra: 1 }))).status).toBe(400);
    expect((await handlers.save(call('', 'PUT', { apiKey: 'sk-local-abcdefgh1234', model: 'bad model' }))).status).toBe(400);
    expect((await handlers.save(call('', 'PUT', {}))).status).toBe(400);
    expect((await handlers.save(call('', 'PUT', { apiKey: 'sk-local-abcdefgh1234', model: 'deepseek-chat' }))).status).toBe(200);
    const saved = await (await handlers.read(call('', 'GET'))).json();
    expect(saved.ai).toMatchObject({ configured: true, source: 'local', model: 'deepseek-chat', keyHint: '…1234' });
    expect(JSON.stringify(saved)).not.toContain('sk-local-abcdefgh1234');
    const kept = await (await handlers.save(call('', 'PUT', { model: 'deepseek-reasoner' }))).json();
    expect(kept.ai).toMatchObject({ model: 'deepseek-reasoner', keyHint: '…1234', source: 'local' });
    const cleared = await (await handlers.save(call('', 'PUT', { apiKey: '' }))).json();
    expect(cleared.ai).toMatchObject({ configured: false, source: 'none', keyHint: null });
  } finally { rmSync(current.dir, { recursive: true, force: true }); }
}));

it('连接测试只请求 /models，区分无效 Key、模型不在列表与不可信 id', () => withoutEnvKey(async () => {
  const log: Array<{ url: string; method: string; authorization: string }> = [];
  const ok = await aiConnectionTest({
    config: { apiKey: 'sk-test-abcdefgh1234', model: 'deepseek-chat' },
    transport: transportFor(200, { object: 'list', data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }, { id: '<script>alert(1)</script>' }, { id: 'deepseek-chat' }] }, log),
  });
  expect(ok).toEqual({ ok: true, model: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'], modelAvailable: true });
  expect(log).toEqual([{ url: 'https://api.deepseek.com/models', method: 'GET', authorization: 'Bearer sk-test-abcdefgh1234' }]);

  const missing = await aiConnectionTest({ config: { apiKey: 'sk-test-abcdefgh1234', model: 'deepseek-flash' }, transport: transportFor(200, { data: [{ id: 'deepseek-chat' }] }, log) });
  expect(missing.modelAvailable).toBe(false);

  // 未配置时先给出配置提示，不发出请求。
  await expect(aiConnectionTest({ config: { apiKey: '', model: 'deepseek-flash' }, transport: transportFor(200, {}, log) })).rejects.toThrow(/尚未配置/);
  // 401 只回显固定文案，不透传上游响应体。
  const rejected = await aiConnectionTest({ config: { apiKey: 'sk-test-abcdefgh1234', model: 'deepseek-chat' }, transport: transportFor(401, { error: '上游内部细节' }, log) })
    .then(() => null, (error: Error) => error.message);
  expect(rejected).toMatch(/API Key 无效/);
  expect(rejected).not.toContain('上游内部细节');
  await expect(aiConnectionTest({ config: { apiKey: 'sk-test-abcdefgh1234', model: 'bad model' }, transport: transportFor(200, {}, log) })).rejects.toThrow(/模型名/);
}));

it('连接测试接口允许用未保存的 Key 先验证，且不写入设置文件', () => withoutEnvKey(async () => {
  const current = env();
  const seen: Array<Record<string, unknown>> = [];
  const handlers = createSettingsHandlers({
    file: current.file,
    test: async options => { seen.push(options as Record<string, unknown>); return { ok: true, model: 'deepseek-chat', models: ['deepseek-chat'], modelAvailable: true }; },
  });
  try {
    expect((await handlers.test(call('/test', 'POST', { apiKey: 'sk-unsaved-12345678' }))).status).toBe(200);
    expect(seen[0]).toEqual({ apiKey: 'sk-unsaved-12345678' });
    expect(existsSync(current.file)).toBe(false);
    expect((await handlers.test(call('/test', 'POST', { apiKey: 'sk-unsaved-12345678', model: 'deepseek-chat', extra: true }))).status).toBe(400);
    expect((await handlers.test(call('/test', 'POST', { apiKey: 'sk-unsaved-12345678', model: 'bad model' }))).status).toBe(400);
    expect((await handlers.test(call('/test', 'POST', { apiKey: 'sk-unsaved-12345678' }, 'https://external.example'))).status).toBe(403);
    await saveAiSettings({ apiKey: 'sk-saved-abcdefgh1234', model: 'deepseek-chat' }, current.file);
    await handlers.test(call('/test', 'POST', { model: 'deepseek-reasoner' }));
    expect(seen.at(-1)).toEqual({ model: 'deepseek-reasoner' });
  } finally { rmSync(current.dir, { recursive: true, force: true }); }
}));
