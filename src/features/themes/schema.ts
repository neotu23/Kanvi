import { ReferenceError } from '../references/contracts';

/** 上游 theme.schema.json 的 id 规则：字母开头、字母数字结尾、3–40 字符。 */
export const themeIdPattern = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;
export const REQUIRED_SLOTS = [
  'root', 'hero', 'toc', 'h2', 'h3', 'h3_label', 'paragraph', 'divider', 'strong', 'mark', 'underline', 'strike',
  'code_inline', 'blockquote', 'callout_tip', 'callout_warn', 'quote_pull', 'ul', 'ol', 'table', 'code_dark',
  'code_light', 'image', 'image_gif', 'media_ph', 'footer',
] as const;
export const MAX_THEME_FILE_BYTES = 512 * 1024;
export const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

export type ThemeOrigin = 'seed' | 'generated' | 'local';
export interface ThemeStructureModel { voice: string; density: string; heading: string; surface: string; rhythm: string }
export interface ThemeTokens {
  color: { page: string; ink: string; ink_muted: string; brand: string; brand_soft: string; brand_ink: string; accent: string; rule: string; underline: string };
  type: { stack: string; body_size: string; body_line_height: string; max_title_size: string };
  shape: { radius: string; shadow: string };
  layout: { max_width: string; gutter: string };
}
export interface ThemeJson {
  id: string; name: string; version: number; description: string;
  structure_model: ThemeStructureModel; tokens: ThemeTokens; underline_css: string;
  tags: { craft: string[]; mood: string[]; scenes: string[] };
  slots: string[]; signature_slots: string[]; files: { library: string; preview: string };
}
export interface ThemeSource {
  version: 1; origin: 'seed' | 'generated'; createdAt: string;
  upstream?: { id: string; url: string; commit: string; path: string; license: string };
  generated?: { model: string; promptVersion: string; skillCommit: string; briefHash: string };
}

export function fail(message = '主题包结构或来源记录无效。'): never {
  throw new ReferenceError('invalid-theme', message, 422);
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) return fail();
  return value as Record<string, unknown>;
}
function text(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== 'string' || value.length < min || value.length > max || /[<>\u0000-\u001f]/.test(value)) return fail(`${label} 无效。`);
  return value;
}
function enumValue(value: unknown, options: readonly string[], label: string): string {
  if (typeof value !== 'string' || !options.includes(value)) return fail(`${label} 不在允许取值内。`);
  return value;
}
function hex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) return fail(`${label} 必须是 6 位十六进制颜色。`);
  return value;
}
function pattern(value: unknown, regex: RegExp, label: string): string {
  if (typeof value !== 'string' || !regex.test(value)) return fail(`${label} 格式无效。`);
  return value;
}
function tagList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) return fail(`${label} 需要 2–4 项。`);
  return value.map(item => text(item, 1, 12, label));
}

export function validateThemeJson(value: unknown): ThemeJson {
  const theme = object(value, ['id', 'name', 'version', 'description', 'structure_model', 'tokens', 'underline_css', 'tags', 'slots', 'signature_slots', 'files']);
  const id = pattern(theme.id, themeIdPattern, '主题 id');
  const name = text(theme.name, 2, 24, '主题名称');
  if (!Number.isInteger(theme.version) || Number(theme.version) < 1) fail('主题 version 必须是正整数。');
  const description = text(theme.description, 8, 200, '主题描述');

  const structure = object(theme.structure_model, ['voice', 'density', 'heading', 'surface', 'rhythm']);
  const structure_model: ThemeStructureModel = {
    voice: enumValue(structure.voice, ['narrative', 'explainer', 'catalog', 'journal', 'brand'], 'structure_model.voice'),
    density: enumValue(structure.density, ['sparse', 'balanced', 'packed'], 'structure_model.density'),
    heading: enumValue(structure.heading, ['masthead', 'numbered-chapter', 'labeled-rail', 'stamp'], 'structure_model.heading'),
    surface: enumValue(structure.surface, ['paper', 'ink', 'soft-card', 'hairline'], 'structure_model.surface'),
    rhythm: enumValue(structure.rhythm, ['long-breath', 'staccato', 'documentary'], 'structure_model.rhythm'),
  };

  const tokens = object(theme.tokens, ['color', 'type', 'shape', 'layout']);
  const color = object(tokens.color, ['page', 'ink', 'ink_muted', 'brand', 'brand_soft', 'brand_ink', 'accent', 'rule', 'underline']);
  const colors = Object.fromEntries(Object.entries(color).map(([key, val]) => [key, hex(val, `tokens.color.${key}`)])) as ThemeTokens['color'];
  const type = object(tokens.type, ['stack', 'body_size', 'body_line_height', 'max_title_size']);
  const shape = object(tokens.shape, ['radius', 'shadow']);
  const layout = object(tokens.layout, ['max_width', 'gutter']);
  if (layout.max_width !== '677px') fail('tokens.layout.max_width 必须是 677px。');

  const tags = object(theme.tags, ['craft', 'mood', 'scenes']);
  if (!Array.isArray(theme.slots) || theme.slots.length < REQUIRED_SLOTS.length) fail('slots 未列出全部必选槽。');
  const slots = theme.slots.map(item => text(item, 1, 40, '槽位 id'));
  for (const required of REQUIRED_SLOTS) if (!slots.includes(required)) fail(`slots 缺少必选槽 ${required}。`);
  if (!Array.isArray(theme.signature_slots) || theme.signature_slots.length < 8 || theme.signature_slots.length > 16) fail('signature_slots 需要 8–16 项。');
  const signature_slots = theme.signature_slots.map(item => text(item, 1, 40, '签名槽 id'));
  if (new Set(signature_slots).size !== signature_slots.length) fail('signature_slots 不能重复。');
  const files = object(theme.files, ['library', 'preview']);
  if (files.library !== 'THEME.md' || files.preview !== 'preview.html') fail('files 必须指向 THEME.md 与 preview.html。');

  return {
    id, name, version: Number(theme.version), description, structure_model,
    tokens: {
      color: colors,
      type: {
        stack: enumValue(type.stack, ['sans', 'serif', 'kai', 'fangsong', 'mono'], 'tokens.type.stack'),
        body_size: pattern(type.body_size, /^(14|15|16)px$/, 'tokens.type.body_size'),
        body_line_height: pattern(type.body_line_height, /^1\.[5-9][0-9]?$/, 'tokens.type.body_line_height'),
        max_title_size: pattern(type.max_title_size, /^(18|19|20|21|22|23|24)px$/, 'tokens.type.max_title_size'),
      },
      shape: { radius: text(shape.radius, 1, 40, 'tokens.shape.radius'), shadow: text(shape.shadow, 1, 60, 'tokens.shape.shadow') },
      layout: { max_width: '677px', gutter: pattern(layout.gutter, /^\d+px$/, 'tokens.layout.gutter') },
    },
    underline_css: text(theme.underline_css, 10, 400, 'underline_css'),
    tags: { craft: tagList(tags.craft, 'tags.craft'), mood: tagList(tags.mood, 'tags.mood'), scenes: tagList(tags.scenes, 'tags.scenes') },
    slots, signature_slots, files: { library: 'THEME.md', preview: 'preview.html' },
  };
}

const isoDate = (value: unknown): string => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return fail('来源记录时间无效。');
  return value;
};
export function validateThemeSource(value: unknown): ThemeSource {
  const source = object(value, ['version', 'origin', 'createdAt', 'upstream', 'generated']);
  if (source.version !== 1) fail('来源记录版本不受支持。');
  const origin = enumValue(source.origin, ['seed', 'generated'], '来源类型');
  const createdAt = isoDate(source.createdAt);
  if (origin === 'seed') {
    if (source.generated !== undefined) fail('种子来源不应包含生成记录。');
    const upstream = object(source.upstream, ['id', 'url', 'commit', 'path', 'license']);
    return {
      version: 1, origin: 'seed', createdAt,
      upstream: {
        id: pattern(upstream.id, /^[a-z0-9-]{2,40}$/, '上游 id'),
        url: pattern(upstream.url, /^https:\/\/[^\s<>]+$/, '上游地址'),
        commit: pattern(upstream.commit, /^[a-f0-9]{40}$/, '上游 commit'),
        path: text(upstream.path, 1, 200, '上游路径'),
        license: text(upstream.license, 2, 200, '许可说明'),
      },
    };
  }
  if (source.upstream !== undefined) fail('生成来源不应包含上游记录。');
  const generated = object(source.generated, ['model', 'promptVersion', 'skillCommit', 'briefHash']);
  return {
    version: 1, origin: 'generated', createdAt,
    generated: {
      model: pattern(generated.model, /^[a-zA-Z0-9._-]{1,80}$/, '模型名'),
      promptVersion: text(generated.promptVersion, 1, 80, '提示词版本'),
      skillCommit: pattern(generated.skillCommit, /^[a-f0-9]{40}$/, 'skill commit'),
      briefHash: pattern(generated.briefHash, /^[a-f0-9]{64}$/, 'brief 指纹'),
    },
  };
}
