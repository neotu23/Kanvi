import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ReferenceError, referenceSummary, type ReferenceSnapshot, type ReferenceSummary } from './contracts';
import { extractArticle } from './extract-article';
import { validateReferenceUrl } from './fetch-reference';

export function validateId(id: string): void {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new ReferenceError('invalid-id', '参考 ID 无效。', 400);
}
function code(error: unknown): string | undefined { return (error as NodeJS.ErrnoException)?.code; }

/** Renaming a complete nonempty directory publishes a record without replacing an existing one. */
export async function publishRecord(root: string, id: string, filename: string, value: unknown): Promise<boolean> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const temp = await mkdtemp(join(root, '.pending-'));
  try {
    await writeFile(join(temp, filename), JSON.stringify(value), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try { await rename(temp, join(root, id)); return true; }
    catch (error) { if (['EEXIST', 'ENOTEMPTY'].includes(code(error) ?? '')) return false; throw error; }
  } finally { await rm(temp, { recursive: true, force: true }); }
}

export class ReferenceRepository {
  constructor(private root = resolve('data/references')) {}
  async save(snapshot: ReferenceSnapshot): Promise<{ created: boolean; snapshot: ReferenceSnapshot }> {
    validateId(snapshot.id);
    let created;
    try { created = await publishRecord(this.root, snapshot.id, 'snapshot.json', snapshot); }
    catch { throw new ReferenceError('storage-write', '参考保存失败，请检查本地数据目录权限和磁盘空间。', 500); }
    return { created, snapshot: await this.get(snapshot.id) };
  }
  async get(id: string): Promise<ReferenceSnapshot> {
    validateId(id);
    try {
      const path = join(this.root, id, 'snapshot.json');
      if ((await stat(path)).size > 16 * 1024 * 1024) throw new Error('oversized snapshot');
      const saved = JSON.parse(await readFile(path, 'utf8')) as ReferenceSnapshot;
      if (saved.version !== 1 || typeof saved.sourceHtml !== 'string' || typeof saved.fetchedAt !== 'string' || !Number.isFinite(Date.parse(saved.fetchedAt))) throw new Error('invalid snapshot');
      if (saved.sourceUrl !== null && (typeof saved.sourceUrl !== 'string' || validateReferenceUrl(saved.sourceUrl).href !== saved.sourceUrl)) throw new Error('invalid source');
      const rebuilt = extractArticle(saved.sourceHtml, saved.sourceUrl);
      for (const key of ['id', 'contentHash', 'title', 'articleHtml', 'styleEvidence', 'diagnostics'] as const) {
        if (JSON.stringify(saved[key]) !== JSON.stringify(rebuilt[key])) throw new Error('snapshot mismatch');
      }
      if (saved.id !== id) throw new Error('id mismatch');
      return { ...rebuilt, fetchedAt: saved.fetchedAt };
    } catch (error) {
      if (code(error) === 'ENOENT') throw new ReferenceError('not-found', '没有找到这份本地参考。', 404);
      throw new ReferenceError('storage-read', '本地参考读取失败或记录已损坏，未使用不完整数据。', 500);
    }
  }
  async list(after?: string): Promise<{ references: ReferenceSummary[]; nextCursor: string | null }> {
    if (after) validateId(after);
    try {
      const entries = await readdir(this.root, { withFileTypes: true });
      const ids = entries.filter(e => e.isDirectory() && /^[a-f0-9]{64}$/.test(e.name) && (!after || e.name > after)).map(e => e.name).sort();
      const page = ids.slice(0, 20);
      const references: ReferenceSummary[] = [];
      // Bound parsing/memory per page, instead of loading every raw article simultaneously.
      for (const id of page) references.push(referenceSummary(await this.get(id)));
      return { references, nextCursor: ids.length > page.length ? page.at(-1)! : null };
    } catch (error) {
      if (code(error) === 'ENOENT') return { references: [], nextCursor: null };
      if (error instanceof ReferenceError) throw error;
      throw new ReferenceError('storage-read', '本地参考列表读取失败。', 500);
    }
  }
}
