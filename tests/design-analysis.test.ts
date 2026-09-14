import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { extractArticle } from '../src/features/references/extract-article';
import { analyzeDesign, analysisInput } from '../src/features/ai/design-analysis';
import { validateAnalysis } from '../src/features/ai/schema';
import { completeJson } from '../src/features/ai/client';

const valid = JSON.parse(readFileSync('tests/fixtures/design-analysis.json', 'utf8'));
const snapshot = extractArticle('<script>TOP_SECRET_SCRIPT</script><div id="js_content"><p style="font-size:16px;color:#445544;line-height:1.8">自写正文</p></div>', null);
const env = { apiKey: 'test-key-never-live', model: 'deepseek-flash' };
const completion = (content = JSON.stringify(valid), finish = 'stop') => Response.json({ choices: [{ finish_reason: finish, message: { content } }] });
it('校验完整设计结构和来源 ID，分析请求只发送当前参考证据', async () => {
  expect(validateAnalysis(valid, snapshot.styleEvidence)).toEqual(valid);
  const input = analysisInput(snapshot);
  expect(JSON.stringify(input)).not.toMatch(/TOP_SECRET_SCRIPT|sourceHtml|articleHtml/);
  const result = await analyzeDesign(snapshot, { config: env, transport: async (url, init) => {
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    const body = JSON.parse(init!.body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content).toContain('JSON');
    expect(body.messages[1].content).toContain('自写正文');
    expect(body.messages[0].content).not.toContain('自写正文');
    return completion();
  } });
  expect(result.design.tags).toEqual(valid.tags);
  expect(result.status).toBe('draft');
  expect(result.referenceHash).toBe(snapshot.contentHash);
  expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(result)).not.toContain(env.apiKey);
});
it('拒绝未知证据、非法尺寸、任意属性与脚本内容', () => {
  for (const change of [
    (x: typeof valid) => { x.textStyles[0].evidenceIds = ['e999']; },
    (x: typeof valid) => { x.textStyles[0].properties.fontSize = 999; },
    (x: typeof valid) => { x.textStyles[0].properties.color = 'url(https://evil.test)'; },
    (x: typeof valid) => { x.textStyles[0].properties.onclick = 'alert(1)'; },
    (x: typeof valid) => { x.code = 'function run() {}'; },
    (x: typeof valid) => { x.regions[0].name = '<script>alert(1)</script>'; },
    (x: typeof valid) => { x.textStyles[0].evidenceIds = []; },
  ]) { const data = structuredClone(valid); change(data); expect(() => validateAnalysis(data, snapshot.styleEvidence)).toThrow(); }
});
it('缺少 Key 不调用网络；模型错误脱敏，空内容与截断不是成功', async () => {
  await expect(completeJson('data', { config: { ...env, apiKey: '' }, transport: async () => { throw Error('不应调用'); } })).rejects.toMatchObject({ code: 'ai-not-configured' });
  for (const r of [Response.json({ error: { message: env.apiKey } }, { status: 401 }), completion('', 'stop'), completion('partial', 'length'), completion('{bad')]) {
    try { await completeJson('data', { config: env, transport: async () => r }); throw Error('不应成功'); }
    catch (error) { expect(String(error)).not.toContain(env.apiKey); expect(error).toHaveProperty('code'); }
  }
});
it('AI 响应大小限制和总超时覆盖等待头部以及正文停滞', async () => {
  await expect(completeJson('data', { config: env, transport: async () => new Response('x'.repeat(512 * 1024 + 1)) })).rejects.toMatchObject({ code: 'too-large' });
  await expect(completeJson('data', { config: env, timeoutMs: 15, transport: () => new Promise(() => {}) })).rejects.toMatchObject({ code: 'ai-timeout' });
  await expect(completeJson('data', { config: env, timeoutMs: 15, transport: async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('\n')); } })) })).rejects.toMatchObject({ code: 'ai-timeout' });
});
