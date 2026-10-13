import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { OutputArtifact } from '../output/contracts';
import { ReferenceError } from '../references/contracts';
import { publishRecord } from '../references/repository';
import type { CheckReport } from '../validation/normalize-report';
import { parseThemeArticle, type ParsedThemeArticle } from './article';
import { checkFidelity, type FidelityResult } from './verify-article';
import type { ScriptIssue } from './python';
import type { ThemeJson } from './schema';
import { SOURCE_TOC_PROMPT_VERSION } from './skill-context';

export const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MAX_RECORD_BYTES = 8 * 1024 * 1024;

export interface ThemeSnapshot { id: string; name: string; definitionHash: string; themeJson: ThemeJson; themeMarkdown: string; origin: string; sourceCommit?: string }
export interface RecordedValidation { ok: boolean; errorCount: number; warnCount: number; issues: ScriptIssue[]; raw: string; error?: string }
export interface RenderRecord {
  schemaVersion: 1; id: string; createdAt: string;
  markdown: string; parsed: ParsedThemeArticle;
  theme: ThemeSnapshot;
  skill: { commit: string; promptVersion: string }; model: string;
  articleHash: string; themeHash: string; rawOutputHash: string; notes: string[];
  artifact: OutputArtifact; validate: RecordedValidation; fidelity: FidelityResult;
}
export type RenderStatus = 'checking' | 'needs-fix' | 'rule-passed' | 'failed';
export interface RenderDetail { record: RenderRecord; status: RenderStatus; check?: CheckReport; error?: string }
export interface RenderSummary { id: string; createdAt: string; title: string; themeId: string; themeName: string; status: RenderStatus }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const assertId = (id: string) => { if (typeof id !== 'string' || !uuid.test(id)) throw new ReferenceError('invalid-id', '渲染记录 ID 无效。', 400); };
async function readJson(path: string): Promise<unknown> {
  if ((await stat(path)).size > MAX_RECORD_BYTES) throw new Error('oversized record');
  return JSON.parse(await readFile(path, 'utf8'));
}
/** 主题内容快照与产物绑定：主题被删除后历史仍可复现校验。 */
export function themeSnapshotHash(theme: ThemeSnapshot): string {
  return sha256(`${theme.themeMarkdown}\n${JSON.stringify(theme.themeJson)}`);
}
function validateRecord(raw: RenderRecord, id: string): RenderRecord {
  if (!raw || raw.schemaVersion !== 1 || raw.id !== id || typeof raw.createdAt !== 'string' || !Number.isFinite(Date.parse(raw.createdAt))) throw new Error('invalid render record');
  if (typeof raw.markdown !== 'string' || !same(parseThemeArticle(raw.markdown), raw.parsed)) throw new Error('source mismatch');
  const artifact = raw.artifact;
  if (!artifact || typeof artifact.bodyHtml !== 'string' || !artifact.bodyHtml.trim() || artifact.htmlHash !== sha256(artifact.bodyHtml) || artifact.plainText !== raw.artifact.plainText) throw new Error('artifact mismatch');
  if (!raw.theme || themeSnapshotHash(raw.theme) !== raw.theme.definitionHash || typeof raw.theme.themeMarkdown !== 'string') throw new Error('theme snapshot mismatch');
  if (typeof raw.model !== 'string' || typeof raw.skill?.commit !== 'string' || typeof raw.skill?.promptVersion !== 'string'
    || typeof raw.rawOutputHash !== 'string' || typeof raw.articleHash !== 'string' || typeof raw.themeHash !== 'string'
    || !raw.validate || typeof raw.validate.ok !== 'boolean' || typeof raw.validate.errorCount !== 'number' || typeof raw.validate.warnCount !== 'number'
    || !raw.fidelity || typeof raw.fidelity.ok !== 'boolean' || !Array.isArray(raw.fidelity.missing) || !Array.isArray(raw.fidelity.added) || !Array.isArray(raw.fidelity.residue)) {
    throw new Error('invalid render fields');
  }
  // 保真结果也要能复算，避免记录里的结论与产物脱节。
  const fidelityOptions = raw.skill.promptVersion === SOURCE_TOC_PROMPT_VERSION
    ? { enforceSourceToc: true, themeMarkdown: raw.theme.themeMarkdown } : {};
  if (!same(checkFidelity(raw.parsed, artifact.bodyHtml, fidelityOptions), raw.fidelity)) throw new Error('fidelity mismatch');
  return raw;
}
function checkedReport(value: unknown, artifact: OutputArtifact, commit: string): CheckReport {
  const report = value as CheckReport;
  if (!report || !['passed', 'violations', 'error'].includes(report.status) || report.htmlHash !== artifact.htmlHash || report.checkerCommit !== commit
    || !Array.isArray(report.issues) || report.issues.length > 1000 || (report.status === 'passed' && report.issues.length) || (report.status === 'violations' && !report.issues.length)
    || report.issues.some(issue => !issue || typeof issue.rule !== 'string' || typeof issue.message !== 'string')) {
    return { status: 'error', htmlHash: artifact.htmlHash, checkerCommit: commit, issues: [], error: '检查器报告与正文或检查器版本不匹配，未标记为通过。' };
  }
  return report;
}
export function statusOf(record: RenderRecord, check: CheckReport): RenderStatus {
  if (check.status === 'error' || record.validate.error) return 'failed';
  if (check.status === 'passed' && record.validate.ok && record.fidelity.ok) return 'rule-passed';
  return 'needs-fix';
}

export class ThemeRenderRepository {
  private active = new Set<string>();
  constructor(private root = resolve(process.env.KANVI_RENDERS_ROOT ?? 'data/renders')) {}
  async create(record: RenderRecord): Promise<RenderRecord> {
    const safe = validateRecord(record, record.id);
    try {
      if (!await publishRecord(this.root, record.id, 'record.json', safe)) throw new Error('duplicate record');
      this.active.add(record.id);
      return safe;
    } catch { throw new ReferenceError('render-write', '渲染记录保存失败，未覆盖已有历史。', 500); }
  }
  async finish(record: RenderRecord, check: CheckReport): Promise<void> {
    try {
      const stored = await this.record(record.id);
      if (!same(stored, record)) throw new Error('record mismatch');
      if (!await publishRecord(join(this.root, record.id), 'result', 'report.json', check)) throw new Error('immutable report');
    } catch { throw new ReferenceError('render-write', '检测报告保存失败或与记录不匹配，未覆盖历史。', 500); }
    finally { this.active.delete(record.id); }
  }
  private async record(id: string): Promise<RenderRecord> {
    assertId(id);
    const dir = join(this.root, id);
    try {
      if (!(await stat(dir)).isDirectory()) throw new Error('invalid record directory');
      return validateRecord(await readJson(join(dir, 'record.json')) as RenderRecord, id);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && (error as NodeJS.ErrnoException).path === dir) throw new ReferenceError('not-found', '没有找到这份渲染记录。', 404);
      throw new ReferenceError('render-read', '渲染记录损坏或绑定不一致，未使用不完整数据。', 500);
    }
  }
  async get(id: string, checkerCommit: string): Promise<RenderDetail> {
    const record = await this.record(id);
    const dir = join(this.root, id, 'result');
    try { await stat(dir); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.active.has(id)
          ? { record, status: 'checking' }
          : { record, status: 'failed', error: '上次检测中断，请重新渲染；旧记录仍保留。' };
      }
      throw error;
    }
    const report = checkedReport(await readJson(join(dir, 'report.json')), record.artifact, checkerCommit);
    return { record, check: report, status: statusOf(record, report) };
  }
  async list(checkerCommit: string, after?: string): Promise<{ renders: RenderSummary[]; nextCursor: string | null }> {
    if (after) assertId(after);
    let entries;
    try { entries = await readdir(this.root, { withFileTypes: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { renders: [], nextCursor: null };
      throw new ReferenceError('render-read', '渲染历史读取失败。', 500);
    }
    const ids = entries.filter(entry => entry.isDirectory() && uuid.test(entry.name) && (!after || entry.name > after)).map(entry => entry.name).sort();
    if (ids.length > 1000) throw new ReferenceError('render-read', '渲染历史超过当前存储上限。', 500);
    const page = ids.slice(0, 20);
    const renders: RenderSummary[] = [];
    for (const id of page) {
      const detail = await this.get(id, checkerCommit);
      renders.push({
        id, createdAt: detail.record.createdAt, title: detail.record.parsed.metadata.title ?? '未命名文章',
        themeId: detail.record.theme.id, themeName: detail.record.theme.name, status: detail.status,
      });
    }
    return { renders, nextCursor: ids.length > page.length ? page.at(-1)! : null };
  }
}
