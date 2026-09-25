'use client';
import { useEffect, useRef, useState } from 'react';
import type { StudioDetail } from '../features/themes/studio';
import type { ThemeDraft } from '../features/themes/factory';
import { themeApi, useThemeData } from './theme-client';
import { ThemePreview } from './ThemePreview';

type Selection = { id: string; source: 'saved' | 'draft' };
type Editor = { name: string; prompt: string; adjustment: string };
const blank: Editor = { name: '', prompt: '', adjustment: '' };
export function ThemeStudio() {
  const { overview, load, busy, error, notice, setError, setNotice, run } = useThemeData();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [detail, setDetail] = useState<StudioDetail | null>(null);
  const [editor, setEditor] = useState<Editor>(blank);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBase, setShowBase] = useState(false);
  const [started, setStarted] = useState(false);
  const edits = useRef(new Map<string,Editor>());
  const keyOf = (value: Selection | null) => value ? `${value.source}:${value.id}` : 'new';
  function choose(value: Selection | null) {
    edits.current.set(keyOf(selection), editor);
    setStarted(true); setSelection(value); setDetail(null); setShowBase(false);
    setEditor(edits.current.get(keyOf(value)) ?? blank); setError(''); setNotice('');
  }
  useEffect(() => {
    if (!overview || started) return;
    const first = overview.themes.find(t => !('error' in t));
    setStarted(true);
    if (first) setSelection({ id: first.id, source: 'saved' });
  }, [overview, started]);
  useEffect(() => {
    if (!selection) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setDetail(null); setError('');
    void themeApi<StudioDetail>(`/api/themes/${encodeURIComponent(selection.id)}/design?source=${selection.source}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) })
      .then(value => {
        if (controller.signal.aborted) return;
        setDetail(value); setShowBase(false);
        setEditor(edits.current.get(keyOf(selection)) ?? { name: value.name, prompt: value.design.prompt, adjustment: '' });
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selection, setError]);
  const saved = overview?.themes ?? [];
  const drafts = overview?.drafts ?? [];
  const currentDraft = drafts.find(d => d.themeId === selection?.id);
  const disabled = Boolean(busy) || loading;
  const pendingEdits = Boolean(detail && (editor.name !== detail.name || editor.prompt !== detail.design.prompt || editor.adjustment.trim()));
  const matches = (text: string) => text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  async function generate() {
    const value = await themeApi<{draft: ThemeDraft}>('/api/themes/drafts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editor, ...(selection ? { baseId: selection.id, baseSource: selection.source } : {}) }),
    });
    edits.current.set(keyOf(selection), editor);
    await load(); setStarted(true); setSelection({ id: value.draft.themeId, source: 'draft' });
    setNotice(value.draft.lint.ok ? '调整预览已生成，原模板已保留。满意后点击“未保存主题”入库。' : '草案已生成，但样式检查未通过，请查看诊断后继续调整。');
  }
  async function save() {
    if (!selection || selection.source !== 'draft') return;
    const value = await themeApi<{themeId:string}>(`/api/themes/drafts/${encodeURIComponent(selection.id)}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({action:'confirm'}) });
    await load(); setSelection({id:value.themeId,source:'saved'}); setNotice('模板已保存，原版也保留在主题库中。');
  }
  async function discard() {
    if (!selection || selection.source !== 'draft') return;
    await themeApi(`/api/themes/drafts/${encodeURIComponent(selection.id)}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'discard'})});
    edits.current.delete(keyOf(selection)); setSelection(null); setDetail(null); setEditor(blank); await load(); setNotice('草案已丢弃。');
  }
  return <main className="reference-workspace studio-workspace">
    <div className="studio-title reference-intro"><div><span className="eyebrow">模板制作</span><h1>把喜欢的风格，调成自己的</h1><p className="intro">从已有模板开始微调，也可以写下想法，自行设计一套新模板。</p></div><button className="primary" disabled={disabled} onClick={() => choose(null)}>＋ 新建模板</button></div>
    <p className="status-message" role="status">{busy || (loading ? '正在读取模板设计…' : notice)}</p>{error && <p className="error" role="alert">{error}</p>}
    <div className="studio-columns">
      <aside className="reference-card studio-library"><label className="field-label">搜索模板<input value={query} onChange={e => setQuery(e.target.value)} placeholder="名称或气质" /></label>
        <h2>已保存（{saved.length}）</h2><ul className="reference-list">{saved.filter(t => matches('error' in t ? t.id : `${t.name} ${t.tags.mood.join(' ')}`)).map(t => <li key={t.id}>{'error' in t ? <p className="error">{t.id}：{t.error}</p> : <button disabled={disabled} aria-current={selection?.source === 'saved' && selection.id === t.id ? 'true' : undefined} onClick={() => choose({id:t.id,source:'saved'})}><strong>{t.name}</strong><span>{t.tags.mood.join(' · ')}</span></button>}</li>)}</ul>
        <h2>未保存（{drafts.length}）</h2><ul className="reference-list">{drafts.filter(d => matches(d.draft?.name ?? d.themeId)).map(d => <li key={d.themeId}><button disabled={disabled || !d.ok} aria-current={selection?.source === 'draft' && selection.id === d.themeId ? 'true' : undefined} onClick={() => choose({id:d.themeId,source:'draft'})}><strong>{d.draft?.name ?? d.themeId}</strong><span>{d.error ?? (d.draft?.lint.ok ? '等待保存' : '样式需要调整')}</span></button></li>)}</ul>
        {!drafts.length && <p className="muted">没有未保存草案。</p>}
      </aside>
      <section className="reference-card studio-editor"><h2>{selection ? '设计与调整' : '设计新模板'}</h2>
        <label className="field-label">模板名称<input disabled={disabled} maxLength={24} value={editor.name} onChange={e => setEditor({...editor,name:e.target.value})} placeholder="给这套风格起个名字" /></label>
        <label className="field-label">设计提示词<textarea disabled={disabled} rows={13} value={editor.prompt} onChange={e => setEditor({...editor,prompt:e.target.value})} placeholder="例如：暖白纸感，深灰正文，细线分隔。适合生活随笔，标题用衬线字体，段落留白宽松。" /></label>
        <p className="local-note">{detail?.promptSource === 'derived' ? '根据当前模板整理的设计说明，不是原始生成提示词。' : detail ? '已保存的设计提示词，可编辑后生成新的草案。' : '描述气质、配色、字体与间距，越具体越容易得到你想要的效果。'}</p>
        {selection && <label className="field-label">本次想调整什么？<textarea disabled={disabled} rows={4} value={editor.adjustment} onChange={e => setEditor({...editor,adjustment:e.target.value})} placeholder="例如：保留配色和字体，把章节标题的上下间距缩小，其他部分保持不变。" /></label>}
        {detail?.design.adjustment && <details className="evidence"><summary>上次使用的调整要求</summary><p>{detail.design.adjustment}</p></details>}
        {detail?.design.parent && <p className="local-note">基于「{detail.design.parent.name}」制作，原版保留在库中。</p>}
        <button className="primary" disabled={disabled || !overview?.ai.configured || editor.name.trim().length < 2 || !editor.prompt.trim() || Boolean(selection && !detail)} onClick={() => void run('正在生成模板预览，请稍候…', generate)}>{selection ? '生成调整预览' : '生成模板预览'}</button>
        {overview && !overview.ai.configured && <p className="warning">配置模型后才能生成，当前可以查看和编辑提示词。<a href="/settings">前往设置</a></p>}
        {currentDraft && !currentDraft.draft?.lint.ok && <p className="warning">草案检查：{currentDraft.draft?.lint.errorCount ?? 0} 项错误，{currentDraft.draft?.lint.warnCount ?? 0} 项提醒。修正后才能保存。</p>}
      </section>
      <section className="reference-card studio-preview">
        <div className="theme-preview-heading"><h2>完整文章预览</h2>{detail?.source === 'draft' && <button className="secondary" disabled={disabled || pendingEdits || !currentDraft?.draft?.lint.ok} title="保存生成的预览版本；编辑后的提示词需要先重新生成" onClick={() => void run('正在保存模板…',save)}>未保存主题</button>}{detail?.source === 'saved' && <a href={`/?theme=${encodeURIComponent(detail.id)}`}>去首页使用 →</a>}</div>
        {detail?.source === 'draft' && pendingEdits && <p className="local-note">提示词或名称有修改，请先生成新的调整预览，再保存对应版本。</p>}
        {detail?.baseHtml && <div className="source-switch"><button aria-pressed={showBase} onClick={() => setShowBase(true)}>当前模板</button><button aria-pressed={!showBase} onClick={() => setShowBase(false)}>调整后</button></div>}
        {detail?.design.changes.length ? <details className="evidence" open><summary>检测到的变化</summary><ul>{detail.design.changes.map((c,i) => <li key={i}>{c}</li>)}</ul><p>请结合预览核对是否符合预期。</p></details> : null}
        {detail ? <><ThemePreview key={`${detail.id}-${showBase}`} html={showBase && detail.baseHtml ? detail.baseHtml : detail.html} />{detail.source === 'draft' && <details className="evidence"><summary>草案管理</summary><button className="text-button" disabled={disabled} onClick={() => void run('正在丢弃草案…',discard)}>丢弃此草案</button></details>}</> : <div className="reference-empty"><h2>{loading ? '正在加载预览' : '让文字先穿上这套风格'}</h2><p>选择已有模板，或填写设计提示词生成完整文章预览。</p></div>}
      </section>
    </div>
  </main>;
}
