import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createReferenceHandlers } from '../src/features/references/handlers';
import { ReferenceRepository } from '../src/features/references/repository';
const dirs: string[] = [];
async function setup() { const dir = await mkdtemp(join(tmpdir(), 'kanvi-api-')); dirs.push(dir); return createReferenceHandlers(new ReferenceRepository(dir)); }
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const html = '<div id="js_content"><h2>自己的文字</h2></div>';
function request(body: unknown, headers = {}) { return new Request('http://localhost:8787/api/references', { method: 'POST', headers: { host: 'localhost:8787', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); }
it('真实请求对象导入并读取本地记录，响应不暴露原始 HTML', async () => {
  const api = await setup();
  const r = await api.POST(request({ html })); expect(r.status).toBe(201);
  const value = await r.json();
  expect(value.reference.title).toBe('自己的文字');
  expect(JSON.stringify(value)).not.toContain('sourceHtml');
  expect((await api.POST(request({ html }))).status).toBe(200);
  const detail = await api.detail(new Request('http://localhost:8787', { headers: { host: 'localhost:8787' } }), value.reference.id);
  expect((await detail.json()).reference.styleEvidence[0].id).toBe('e1');
});
it('拒绝外部来源、混合输入、超限请求和错误 JSON', async () => {
  const api = await setup();
  expect((await api.POST(request({ html }, { origin: 'https://evil.test' }))).status).toBe(403);
  expect((await api.POST(request({ html, url: 'https://mp.weixin.qq.com/s/x' }))).status).toBe(400);
  expect((await api.POST(request({ html: 'x'.repeat(2 * 1024 * 1024 + 1) }))).status).toBe(413);
  const invalid = new Request('http://localhost:8787', { method: 'POST', headers: { host: 'localhost:8787', 'content-type': 'application/json' }, body: '{' });
  expect((await api.POST(invalid)).status).toBe(400);
});
