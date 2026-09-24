import { existsSync, mkdirSync, cpSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { upstreamLock, upstreamRepo } from './check-upstream.mjs';

const id = 'gzh-beautify-skill';
const root = process.cwd();
const project = upstreamLock(root).projects.find(item => item.id === id);
if (!project) throw new Error(`上游记录缺少 ${id}，请检查 docs/upstream-lock.json`);
const source = join(upstreamRepo(root, id), 'examples', 'themes');
const target = resolve(root, 'themes');
mkdirSync(target, { recursive: true });

const note = themeId => `# 来源

本主题包取自 gzh-beautify-skill 的示例主题，内容与上游固定版本一致，未做修改。

- 上游：${project.url}
- commit：${project.commit}
- 上游路径：examples/themes/${themeId}/
- 许可：MIT，Copyright (c) 2026 TwinWrite；完整许可文本见仓库根 THIRD_PARTY_NOTICES.md
- 复制日期：${new Date().toISOString().slice(0, 10)}

恢复方式：\`npm run theme:seed\`（已存在的主题目录不会被覆盖）。本目录可被删除，删除后可由此脚本重新复制。
`;

const created = [];
const skipped = [];
for (const entry of readdirSync(source, { withFileTypes: true })) {
 if (!entry.isDirectory()) continue;
 const dest = join(target, entry.name);
 if (existsSync(dest)) { skipped.push(entry.name); continue; }
 cpSync(join(source, entry.name), dest, { recursive: true });
 writeFileSync(join(dest, 'SOURCE.md'), note(entry.name), { encoding: 'utf8', mode: 0o600 });
 created.push(entry.name);
}
console.log(JSON.stringify({ created, skipped, target }, null, 2));
