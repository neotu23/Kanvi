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
const day = new Date().toISOString().slice(0, 10);

const note = themeId => `# 来源

本主题包取自 gzh-beautify-skill 的示例主题，内容与上游固定版本一致，未做修改。

- 上游：${project.url}
- commit：${project.commit}
- 上游路径：examples/themes/${themeId}/
- 许可：MIT，Copyright (c) 2026 TwinWrite；完整许可文本见仓库根 THIRD_PARTY_NOTICES.md
- 复制日期：${day}

恢复方式：\`npm run theme:seed\`（已存在的主题目录不会被覆盖）。本目录可被删除，删除后可由此脚本重新复制。
`;
const recordOf = themeId => JSON.stringify({
 version: 1, origin: 'seed', createdAt: day,
 upstream: { id, url: project.url, commit: project.commit, path: `examples/themes/${themeId}/`, license: 'MIT, Copyright (c) 2026 TwinWrite' },
}, null, 2) + '\n';

const created = [];
const skipped = [];
const described = [];
for (const entry of readdirSync(source, { withFileTypes: true })) {
 if (!entry.isDirectory()) continue;
 const dest = join(target, entry.name);
 if (!existsSync(dest)) { cpSync(join(source, entry.name), dest, { recursive: true }); created.push(entry.name); }
 else skipped.push(entry.name);
 // 只补写缺失的来源记录，不覆盖人工修改过的说明。
 const needsRecord = !existsSync(join(dest, 'SOURCE.json'));
 const needsNote = !existsSync(join(dest, 'SOURCE.md'));
 if (needsRecord) writeFileSync(join(dest, 'SOURCE.json'), recordOf(entry.name), { encoding: 'utf8', mode: 0o600 });
 if (needsNote) writeFileSync(join(dest, 'SOURCE.md'), note(entry.name), { encoding: 'utf8', mode: 0o600 });
 if (needsRecord || needsNote) described.push(entry.name);
}
console.log(JSON.stringify({ created, skipped, described, target }, null, 2));
