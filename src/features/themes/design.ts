import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ReferenceError } from '../references/contracts';
import { MAX_THEME_FILE_BYTES, themeIdPattern, validateThemeJson, type ThemeJson } from './schema';

export interface DesignParent { id: string; name: string; themeJson: ThemeJson; themeMarkdown: string }
export interface ThemeDesign { version: 1; prompt: string; adjustment: string; parent?: DesignParent; changes: string[] }
function invalid(): never { throw new ReferenceError('design-invalid', '模板设计记录损坏，未使用不完整的提示词。', 422); }
export function validateDesign(value: unknown): ThemeDesign {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const v = value as ThemeDesign;
  if (Object.keys(v).some(k => !['version', 'prompt', 'adjustment', 'parent', 'changes'].includes(k)) || v.version !== 1
    || typeof v.prompt !== 'string' || !v.prompt.trim() || Buffer.byteLength(v.prompt) > 8192
    || typeof v.adjustment !== 'string' || Buffer.byteLength(v.adjustment) > 8192
    || !Array.isArray(v.changes) || v.changes.length > 100 || v.changes.some(c => typeof c !== 'string' || c.length > 500)) return invalid();
  if (Buffer.byteLength(JSON.stringify(v)) > MAX_THEME_FILE_BYTES) return invalid();
  if (v.parent) {
    const p = v.parent;
    if (Object.keys(p).some(k => !['id','name','themeJson','themeMarkdown'].includes(k)) || !themeIdPattern.test(p.id)
      || typeof p.name !== 'string' || typeof p.themeMarkdown !== 'string' || !p.themeMarkdown.trim() || Buffer.byteLength(p.themeMarkdown) > 256 * 1024) return invalid();
    if (validateThemeJson(p.themeJson).id !== p.id) return invalid();
  }
  return v;
}
export async function readDesign(dir: string): Promise<ThemeDesign | null> {
  const path = join(dir, 'DESIGN.json');
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_THEME_FILE_BYTES) return invalid();
    return validateDesign(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    if (error instanceof ReferenceError) throw error;
    return invalid();
  }
}
export function describeTheme(theme: ThemeJson): string {
  const t = theme.tokens;
  const fonts: Record<string,string> = { serif: '衬线字体', sans: '无衬线字体', kai: '楷体', fangsong: '仿宋', mono: '等宽字体' };
  return `${theme.name}：${theme.description}\n气质：${theme.tags.mood.join('、')}；工艺：${theme.tags.craft.join('、')}；场景：${theme.tags.scenes.join('、')}。\n使用${fonts[t.type.stack]}，正文 ${t.type.body_size}，行高 ${t.type.body_line_height}，标题最大 ${t.type.max_title_size}。\n背景 ${t.color.page}，文字 ${t.color.ink}，主色 ${t.color.brand}，点缀色 ${t.color.accent}。\n边距 ${t.layout.gutter}，圆角 ${t.shape.radius}，阴影 ${t.shape.shadow}。\n沿用现有标题、段落、引用和装饰结构；除本次调整明确涉及的部分外，其余设计保持不变。`;
}
export function themeChanges(parent: DesignParent, theme: ThemeJson, markdown: string): string[] {
  const labels: Record<string,string> = {color:'配色',type:'字体与字号',shape:'圆角与阴影',layout:'宽度与边距'};
  const changes: string[] = [];
  for (const key of ['color','type','shape','layout'] as const) {
    if (JSON.stringify(parent.themeJson.tokens[key]) !== JSON.stringify(theme.tokens[key])) changes.push(`${labels[key]}已调整`);
  }
  if (JSON.stringify(parent.themeJson.structure_model) !== JSON.stringify(theme.structure_model)) changes.push('文章结构模型已调整');
  const blocks = (md: string) => new Map([...md.matchAll(/^### ((?:slot|sig):[^\n]+)\n([\s\S]*?)(?=^#{1,3} |$(?![\s\S]))/gm)].map(m => [m[1].trim(), m[2].trim()]));
  const before = blocks(parent.themeMarkdown), after = blocks(markdown);
  const names: Record<string,string> = {'slot:root':'正文容器','slot:hero':'文章标题','slot:h2':'章节标题','slot:paragraph':'正文段落','slot:blockquote':'引用','slot:footer':'文末署名'};
  for (const key of new Set([...before.keys(), ...after.keys()])) if (before.get(key) !== after.get(key)) changes.push(`${names[key] ?? key}：${!before.has(key) ? '新增' : !after.has(key) ? '移除' : '样式或结构变化'}`);
  if (!changes.length && parent.themeMarkdown !== markdown) changes.push('主题说明或装配规则有变化');
  return changes.length ? changes : ['未检测到排版结构或样式变化'];
}
