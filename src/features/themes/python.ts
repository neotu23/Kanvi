import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { upstreamRepo } from '../../../scripts/check-upstream.mjs';
import { ReferenceError } from '../references/contracts';

export interface ScriptIssue { level: 'ERROR' | 'WARN'; message: string }
export interface ScriptResult {
  ok: boolean; errorCount: number; warnCount: number;
  issues: ScriptIssue[]; raw: string; error?: string;
}
export interface ParsedCounts { ok: boolean; errorCount: number; warnCount: number; errors: string[]; warnings: string[] }
export interface PythonOptions { python?: string; signal?: AbortSignal; timeoutMs?: number; projectRoot?: string }

const MAX_OUTPUT = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

export function pythonExecutable(): string {
  return process.env.KANVI_PYTHON?.trim() || 'python3';
}
/** 上游 skill 工作副本路径；未安装时给出明确指引。 */
export function skillRoot(projectRoot = process.cwd()): string {
  try { return upstreamRepo(projectRoot, 'gzh-beautify-skill'); }
  catch { throw new ReferenceError('skill-missing', '尚未安装 gzh-beautify skill，请先运行 npm run setup:checker。', 503); }
}

interface RunOutcome { code: number | null; stdout: string; stderr: string; error?: string }
function runScript(script: string, args: string[], options: PythonOptions): Promise<RunOutcome> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const file = join(skillRoot(projectRoot), 'scripts', script);
  if (!existsSync(file)) return Promise.resolve({ code: null, stdout: '', stderr: '', error: 'skill 校验脚本缺失，请重新运行 npm run setup:checker。' });
  const python = options.python ?? pythonExecutable();
  return new Promise<RunOutcome>(done => {
    const child = spawn(python, [file, ...args], { cwd: projectRoot, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', size = 0, settled = false;
    const kill = () => {
      if (!child.pid) return;
      try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* 进程已经结束。 */ }
    };
    const finish = (outcome: RunOutcome) => {
      if (settled) return;
      settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort); kill(); done(outcome);
    };
    const error = (message: string) => finish({ code: null, stdout, stderr, error: message });
    const abort = () => error('校验已取消，未标记为通过。');
    const timer = setTimeout(() => error('校验脚本运行超时，未标记为通过。'), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const collect = (chunk: Buffer, isError: boolean) => {
      size += chunk.length;
      if (size > MAX_OUTPUT) return error('校验脚本输出超过限制，未标记为通过。');
      if (isError) stderr += chunk.toString(); else stdout += chunk.toString();
    };
    child.stdout?.on('data', (chunk: Buffer) => collect(chunk, false));
    child.stderr?.on('data', (chunk: Buffer) => collect(chunk, true));
    child.once('error', () => error(`无法启动 ${python}，请确认本机已安装 python3，或用 KANVI_PYTHON 指定路径。`));
    child.once('close', code => finish({ code, stdout, stderr }));
  });
}

function listed(block: string | undefined): string[] {
  if (!block) return [];
  return [...block.matchAll(/^\s*-\s+(.+)$/gm)].map(match => match[1].trim());
}
/** lint_theme.py：退出码只反映 ERROR，WARN 需从汇总行读取。 */
export function parseLint(raw: string): ParsedCounts | null {
  const summary = /汇总:\s*ERROR[×x](\d+)\s+WARN[×x](\d+)/.exec(raw);
  if (!summary) return null;
  const errorCount = Number(summary[1]);
  const warnCount = Number(summary[2]);
  const errors = [...raw.matchAll(/^\s{2}ERROR\s+(.+)$/gm)].map(match => match[1].trim());
  const warnings = [...raw.matchAll(/^\s{2}WARN\s+(.+)$/gm)].map(match => match[1].trim());
  const fill = (items: string[], count: number, label: string) => items.length < count
    ? [...items, ...(count - items.length ? [`另有 ${count - items.length} 项${label}未在输出中逐条列出。`] : [])]
    : items;
  return { ok: errorCount === 0 && warnCount === 0, errorCount, warnCount, errors: fill(errors, errorCount, '错误'), warnings: fill(warnings, warnCount, '警告') };
}
/** validate_article.py：ERROR/WARNING 分段列出，无问题时不打印计数行。 */
export function parseValidate(raw: string): ParsedCounts | null {
  const passed = /(^|\n)\s*通过\s*(\n|$)/.test(raw);
  const errorMatch = /ERROR\s*×(\d+)/.exec(raw);
  const warnMatch = /WARNING\s*×(\d+)/.exec(raw);
  if (!passed && !errorMatch && !warnMatch) return null;
  const errorCount = errorMatch ? Number(errorMatch[1]) : 0;
  const warnCount = warnMatch ? Number(warnMatch[1]) : 0;
  const errorBlock = /ERROR\s*×\d+([\s\S]*?)(?=\n\s*WARNING\s*×|$)/.exec(raw)?.[1];
  const warnBlock = /WARNING\s*×\d+([\s\S]*)$/.exec(raw)?.[1];
  return { ok: errorCount === 0 && warnCount === 0, errorCount, warnCount, errors: listed(errorBlock), warnings: listed(warnBlock) };
}

/**
 * 两个脚本的退出码语义不同：lint_theme.py 只在有 ERROR 时返回 1（WARN 不影响退出码），
 * validate_article.py --strict 有 ERROR 或 WARNING 都返回 1。矛盾时一律不标记通过。
 */
function result(parsed: ParsedCounts | null, outcome: RunOutcome, label: string, exitZeroMeans: (counts: ParsedCounts) => boolean): ScriptResult {
  const raw = (outcome.stdout + (outcome.stderr ? `\n${outcome.stderr}` : '')).slice(-16_000);
  if (outcome.error) return { ok: false, errorCount: 0, warnCount: 0, issues: [], raw, error: outcome.error };
  if (!parsed) return { ok: false, errorCount: 0, warnCount: 0, issues: [], raw, error: `${label}输出无法解析，未将结果标记为通过。` };
  const expectedZero = exitZeroMeans(parsed);
  if ((outcome.code === 0) !== expectedZero) return { ok: false, errorCount: parsed.errorCount, warnCount: parsed.warnCount, issues: [], raw, error: `${label}退出码与报告矛盾，未将结果标记为通过。` };
  const issues: ScriptIssue[] = [
    ...parsed.errors.map(message => ({ level: 'ERROR' as const, message })),
    ...parsed.warnings.map(message => ({ level: 'WARN' as const, message })),
  ];
  if (parsed.errorCount > 0 && issues.every(issue => issue.level !== 'ERROR')) issues.push({ level: 'ERROR', message: '脚本报告了错误但未列出条目，请查看原始输出。' });
  return { ok: parsed.ok, errorCount: parsed.errorCount, warnCount: parsed.warnCount, issues: issues.slice(0, 200), raw };
}

export async function runLintTheme(dir: string, options: PythonOptions = {}): Promise<ScriptResult> {
  const outcome = await runScript('lint_theme.py', [dir], options);
  return result(parseLint(outcome.stdout), outcome, 'lint_theme.py', counts => counts.errorCount === 0);
}
export async function runValidateArticle(htmlPath: string, options: PythonOptions = {}): Promise<ScriptResult> {
  const outcome = await runScript('validate_article.py', ['--strict', htmlPath], options);
  return result(parseValidate(outcome.stdout), outcome, 'validate_article.py', counts => counts.errorCount === 0 && counts.warnCount === 0);
}
export async function runWrapPreview(htmlPath: string, outputPath: string, options: PythonOptions = {}): Promise<ScriptResult> {
  const outcome = await runScript('wrap_preview.py', [htmlPath, outputPath], options);
  const raw = (outcome.stdout + (outcome.stderr ? `\n${outcome.stderr}` : '')).slice(-16_000);
  if (outcome.error) return { ok: false, errorCount: 0, warnCount: 0, issues: [], raw, error: outcome.error };
  if (outcome.code !== 0 || !existsSync(outputPath)) return { ok: false, errorCount: 0, warnCount: 0, issues: [], raw, error: '预览页生成失败。' };
  return { ok: true, errorCount: 0, warnCount: 0, issues: [], raw };
}
export async function pythonVersion(options: PythonOptions = {}): Promise<string | null> {
  const python = options.python ?? pythonExecutable();
  return await new Promise<string | null>(done => {
    const child = spawn(python, ['--version'], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', settled = false;
    const finish = (value: string | null) => { if (!settled) { settled = true; clearTimeout(timer); done(value); } };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(null); }, 10_000);
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.once('error', () => finish(null));
    child.once('close', () => finish(/Python\s+(\d+\.\d+\.\d+)/.exec(output)?.[1] ?? null));
  });
}
