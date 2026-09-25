'use client';
import { useEffect, useState } from 'react';
import type { RenderDetail, RenderSummary } from '../features/themes/repository';
import { themeApi, renderStatusLabels } from './theme-client';
import { ThemeResult } from './ThemeResult';
export function ThemeHistory() {
  const [renders, setRenders] = useState<RenderSummary[]>([]);
  const [detail, setDetail] = useState<RenderDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { void themeApi<{renders: RenderSummary[]}>('/api/themes/renders').then(v => setRenders(v.renders)).catch(e => setError(e.message)).finally(() => setBusy(false)); }, []);
  async function open(id: string) {
    setBusy(true); setError(''); setDetail(null);
    try { setDetail(await themeApi<RenderDetail>(`/api/themes/renders/${encodeURIComponent(id)}`)); }
    catch (e) { setError(e instanceof Error ? e.message : '读取失败'); } finally { setBusy(false); }
  }
  return <main className="reference-workspace"><div className="reference-intro"><span className="eyebrow">文章历史</span><h1>写过的文字，都在这里</h1><p className="intro">查看已保存的文章、检查结果，继续复制或下载。</p></div>
    {busy && <p role="status">正在读取…</p>}{error && <p className="error" role="alert">{error}</p>}
    <div className="reference-columns"><aside className="reference-card"><h2>已保存文章（{renders.length}）</h2><ul className="reference-list">{renders.map(item => <li key={item.id}><button disabled={busy} aria-current={detail?.record.id === item.id ? 'true' : undefined} onClick={() => void open(item.id)}><strong>{item.title}</strong><span>{item.themeName} · {renderStatusLabels[item.status]}</span><span>{new Date(item.createdAt).toLocaleString('zh-CN')}</span></button></li>)}</ul>{!renders.length && !busy && <p className="muted">还没有文章。<a href="/">去选择主题</a></p>}</aside>
    <section>{detail ? <ThemeResult detail={detail} busy={busy} /> : <div className="reference-empty">选择一篇文章，查看保存的结果。</div>}</section></div></main>;
}
