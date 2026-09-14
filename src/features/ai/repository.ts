import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { ReferenceError, type ReferenceSnapshot } from '../references/contracts';
import { publishRecord, validateId } from '../references/repository';
import { analysisInput, type AnalysisRecord } from './design-analysis';
import { ANALYSIS_PROMPT_VERSION, validateAnalysis } from './schema';

const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export class AnalysisRepository {
  constructor(private root = resolve('data/analyses')) {}
  async save(record: AnalysisRecord): Promise<void> {
    validateId(record.referenceId);
    if (!idPattern.test(record.id)) throw new ReferenceError('invalid-id', '分析记录 ID 无效。', 400);
    try {
      const created = await publishRecord(join(this.root, record.referenceId), record.id, 'analysis.json', record);
      if (!created) throw new Error('immutable analysis already exists');
    } catch { throw new ReferenceError('analysis-write', '设计分析保存失败，请检查本地数据目录；原参考仍保留。', 500); }
  }
  async list(snapshot: ReferenceSnapshot, after?: string): Promise<{ analyses: AnalysisRecord[]; nextCursor: string | null }> {
    validateId(snapshot.id);
    if (after && !idPattern.test(after)) throw new ReferenceError('invalid-id', '分析分页 ID 无效。', 400);
    const root = join(this.root, snapshot.id);
    try {
      const entries = await readdir(root, { withFileTypes: true });
      const ids = entries.filter(e => e.isDirectory() && idPattern.test(e.name) && (!after || e.name > after)).map(e => e.name).sort();
      const inputHash = createHash('sha256').update(JSON.stringify(analysisInput(snapshot))).digest('hex');
      const page = ids.slice(0, 20);
      const analyses: AnalysisRecord[] = [];
      for (const id of page) {
        const path = join(root, id, 'analysis.json');
        if ((await stat(path)).size > 512 * 1024) throw new Error('oversized analysis');
        const record = JSON.parse(await readFile(path, 'utf8')) as AnalysisRecord;
        if (record.id !== id || record.version !== 1 || record.status !== 'draft' || record.referenceId !== snapshot.id || record.referenceHash !== snapshot.contentHash || record.inputHash !== inputHash || record.promptVersion !== ANALYSIS_PROMPT_VERSION || typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt)) || typeof record.model !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(record.model)) throw new Error('invalid analysis');
        analyses.push({ version: 1, id, status: 'draft', referenceId: snapshot.id, referenceHash: snapshot.contentHash,
          inputHash, promptVersion: record.promptVersion, createdAt: record.createdAt, model: record.model,
          design: validateAnalysis(record.design, snapshot.styleEvidence) });
      }
      return { analyses, nextCursor: ids.length > page.length ? page.at(-1)! : null };
    } catch (error) {
      // A missing collection is empty; a missing record inside a collection is a read error.
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT' && (error as NodeJS.ErrnoException)?.path === root) return { analyses: [], nextCursor: null };
      throw new ReferenceError('analysis-read', '设计分析读取失败或已损坏，未显示不完整结果。', 500);
    }
  }
}
