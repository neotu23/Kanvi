'use client';
import { useEffect, useState } from 'react';
import { articleDocument } from '../features/output/document';
import type { RenderDetail } from '../features/themes/repository';
import type { ThemeOverview, ThemeSummary } from '../features/themes/handlers';
import { ArticlePreview } from './ArticlePreview';
import { CopyArticleButton } from './CopyArticleButton';

const statusLabels: Record<string, string> = { 'rule-passed': '规格检查通过', 'needs-fix': '需要修正', failed: '检测失败', checking: '正在检查' };
const originLabels: Record<string, string> = { seed: '种子示例', generated: '工厂产出', local: '本地主题' };

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store', signal: options.signal ?? AbortSignal.timeout(300000) });
  let value;
  try { value = await response.json(); } catch { throw Error('本地服务未返回有效结果，请刷新重试。'); }
  if (!response.ok) throw Error(value.error ?? '操作失败');
  return value;
}
const isBroken = (item: ThemeSummary | { id: string; error: string }): item is { id: string; error: string } => 'error' in item;

export function ThemeWorkspace() {
  const [overview, setOverview] = useState<ThemeOverview | null>(null);
  const [themeId, setThemeId] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [brief, setBrief] = useState('');
  const [detail, setDetail] = useState<RenderDetail | null>(null);
  const [preview, setPreview] = useState<{ id: string; html: string } | null>(null);
  const [busy, setBusy] = useState('正在读取本地主题库…');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load(): Promise<void> {
    const value = await api<ThemeOverview>('/api/themes');
    setOverview(value);
    setThemeId(current => current || (value.themes.find(item => !isBroken(item))?.id ?? ''));
  }
  useEffect(() => { void (async () => { try { await load(); } catch (e) { setError(e instanceof Error ? e.message : '读取失败'); } finally { setBusy(''); } })(); }, []);
  async function run(message: string, action: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(message); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); } finally { setBusy(''); }
  }
  function download(): void {
    if (!detail) return;
    const url = URL.createObjectURL(new Blob([articleDocument(detail.record.artifact.bodyHtml)], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `kanvi-${detail.record.theme.id}-${detail.record.id.slice(0, 8)}.html`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function pickFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setMarkdown(await file.text());
  }

  const themes = overview?.themes ?? [];
  const drafts = overview?.drafts ?? [];
  const ai = overview?.ai;

  return <main className="reference-workspace">
    <div className="reference-intro"><span className="eyebrow">风格主题</span><h1>选一套气质，装自己的文字</h1>
      <p className="intro">主题包来自固定版本的 gzh-beautify skill：种子示例可直接使用，也可以按 brief 生产自己的主题，经确认为入库。</p>
      {overview && <ul className="diagnostics">
        <li>skill：{overview.skill.installed ? '已安装固定版本' : '未安装，请运行 npm run setup:checker'}</li>
        <li>python3：{overview.python.available ? overview.python.version : '未检测到，无法运行 skill 校验脚本'}</li>
        <li>DeepSeek：{ai?.configured ? `已配置（${ai.model}）` : '未配置，可浏览主题与历史，不能生成'}</li>
      </ul>}
    </div>
    <div className="reference-columns">
      <aside className="reference-sidebar">
        <section className="reference-card"><h2>主题库（{themes.length}）</h2>
          <ul className="reference-list">{themes.map(item => <li key={item.id}>
            {isBroken(item) ? <button disabled><strong>{item.id}</strong><span>读取失败：{item.error}</span></button>
              : <button disabled={Boolean(busy)} aria-current={themeId === item.id ? 'true' : undefined} onClick={() => { setThemeId(item.id); setDetail(null); run('正在读取主题预览…', async () => setPreview(await api(`/api/themes/${encodeURIComponent(item.id)}`))); }}>
                  <strong>{item.name}</strong>
                  <span>{originLabels[item.origin] ?? item.origin} · 签名槽 {item.signatureCount} · 正文 {item.bodySize}</span>
                  <span>{item.tags.mood.join('、')}｜{item.tags.scenes.join('、')}</span>
                </button>}
          </li>)}</ul>
          {!themes.length && <p className="muted">主题库为空。运行 <code>npm run theme:seed</code> 复制种子主题，或用下面的主题工厂生成。</p>}
          <button className="text-button" disabled={Boolean(busy)} onClick={() => run('正在刷新主题库…', load)}>刷新主题库</button>
        </section>
        <section className="reference-card"><h2>待确认草案（{drafts.length}）</h2>
          {drafts.map(entry => <div key={entry.themeId}>
            <p><strong>{entry.ok ? entry.draft?.name : entry.themeId}</strong></p>
            {entry.ok && entry.draft ? <ul className="diagnostics"><li>{entry.themeId}</li><li>lint：{entry.draft.lint.ok ? '0 ERROR / 0 WARN' : `${entry.draft.lint.errorCount} ERROR / ${entry.draft.lint.warnCount} WARN`}</li><li>模型：{entry.draft.model}</li></ul> : <p className="warning">{entry.error}</p>}
            <div className="template-actions">
              <button className="secondary" disabled={Boolean(busy)} onClick={() => run('正在读取草案预览…', async () => setPreview(await api(`/api/themes/${encodeURIComponent(entry.themeId)}`)))}>预览</button>
              <button className="primary" disabled={Boolean(busy) || !entry.ok || !entry.draft?.lint.ok} onClick={() => run('正在确认入库…', async () => { const value = await api<{ themeId: string }>(`/api/themes/drafts/${encodeURIComponent(entry.themeId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm' }) }); setNotice(`已入库：${value.themeId}`); await load(); })}>确认入库</button>
              <button className="text-button" disabled={Boolean(busy)} onClick={() => run('正在丢弃草案…', async () => { await api(`/api/themes/drafts/${encodeURIComponent(entry.themeId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'discard' }) }); await load(); })}>丢弃</button>
            </div>
          </div>)}
          {!drafts.length && <p className="muted">没有待确认草案。</p>}
        </section>
        <section className="reference-card"><h2>主题工厂</h2>
          <p className="local-note">写清气质、场景与偏好，AI 按 skill 规范产出草案；lint 通过后仍需你确认气质才入库。</p>
          <textarea className="brief-input" rows={6} value={brief} onChange={event => setBrief(event.target.value)} placeholder="例如：禅意留白，适合随笔与生活记录；大段距、居中衬线金句、1px 细线。" />
          <button className="primary" disabled={Boolean(busy) || !brief.trim() || !ai?.configured} onClick={() => run('正在生成主题草案，可能需要一分钟…', async () => { const value = await api<{ draft: { themeId: string; lint: { ok: boolean } } }>('/api/themes/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief }) }); setNotice(`草案已生成：${value.draft.themeId}（lint ${value.draft.lint.ok ? '通过' : '未通过'}）`); setBrief(''); await load(); })}>生成草案</button>
        </section>
        <section className="reference-card"><h2>备份与恢复</h2>
          <p className="local-note">备份包含主题包（三件套 + 来源记录）与渲染历史；不含草案、artifacts、vendor 与密钥。恢复只新增，不覆盖已有条目。</p>
          <div className="template-actions">
            <button className="secondary" disabled={Boolean(busy)} onClick={() => run('正在导出备份…', async () => { const value = await api<Record<string, unknown>>('/api/backup'); const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `kanvi-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('备份已下载。'); })}>导出备份</button>
            <label className="secondary">恢复备份<input type="file" accept="application/json,.json" hidden onChange={event => { const file = event.target.files?.[0]; if (!file) return; void run('正在恢复备份…', async () => { const text = await file.text(); const value = await api<{ themes: { added: string[]; skipped: string[] }; renders: { added: string[]; skipped: string[] } }>('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text }); setNotice(`恢复完成：主题 +${value.themes.added.length}（跳过 ${value.themes.skipped.length}），历史 +${value.renders.added.length}（跳过 ${value.renders.skipped.length}）`); await load(); }); event.target.value = ''; }} /></label>
          </div>
        </section>
        <section className="reference-card"><h2>本地数据路径</h2>
          <ul className="diagnostics">
            <li>主题库：{overview?.paths.themes}</li>
            <li>待确认草案：{overview?.paths.drafts}</li>
            <li>渲染历史：{overview?.paths.renders}</li>
            <li>验证产物：{overview?.paths.artifacts}</li>
          </ul>
          <p className="local-note">这些目录不进入 Git；<code>themes/</code> 里的主题包是需要提交的资产。</p>
        </section>
        <section className="reference-card"><h2>渲染历史（{overview?.renders.length ?? 0}）</h2>
          <ul className="reference-list">{(overview?.renders ?? []).map(item => <li key={item.id}><span><strong>{item.title}</strong></span><span>{item.themeName} · {statusLabels[item.status] ?? item.status} · {new Date(item.createdAt).toLocaleString('zh-CN')}</span></li>)}</ul>
          {!overview?.renders.length && <p className="muted">还没有渲染记录。</p>}
        </section>
      </aside>
      <section className="reference-detail" aria-busy={Boolean(busy)}>
        <p role="status" className="status-message">{busy || notice}</p>
        {error && <p className="error" role="alert">{error}</p>}
        <section className="reference-card"><h2>生成正文</h2>
          <div className="template-actions">
            <label className="secondary">选择 .md 文件<input type="file" accept=".md,.markdown,text/markdown" hidden onChange={event => void pickFile(event.target.files?.[0])} /></label>
            <select value={themeId} onChange={event => setThemeId(event.target.value)}>
              {themes.filter((item): item is ThemeSummary => !isBroken(item)).map(item => <option key={item.id} value={item.id}>{item.name}（{item.id}）</option>)}
            </select>
          </div>
          <textarea className="markdown-input" rows={12} value={markdown} onChange={event => setMarkdown(event.target.value)} placeholder="粘贴 Markdown 原文（最多 256 KiB；发送给模型的部分上限 60 KiB）。" />
          <div className="template-actions">
            <button className="primary" disabled={Boolean(busy) || !markdown.trim() || !themeId || !ai?.configured} onClick={() => run('正在生成并检查，请稍候…', async () => { const value = await api<RenderDetail>('/api/themes/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown, themeId }) }); setDetail(value); setPreview(null); await load(); })}>生成并检查</button>
            <span className="muted">规格检查 = skill 校验（0 ERROR / 0 WARN）+ 官方检查器（真实浏览器）</span>
          </div>
        </section>
        {detail && <section className="reference-card">
          <span className="eyebrow">{statusLabels[detail.status] ?? detail.status}</span>
          <h2 className="reference-title">{detail.record.parsed.metadata.title ?? '未命名文章'}</h2>
          <ul className="diagnostics">
            <li>主题：{detail.record.theme.name}（{detail.record.theme.id} · {originLabels[detail.record.theme.origin] ?? detail.record.theme.origin}）</li>
            <li>skill 校验：{detail.record.validate.errorCount} ERROR / {detail.record.validate.warnCount} WARN{detail.record.validate.error ? `（${detail.record.validate.error}）` : ''}</li>
            <li>官方检查器：{detail.check?.status ?? '未返回'}{detail.check?.error ? `（${detail.check.error}）` : ''}</li>
            <li>原文保真：{detail.record.fidelity.ok ? '按顺序全部命中' : `缺少 ${detail.record.fidelity.missing.length} 段`}</li>
            {detail.record.fidelity.residue.length > 0 && <li>残留标记：{detail.record.fidelity.residue.join('、')}</li>}
          </ul>
          {detail.record.fidelity.missing.length > 0 && <div className="issue"><strong>原文缺失片段</strong>{detail.record.fidelity.missing.map((item, index) => <p key={index}>{item}</p>)}</div>}
          {detail.record.fidelity.added.length > 0 && <details className="evidence"><summary>产物中原文以外的文字（章节编号、标签等，请核对）</summary>{detail.record.fidelity.added.map((item, index) => <p key={index}>{item}</p>)}</details>}
          {detail.record.validate.issues.map((issue, index) => <div className="issue" key={`v${index}`}><strong>{issue.level}</strong><p>{issue.message}</p></div>)}
          {detail.check?.issues.map((issue, index) => <div className="issue" key={`c${index}`}><strong>{issue.rule}</strong><p>{issue.message}</p></div>)}
          {detail.record.notes.length > 0 && <details className="evidence"><summary>模型说明</summary>{detail.record.notes.map((item, index) => <p key={index}>{item}</p>)}</details>}
          <div className="paper"><ArticlePreview html={detail.record.artifact.bodyHtml} /></div>
          <div className="output-actions">
            {detail.status === 'rule-passed' && !busy && <CopyArticleButton key={detail.record.artifact.htmlHash} artifact={detail.record.artifact} />}
            <button className="secondary" disabled={Boolean(busy)} onClick={download}>下载 HTML{detail.status === 'rule-passed' ? '' : '（未通过检查）'}</button>
          </div>
          <details className="evidence"><summary>绑定记录</summary>
            <p>记录：{detail.record.id}</p><p>正文指纹：{detail.record.artifact.htmlHash}</p><p>主题快照指纹：{detail.record.theme.definitionHash}</p>
            <p>提示词版本：{detail.record.skill.promptVersion} · skill commit：{detail.record.skill.commit}</p><p>模型：{detail.record.model}</p>
          </details>
          <p className="local-note">规格检查通过只表示该产物在固定检查器与固定 skill 版本下没有报告问题，不等于公众号实测通过。</p>
        </section>}
        {!detail && preview && <section className="reference-card"><h2>主题预览</h2>
          <p className="local-note">预览页不是交付物，已剥离脚本与事件属性；正文从生成结果的预览中复制。</p>
          <iframe className="article-frame" title="主题预览" sandbox="" srcDoc={preview.html} /></section>}
        {!detail && !preview && !busy && <div className="reference-empty"><h2>先选一套主题</h2><p>点左侧主题名看预览，或在下面粘贴 Markdown 生成正文。</p></div>}
      </section>
    </div>
  </main>;
}
