import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { extractArticle } from '../src/features/references/extract-article';
import { ReferenceRepository } from '../src/features/references/repository';
const dirs: string[] = [];
async function directory() { const p = await mkdtemp(join(tmpdir(), 'kanvi-references-')); dirs.push(p); return p; }
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
it('原子保存、并发重复导入不覆盖首份快照，重启后可读', async () => {
  const dir = await directory();
  const a = extractArticle('<div id="js_content"><p>自写日记</p></div>', null);
  const repository = new ReferenceRepository(dir);
  const results = await Promise.all([repository.save(a), new ReferenceRepository(dir).save({ ...a, fetchedAt: new Date(Date.now() + 1000).toISOString() })]);
  expect(results.filter(r => r.created)).toHaveLength(1);
  expect(results[0].snapshot.fetchedAt).toBe(results[1].snapshot.fetchedAt);
  expect(await new ReferenceRepository(dir).get(a.id)).toEqual(results[0].snapshot);
  expect((await repository.list()).references.map(s => s.id)).toEqual([a.id]);
});
it('拒绝路径穿越、无效 ID、损坏记录，并区别存储失败', async () => {
  const dir = await directory(); const repository = new ReferenceRepository(dir);
  await expect(repository.get('../secret')).rejects.toMatchObject({ code: 'invalid-id' });
  await expect(repository.get('a'.repeat(64))).rejects.toMatchObject({ code: 'not-found' });
  const a = extractArticle('<div id="js_content">原文</div>', null);
  await repository.save(a);
  await writeFile(join(dir, a.id, 'snapshot.json'), '{');
  await expect(repository.get(a.id)).rejects.toMatchObject({ code: 'storage-read' });
  const file = join(dir, 'not-a-directory'); await writeFile(file, 'x');
  await expect(new ReferenceRepository(file).save(a)).rejects.toMatchObject({ code: 'storage-write' });
});
