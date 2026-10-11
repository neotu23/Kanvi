'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AiConfigurationStatus } from '../features/ai/client';
import { themeApi as api, useThemeData } from './theme-client';

interface AiStatusResponse { ai: AiConfigurationStatus }
interface ConnectionTestResponse { ok: boolean; model: string; models: string[]; modelAvailable: boolean }

const sourceLabels: Record<AiConfigurationStatus['source'], string> = {
  local: '本地设置（data/settings.json）', env: '环境变量', none: '未配置',
};
const localTime = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });

/** 密钥只在服务端读写；这里只拿得到状态与尾 4 位提示。 */
function DeepSeekSettings({ refresh }: { refresh: () => Promise<unknown> }) {
  const [status, setStatus] = useState<AiConfigurationStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const value = await api<AiStatusResponse>('/api/settings');
    setStatus(value.ai);
    // 只在首次填充模型名，避免覆盖正在输入的内容。
    setModel(current => current || value.ai.model);
    return value;
  }, []);
  useEffect(() => { void load().catch((e: unknown) => setError(e instanceof Error ? e.message : '读取设置失败')); }, [load]);

  async function run(message: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(message); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); } finally { setBusy(''); }
  }
  const key = apiKey.trim();
  const body = (method: string, value: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

  const save = () => run('正在保存…', async () => {
    const result = await api<AiStatusResponse>('/api/settings', body('PUT', { model, ...(key ? { apiKey: key } : {}) }));
    setStatus(result.ai); setApiKey('');
    setNotice(key ? '设置已保存，立即生效。' : '已保存模型名；API Key 未改动。');
    await refresh();
  });
  const test = () => run('正在测试连接…', async () => {
    const result = await api<ConnectionTestResponse>('/api/settings/test', body('POST', { ...(key ? { apiKey: key } : {}), ...(model.trim() ? { model } : {}) }));
    const scope = key ? '输入的 Key' : '已保存的 Key';
    setNotice(result.modelAvailable
      ? `连接成功：${scope}可用，账号返回 ${result.models.length} 个模型。`
      : `连接成功：${scope}可用，但账号返回的模型列表中没有 ${result.model}，请确认模型名。`);
  });
  const clear = () => run('正在清除…', async () => {
    const result = await api<AiStatusResponse>('/api/settings', body('PUT', { apiKey: '' }));
    setStatus(result.ai); setApiKey('');
    setNotice('已清除本地密钥；配置过环境变量时会回退到环境变量。');
    await refresh();
  });

  return <section className="reference-card ai-settings"><h2>DeepSeek 模型</h2>
    <ul className="diagnostics">
      <li>状态：{status ? (status.configured ? `已配置（${status.model}）` : '未配置') : '正在读取…'}</li>
      <li>密钥来源：{status ? sourceLabels[status.source] : '正在读取…'}</li>
      {status?.keyHint && <li>当前密钥：{status.keyHint}</li>}
      {status?.updatedAt && <li>最近保存：{localTime(status.updatedAt)}</li>}
    </ul>
    <label className="field-label">API Key<input type="password" name="deepseek-api-key" autoComplete="off" spellCheck={false} value={apiKey}
      placeholder={status?.configured ? '已保存，留空表示不修改' : '粘贴 DeepSeek API Key'} onChange={e => setApiKey(e.target.value)} /></label>
    <label className="field-label">模型名<input name="deepseek-model" autoComplete="off" spellCheck={false} value={model} onChange={e => setModel(e.target.value)} /></label>
    <div className="template-actions">
      <button className="secondary" disabled={Boolean(busy) || !model.trim()} onClick={save}>保存设置</button>
      <button className="secondary" disabled={Boolean(busy) || (!status?.configured && !key)} onClick={test}>测试连接</button>
      <button className="secondary" disabled={Boolean(busy) || status?.source !== 'local'} onClick={clear}>清除本地密钥</button>
    </div>
    <p role="status">{busy || notice}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {status?.fileError && <p className="error" role="alert">{status.fileError}</p>}
    <p className="local-note">密钥只写入本机 {status?.settingsPath ?? 'data/settings.json'}（权限 600），不进入 Git、备份与浏览器响应，界面只回显尾 4 位。保存后立即生效，无需重启。也可以用环境变量 DEEPSEEK_API_KEY 与 DEEPSEEK_MODEL 配置：本地设置优先，回退时才读取环境变量。</p>
  </section>;
}

export function ThemeSettings() {
  const { overview, load, busy, error, notice, setNotice, run } = useThemeData();
  return <main className="reference-workspace"><div className="reference-intro"><span className="eyebrow">设置</span><h1>管理本地工作台</h1><p className="intro">查看运行状态，配置模型，备份与恢复你的主题和文章。</p></div>
    <p role="status">{busy || notice}</p>{error && <p className="error" role="alert">{error}</p>}
    <div className="settings-grid">
      <section className="reference-card"><h2>运行状态</h2><ul className="diagnostics">
        <li>主题工具：{overview?.skill.installed ? '已安装' : '未安装'}</li>
        <li>Python：{overview?.python.version ?? '未检测到'}</li>
        <li>DeepSeek：{overview?.ai.configured ? `已配置（${overview.ai.model}）` : '未配置'}</li>
      </ul><p className="local-note">未配置模型时仍可浏览主题库、草案与历史；生成正文与主题草案需要可用的 Key。</p></section>
        <DeepSeekSettings refresh={load} />
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
          <p className="local-note">主题库保存在本地；备份包含已保存主题与文章历史。</p>
        </section>
      <section className="reference-card"><h2>其他工具</h2><div className="legacy-links"><a href="/demo">排版样例</a><a href="/references">参考风格</a><a href="/templates">旧版模板工作台</a><a href="/generate">旧版文章生成</a></div></section>
    </div></main>;
}
