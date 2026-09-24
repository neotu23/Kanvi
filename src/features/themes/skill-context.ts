import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { upstreamLock } from '../../../scripts/check-upstream.mjs';
import { ReferenceError } from '../references/contracts';
import { skillRoot } from './python';

export const FACTORY_PROMPT_VERSION = 'gzh-theme-factory-v1';
export const RENDER_PROMPT_VERSION = 'gzh-theme-render-v1';
export const MAX_SYSTEM_BYTES = 200 * 1024;
const MAX_DOC_BYTES = 256 * 1024;

export function skillCommit(projectRoot = process.cwd()): string {
  const projects = upstreamLock(projectRoot).projects as Array<{ id: string; commit: string }>;
  const project = projects.find(item => item.id === 'gzh-beautify-skill');
  if (!project) throw new ReferenceError('skill-missing', '上游记录缺少 gzh-beautify-skill，请检查 docs/upstream-lock.json。', 503);
  return project.commit;
}
async function doc(path: string, label: string): Promise<string> {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile() || info.size > MAX_DOC_BYTES) throw new ReferenceError('skill-missing', `skill 参考文档 ${label} 缺失或过大，请重新运行 npm run setup:checker。`, 503);
  return await readFile(path, 'utf8');
}
export interface SkillDocs {
  factory: string; themeSchema: string; constraints: string; designSystem: string; themeSchemaJson: string; render: string;
}
export async function skillDocs(projectRoot = process.cwd()): Promise<SkillDocs> {
  const base = join(skillRoot(projectRoot), 'references');
  return {
    factory: await doc(join(base, 'theme-factory.md'), 'theme-factory.md'),
    themeSchema: await doc(join(base, 'theme-schema.md'), 'theme-schema.md'),
    constraints: await doc(join(base, 'wechat-constraints.md'), 'wechat-constraints.md'),
    designSystem: await doc(join(base, 'design-system.md'), 'design-system.md'),
    themeSchemaJson: await doc(join(base, 'theme.schema.json'), 'theme.schema.json'),
    render: await doc(join(base, 'render-contract.md'), 'render-contract.md'),
  };
}
function section(title: string, body: string): string {
  return `\n\n===== ${title} =====\n${body.trim()}`;
}
/** 组装一次请求的系统提示词；超过上限直接报错，不静默截断规范。 */
export function assembleSystemPrompt(parts: string[], root = ''): string {
  const prompt = parts.join('');
  if (Buffer.byteLength(prompt) > MAX_SYSTEM_BYTES) throw new ReferenceError('skill-context-limit', 'skill 规范与主题内容合计超过发送上限，未截断内容。', 413);
  return root + prompt;
}
export { section };
