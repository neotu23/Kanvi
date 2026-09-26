'use client';
import { useEffect, useReducer, useState } from 'react';
import type { RenderDetail } from '../features/themes/repository';
import type { ThemeSummary } from '../features/themes/handlers';
import { initialThemeFlow, themeFlowReducer } from '../features/themes/workspace-flow';
import { ThemePreview } from './ThemePreview';
import { ThemeResult } from './ThemeResult';
import { themeApi as api, useThemeData } from './theme-client';

const isBroken = (item: ThemeSummary | { id: string; error: string }): item is { id: string; error: string } => 'error' in item;

export function ThemeWorkspace({ initialThemeId = '' }: { initialThemeId?: string }) {
  const { overview, load, busy, error, notice, setError, setNotice, run } = useThemeData();
  const [flow, dispatch] = useReducer(themeFlowReducer, { ...initialThemeFlow, id: initialThemeId });
  const themeId = flow.id;
  const [markdown, setMarkdown] = useState('');
  const [detail, setDetail] = useState<RenderDetail | null>(null);
  const [preview, setPreview] = useState<{ id: string; html: string; source: string; markdown: string } | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  useEffect(() => {
    if (overview) dispatch({ type: 'library', ids: overview.themes.filter(item => !isBroken(item)).map(item => item.id) });
  }, [overview]);
  useEffect(() => {
    if (!themeId) { setPreview(null); setPreviewPending(false); return; }
    const controller = new AbortController();
    setPreview(null); setPreviewPending(true); setError('');
    void api<{ id: string; html: string; source: string; markdown: string }>(`/api/themes/${encodeURIComponent(themeId)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) })
      .then(value => {
        if (controller.signal.aborted) return;
        setPreview(value);
        dispatch({ type: 'loaded', id: value.id, available: value.source === '主题包' });
      })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '预览读取失败'); })
      .finally(() => { if (!controller.signal.aborted) setPreviewPending(false); });
    return () => controller.abort();
  }, [themeId, flow.revision]);
  function selectTheme(id: string) {
    dispatch({ type: 'select', id }); setDetail(null);
  }
  async function pickFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setMarkdown(await file.text());
  }

  const themes = overview?.themes ?? [];
  const ai = overview?.ai;
  const selected = themes.find(item => item.id === themeId);
  const selectedThemeName = selected && !isBroken(selected) ? selected.name : themeId;
  const canCompose = flow.ready && flow.available;

  return <main className="reference-workspace theme-home">
    <div className="reference-intro"><span className="eyebrow">风格主题</span><h1>选一套气质，装自己的文字</h1>
      <p className="intro">选一套喜欢的主题，看完整文章效果，再导入自己的文字。</p>
    </div>
    <div className="theme-home-layout">
        <section className="theme-library" aria-labelledby="theme-library-title">
          <div className="theme-library-heading">
            <h2 id="theme-library-title">主题库（{themes.length}）</h2>
            <div className="theme-library-actions">
              <button className="text-button" disabled={Boolean(busy)} onClick={() => run('正在刷新主题库…', load)}>刷新主题库</button>
              {flow.stage === 'preview' && <button className="primary theme-compose-entry" disabled={Boolean(busy) || !canCompose}
                title={canCompose ? `使用「${selectedThemeName}」，开始导入文章。` : flow.ready ? '请先保存当前主题，再进入正文生成。' : '选择主题并查看预览，再进入正文生成。'}
                onClick={() => dispatch({ type: 'compose' })}>生成正文 →</button>}
            </div>
          </div>
          <ul className="theme-library-list">{themes.map(item => <li key={item.id}>
            {isBroken(item) ? <button disabled><strong>{item.id}</strong><span>读取失败：{item.error}</span></button>
              : <button disabled={Boolean(busy)} aria-current={themeId === item.id ? 'true' : undefined} title={`${item.tags.mood.join('、')}｜${item.tags.scenes.join('、')}`} onClick={() => selectTheme(item.id)}>
                  <strong>{item.name}</strong>
                  <span>{item.tags.mood.join('、')}</span>
                </button>}
          </li>)}</ul>
          {!themes.length && <p className="muted">主题库为空。<a href="/studio">制作第一套模板</a>。</p>}
        </section>
      <section id="theme-work-area" className="reference-detail" aria-busy={Boolean(busy)}>
        <p role="status" className="status-message">{busy || notice}</p>
        {error && <p className="error" role="alert">{error}</p>}
        {flow.stage === 'preview' && <>
          {previewPending && <p role="status">正在读取完整文章预览…</p>}
          {preview && preview.id === themeId && <section className="reference-card theme-preview-card">
            <div className="theme-home-preview-heading">
              <span>示例预览<span className="theme-preview-disclaimer"> · 未进行正文规格检查</span></span>
              <a className="sample-download" href="/samples/slow-afternoon.md" download="把一个下午还给自己.md">下载示例</a>
            </div>
            <ThemePreview key={preview.id} html={preview.html} />
          </section>}
          {!themeId && !busy && <div className="reference-empty"><h2>先选一套主题</h2><p>从上方主题库选择，查看完整文章预览。</p></div>}
        </>}
        {flow.stage === 'compose' && <section className="reference-card"><h2>生成正文</h2>
          <p className="muted">当前主题：{selectedThemeName}</p>
          <button className="text-button" disabled={Boolean(busy)} onClick={() => dispatch({ type: 'back' })}>返回主题预览</button>
          <div className="template-actions">
            <label className="secondary">选择 .md 文件<input type="file" accept=".md,.markdown,text/markdown" hidden onChange={event => void pickFile(event.target.files?.[0])} /></label>
          </div>
          {overview && !ai?.configured && <p className="warning">尚未配置模型，暂时不能生成正文。<a href="/settings">前往设置</a></p>}
          <textarea className="markdown-input" rows={12} value={markdown} onChange={event => setMarkdown(event.target.value)} placeholder="粘贴 Markdown 原文（最多 256 KiB；发送给模型的部分上限 60 KiB）。" />
          <div className="template-actions">
            <button className="primary" disabled={Boolean(busy) || !markdown.trim() || !canCompose || !themeId || !ai?.configured} onClick={() => run('正在生成并检查，请稍候…', async () => { const value = await api<RenderDetail>('/api/themes/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown, themeId }) }); setDetail(value); await load(); setNotice('生成结果已保存到本地渲染历史。'); })}>生成并检查</button>
            <span className="muted">规格检查 = skill 校验（0 ERROR / 0 WARN）+ 官方检查器（真实浏览器）</span>
          </div>
        </section>}
        {flow.stage === 'compose' && detail && <ThemeResult detail={detail} busy={Boolean(busy)} />}
      </section>
    </div>
  </main>;
}
