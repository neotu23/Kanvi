'use client';
import { themeApi as api, useThemeData } from './theme-client';
export function ThemeSettings() {
  const { overview, load, busy, error, notice, setNotice, run } = useThemeData();
  return <main className="reference-workspace"><div className="reference-intro"><span className="eyebrow">设置</span><h1>管理本地工作台</h1><p className="intro">查看运行状态，备份与恢复你的主题和文章。</p></div>
    <p role="status">{busy || notice}</p>{error && <p className="error" role="alert">{error}</p>}
    <div className="settings-grid">
      <section className="reference-card"><h2>运行状态</h2><ul className="diagnostics">
        <li>主题工具：{overview?.skill.installed ? '已安装' : '未安装'}</li>
        <li>Python：{overview?.python.version ?? '未检测到'}</li>
        <li>DeepSeek：{overview?.ai.configured ? `已配置（${overview.ai.model}）` : '未配置'}</li>
      </ul><p className="local-note">在项目的 .env.local 中配置 DEEPSEEK_API_KEY 后重启服务。密钥仅保存在本地服务端。</p></section>
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
