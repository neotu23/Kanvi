'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ThemeOverview } from '../features/themes/handlers';

export async function themeApi<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store', signal: options.signal ?? AbortSignal.timeout(300000) });
  let value;
  try { value = await response.json(); } catch { throw Error('本地服务未返回有效结果，请刷新重试。'); }
  if (!response.ok) throw Error(value.error ?? '操作失败');
  return value;
}
export function downloadFile(content: string, name: string, type = 'text/html;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function useThemeData() {
  const [overview, setOverview] = useState<ThemeOverview | null>(null);
  const [busy, setBusy] = useState('正在读取…');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const value = await themeApi<ThemeOverview>('/api/themes'); setOverview(value); return value;
  }, []);
  useEffect(() => { void load().catch(e => setError(e.message)).finally(() => setBusy('')); }, [load]);
  async function run(message: string, action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(message); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); } finally { setBusy(''); }
  }
  return { overview, load, busy, error, notice, setError, setNotice, run };
}
export const renderStatusLabels: Record<string,string> = { 'rule-passed': '规格检查通过', 'needs-fix': '需要修正', failed: '检测失败', checking: '正在检查' };
