'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { ReferenceSummary, StyleEvidence } from '../features/references/contracts';
import type { AnalysisRecord } from '../features/ai/design-analysis';
import type { DesignRole } from '../features/ai/schema';

type ReferenceDetail = ReferenceSummary & { styleEvidence: StyleEvidence[] };
type ReferencePage = { references: ReferenceSummary[]; nextCursor: string | null };
type AnalysisPage = { analyses: AnalysisRecord[]; nextCursor: string | null; ai: { configured: boolean; model: string } };
async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store', signal: options.signal ?? AbortSignal.timeout(90_000) });
  let data;
  try { data = await response.json(); } catch { throw new Error('本地服务返回了无法读取的结果，请刷新后重试。'); }
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : '本地处理失败，请重试。');
  return data as T;
}
const roles: Record<DesignRole, string> = { container: '整体容器', heading: '标题', body: '正文', quote: '引用', list: '列表', emphasis: '强调', divider: '分隔' };
const propertyNames: Record<string, string> = {
  color: '文字颜色', backgroundColor: '背景颜色', fontSize: '字号', lineHeight: '行高', fontWeight: '字重', fontFamily: '字体类别', textAlign: '对齐', letterSpacing: '字距',
  marginTop: '上方留白', marginBottom: '下方留白', marginLeft: '左侧留白', marginRight: '右侧留白',
  paddingTop: '上内边距', paddingBottom: '下内边距', paddingLeft: '左内边距', paddingRight: '右内边距',
  borderWidth: '边框宽度', borderColor: '边框颜色', borderStyle: '边框样式', borderRadius: '圆角',
  borderLeftWidth: '左边框宽度', borderLeftColor: '左边框颜色', borderLeftStyle: '左边框样式',
};
const valueNames: Record<string, string> = { serif: '衬线字体', 'sans-serif': '无衬线字体', monospace: '等宽字体', left: '左对齐', center: '居中', right: '右对齐', solid: '实线', dashed: '虚线', dotted: '点线' };
const date = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。';

export function ReferenceWorkspace() {
  const [mode, setMode] = useState<'url' | 'html'>('url');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [references, setReferences] = useState<ReferenceSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [reference, setReference] = useState<ReferenceDetail | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [analysisCursor, setAnalysisCursor] = useState<string | null>(null);
  const [activeAnalysis, setActiveAnalysis] = useState<string | null>(null);
  const [ai, setAi] = useState<AnalysisPage['ai'] | null>(null);
  const [busy, setBusy] = useState<string | null>('正在读取本地参考…');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [evidenceId, setEvidenceId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<ReferencePage>('/api/references', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setReferences(data.references); setCursor(data.nextCursor); }
    }).catch(error => { if (!controller.signal.aborted) setError(errorText(error)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(null); });
    return () => controller.abort();
  }, []);

  async function selectReference(id: string) {
    setReference(null); setAnalyses([]); setAnalysisCursor(null); setActiveAnalysis(null); setAi(null); setEvidenceId(null);
    const detail = await api<{ reference: ReferenceDetail }>(`/api/references/${id}`);
    setReference(detail.reference);
    const history = await api<AnalysisPage>(`/api/references/${id}/analysis`);
    setAnalyses(history.analyses); setAnalysisCursor(history.nextCursor); setAi(history.ai);
    setActiveAnalysis([...history.analyses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id ?? null);
  }
  async function run(message: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(message); setError(''); setNotice('');
    try { await action(); } catch (error) { setError(errorText(error)); } finally { setBusy(null); }
  }
  async function importReference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run('正在读取并保存参考…', async () => {
      let body: { html: string } | { url: string };
      if (mode === 'html') {
        if (!file) throw new Error('请先选择保存的公众号 HTML 文件。');
        if (file.size > 2 * 1024 * 1024) throw new Error('HTML 文件不能超过 2 MiB。');
        let html;
        try { html = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
        catch { throw new Error('文件不是 UTF-8 编码，请转换后再导入。'); }
        body = { html };
      } else body = { url: url.trim() };
      const result = await api<{ reference: ReferenceSummary; duplicate: boolean }>('/api/references', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setReferences(items => [result.reference, ...items.filter(item => item.id !== result.reference.id)]);
      setNotice(result.duplicate ? '这份参考已经保存，已打开原记录。' : '参考已保存到本地。可以继续分析设计风格。');
      await selectReference(result.reference.id);
    });
  }
  async function analyze() {
    if (!reference) return;
    const selected = reference;
    await run('正在调用 DeepSeek 分析设计…', async () => {
      const data = await api<{ analysis: AnalysisRecord }>(`/api/references/${selected.id}/analysis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      setAnalyses(items => [data.analysis, ...items]); setActiveAnalysis(data.analysis.id);
      setNotice('设计草稿已保存。模板生成与样例规则检测将在下一阶段接入。');
    });
  }
  const analysis = analyses.find(item => item.id === activeAnalysis);
  const evidence = reference?.styleEvidence.find(item => item.id === evidenceId);

  return <main className="reference-workspace">
    <div className="reference-intro"><span className="eyebrow">参考风格</span><h1>留下喜欢的排版</h1><p className="intro">从一篇公众号文章开始，整理配色、层次与留白，留作之后排版的设计依据。</p></div>
    <div className="reference-columns">
      <aside className="reference-sidebar">
        <form className="reference-card" onSubmit={importReference}>
          <h2>添加参考</h2>
          <div className="source-switch" aria-label="参考来源">
            <button type="button" aria-pressed={mode === 'url'} disabled={Boolean(busy)} onClick={() => setMode('url')}>文章链接</button>
            <button type="button" aria-pressed={mode === 'html'} disabled={Boolean(busy)} onClick={() => setMode('html')}>HTML 文件</button>
          </div>
          {mode === 'url' ? <label className="field-label">公众号文章链接<input type="url" required placeholder="https://mp.weixin.qq.com/s/…" value={url} disabled={Boolean(busy)} onChange={e => setUrl(e.target.value)} /></label>
            : <label className="field-label">保存的文章 HTML<input type="file" accept=".html,.htm,text/html" required disabled={Boolean(busy)} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>}
          <p className="local-note">仅导入正文与设计证据。文件需为 UTF-8，最大 2 MiB。链接无法读取时，可导入自己保存的文章 HTML。</p>
          <button className="primary" disabled={Boolean(busy)} type="submit">保存参考 <span aria-hidden="true">→</span></button>
        </form>
        <section className="reference-card"><h2>本地参考</h2>
          {!references.length && <p className="muted">保存后的参考会出现在这里。</p>}
          <ul className="reference-list">{references.map(item => <li key={item.id}><button disabled={Boolean(busy)} aria-current={reference?.id === item.id ? 'true' : undefined} onClick={() => run('正在读取参考…', () => selectReference(item.id))}><strong>{item.title}</strong><span>{date(item.fetchedAt)}</span></button></li>)}</ul>
          <button className="text-button" disabled={Boolean(busy)} onClick={() => run('正在刷新参考…', async () => { const data = await api<ReferencePage>('/api/references'); setReferences(data.references); setCursor(data.nextCursor); })}>刷新列表</button>
          {cursor && <button className="text-button" disabled={Boolean(busy)} onClick={() => run('正在读取更多参考…', async () => { const data = await api<ReferencePage>(`/api/references?after=${cursor}`); setReferences(items => [...items, ...data.references.filter(item => !items.some(old => old.id === item.id))]); setCursor(data.nextCursor); })}>加载更多</button>}
        </section>
      </aside>
      <section className="reference-detail" aria-label="参考详情" aria-busy={Boolean(busy)}>
        <div role="status" aria-live="polite" className="status-message">{busy || notice}</div>
        {error && <p role="alert" className="error">{error}</p>}
        {!reference && !busy && <div className="reference-empty"><span aria-hidden="true">文</span><h2>选择一份参考</h2><p>导入文章，或从左侧打开已保存的参考。</p></div>}
        {reference && <>
          <div className="reference-card"><span className="eyebrow">已保存参考</span><h2 className="reference-title">{reference.title}</h2>
            <p className="muted">{reference.sourceUrl ? <a href={reference.sourceUrl} target="_blank" rel="noreferrer">查看原文章 ↗</a> : '来源：本地 HTML 文件'} · {date(reference.fetchedAt)}</p>
            <ul className="diagnostics">{reference.diagnostics.map(item => <li key={item.code}>{item.message}</li>)}</ul>
            <p className="local-note">点击分析会将本篇参考的结构、样式声明和每个元素最多 120 字的文字片段发送给 DeepSeek。原始 HTML 保留在本机。</p>
            {ai?.configured === false && <p className="warning">尚未配置 DeepSeek。请按 README 在本机填写服务端配置并重启，之后重新打开这份参考。</p>}
            <button className="primary" disabled={Boolean(busy) || ai?.configured === false} onClick={analyze}>{analyses.length ? '重新分析风格' : '分析设计风格'}<span aria-hidden="true">→</span></button>
            <p className="local-note">每次分析会保存一份独立草稿，不覆盖已有结果。</p>
            <details className="evidence"><summary>来源记录</summary><p>正文来源指纹：{reference.contentHash}</p><p>共 {reference.styleEvidence.length} 条结构证据。下方可查看原始声明。</p></details>
          </div>
          {analyses.length > 0 && <section className="reference-card">
            <label className="field-label">分析记录<select value={activeAnalysis ?? ''} disabled={Boolean(busy)} onChange={e => setActiveAnalysis(e.target.value)}>{[...analyses].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(item => <option key={item.id} value={item.id}>{date(item.createdAt)} · 设计草稿 · {item.id.slice(0, 8)}</option>)}</select></label>
            {analysisCursor && <button className="text-button" disabled={Boolean(busy)} onClick={() => run('正在读取更多分析…', async () => { const data = await api<AnalysisPage>(`/api/references/${reference.id}/analysis?after=${analysisCursor}`); setAnalyses(items => [...items, ...data.analyses.filter(item => !items.some(old => old.id === item.id))]); setAnalysisCursor(data.nextCursor); })}>加载更多分析记录</button>}
            {analysis && <>
              <p className="draft-label">设计草稿 · 尚未生成模板或进行规则检测</p>
              <div className="design-tags">{analysis.design.tags.map((tag, index) => <span key={index}>{tag}</span>)}</div>
              <h3>文字样式</h3>{analysis.design.textStyles.map((style, index) => <div className="design-section" key={index}>
                <h4>{roles[style.role]} <small>{style.basis === 'observed' ? '模型引用来源' : '模型估计'}</small></h4><p>{style.reason}</p>
                <dl className="style-values">{Object.entries(style.properties).map(([key, value]) => <div key={key}><dt>{propertyNames[key]}</dt><dd>{typeof value === 'string' ? valueNames[value] ?? value : `${value}${key === 'lineHeight' ? ' 倍' : key === 'fontWeight' ? '' : ' px'}`}</dd></div>)}</dl>
                <EvidenceLinks ids={style.evidenceIds} onSelect={setEvidenceId} />
              </div>)}
              <h3>区域结构</h3>{analysis.design.regions.map((region, index) => <div className="design-section" key={index}><h4>{region.name} <small>{region.basis === 'observed' ? '模型引用来源' : '模型估计'}</small></h4><p>{region.reason}</p><EvidenceLinks ids={region.evidenceIds} onSelect={setEvidenceId} /></div>)}
              {(['estimates', 'unsupported'] as const).map(key => analysis.design[key].length > 0 && <div key={key}><h3>{key === 'estimates' ? '估计与待确认项' : '当前不支持的设计'}</h3>{analysis.design[key].map((item, index) => <div className="design-section" key={index}><p>{item.description}</p><EvidenceLinks ids={item.evidenceIds} onSelect={setEvidenceId} /></div>)}</div>)}
              <details className="evidence"><summary>分析记录详情</summary><p>请求模型：{analysis.model}</p><p>提示版本：{analysis.promptVersion}</p><p>分析输入指纹：{analysis.inputHash}</p><p>证据 ID 校验不代表模型的设计判断一定正确。</p></details>
            </>}
          </section>}
          <section className="reference-card" id="source-evidence"><h2>来源证据</h2><label className="field-label">选择文字或区域<select value={evidenceId ?? ''} onChange={e => setEvidenceId(e.target.value || null)}><option value="">选择一条证据</option>{reference.styleEvidence.map(item => <option key={item.id} value={item.id}>{item.id} · {item.tag} · {item.text.slice(0, 30) || '无文字区域'}</option>)}</select></label>
            {evidence && <div className="source-evidence"><p>{evidence.text || '该区域没有文字。'}{evidence.text.length === 120 ? '（片段）' : ''}</p><p className="muted">上级区域：{evidence.parentId ?? '正文根区域'}</p>
              {!evidence.declarations.length && <p className="muted">本元素没有提取到受支持的样式声明，可能继承父级样式。</p>}
              {evidence.declarations.map((d, i) => <div key={i}><span className="muted">{d.origin === 'inline' ? '行内声明' : `样式表：${d.selector}`}</span><code>{d.property}: {d.value}</code></div>)}
            </div>}
          </section>
        </>}
      </section>
    </div>
  </main>;
}
function EvidenceLinks({ ids, onSelect }: { ids: string[]; onSelect: (id: string) => void }) {
  return <div className="evidence-links">{ids.map((id, i) => <a key={`${id}-${i}`} href="#source-evidence" onClick={() => onSelect(id)}>查看 {id}</a>)}</div>;
}
