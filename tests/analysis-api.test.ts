import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { ReferenceRepository } from '../src/features/references/repository';
import { extractArticle } from '../src/features/references/extract-article';
import { AnalysisRepository } from '../src/features/ai/repository';
import { createAnalysisHandlers } from '../src/features/ai/handlers';
import { analyzeDesign } from '../src/features/ai/design-analysis';
const valid = JSON.parse(readFileSync('tests/fixtures/design-analysis.json', 'utf8'));
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
function request(method = 'POST', origin?: string) { return new Request('http://localhost:8787/api/references/id/analysis', { method, headers: { host: 'localhost:8787', ...(origin ? { origin } : {}), 'content-type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) }); }
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'kanvi-analysis-')); dirs.push(root);
  const refs = new ReferenceRepository(join(root, 'references'));
  const analyses = new AnalysisRepository(join(root, 'analyses'));
  const snapshot = extractArticle('<div id="js_content"><p>自写日记</p></div>', null); await refs.save(snapshot);
  return { root, refs, analyses, snapshot };
}
it('通过导入到模型协议校验再落盘的链路，重试保存独立草稿且原快照不变', async () => {
  const { root, refs, analyses, snapshot } = await setup();
  const api = createAnalysisHandlers(refs, analyses, (s, options) => analyzeDesign(s, { ...options, config: { apiKey: 'local-test-key', model: 'deepseek-flash' }, transport: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(valid) } }] }) }));
  const first = await api.POST(request(), snapshot.id); expect(first.status).toBe(201);
  const record = (await first.json()).analysis;
  expect(record.status).toBe('draft');
  expect((await api.POST(request(), snapshot.id)).status).toBe(201);
  const history = await api.GET(request('GET'), snapshot.id);
  expect((await history.json()).analyses).toHaveLength(2);
  expect(await refs.get(snapshot.id)).toEqual(snapshot);
  expect((await new AnalysisRepository(join(root, 'analyses')).list(snapshot)).analyses).toHaveLength(2);
  await writeFile(join(root, 'analyses', snapshot.id, record.id, 'analysis.json'), '{}');
  await expect(analyses.list(snapshot)).rejects.toMatchObject({ code: 'analysis-read' });
});
it('拒绝跨站分析，未配置时不制造结果，失败后释放并发占用', async () => {
  const { refs, analyses, snapshot } = await setup();
  const api = createAnalysisHandlers(refs, analyses, (s, options) => analyzeDesign(s, { ...options, config: { apiKey: '', model: 'deepseek-flash' } }));
  expect((await api.POST(request('POST', 'https://evil.test'), snapshot.id)).status).toBe(403);
  expect((await api.POST(request(), snapshot.id)).status).toBe(503);
  expect((await analyses.list(snapshot)).analyses).toEqual([]);
  let release: () => void = () => {};
  let started: () => void = () => {};
  const entered = new Promise<void>(resolve => { started = resolve; });
  const busy = createAnalysisHandlers(refs, analyses, async () => { started(); await new Promise<void>(resolve => { release = resolve; }); throw Error('controlled failure'); });
  const running = busy.POST(request(), snapshot.id);
  // Second request is rejected before body reads or filesystem work.
  expect((await busy.POST(request(), snapshot.id)).status).toBe(409);
  await entered; release();
  expect((await running).status).toBe(500);
  expect((await busy.POST(request(), '../invalid')).status).toBe(400);
});
