'use client';
import type { RenderDetail } from '../features/themes/repository';
import { articleDocument } from '../features/output/document';
import { ArticlePreview } from './ArticlePreview';
import { CopyArticleButton } from './CopyArticleButton';
import { downloadFile, renderStatusLabels as statusLabels } from './theme-client';
const originLabels: Record<string,string> = {seed:'种子示例',generated:'工厂产出',local:'本地主题'};
export function ThemeResult({detail, busy = false}: {detail: RenderDetail; busy?: boolean}) {
  const download = () => downloadFile(articleDocument(detail.record.artifact.bodyHtml), `kanvi-${detail.record.theme.id}-${detail.record.id.slice(0,8)}.html`);
  return <section className="reference-card">
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
        </section>;
}
