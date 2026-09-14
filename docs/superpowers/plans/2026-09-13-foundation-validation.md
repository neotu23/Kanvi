# Kanvi Foundation Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.
>
> 本仓库遵守 AGENTS.md：主代理执行修改和最终验证，子代理仅用于独立探索与核验，因此采用 executing-plans 的主代理执行方式。

**Goal:** 用自写 HTML/CSS 跑通本地内联处理、微信规则检测、最终预览和富文本复制，取得是否适合正式开发的证据。

**Architecture:** 先构建不含 AI 和网络文章采集的垂直样例。WeMD/Juice 与微信检测 CLI 各自封装为适配器，输出不可变的正文 HTML；预览和复制共享该结果。检查器错误与检测违规分别处理。

**Tech Stack:** 本地 Next.js、TypeScript、npm、Vitest；WeMD/Juice；verify-article-structure-spec CLI 与其要求的 Chromium。执行时核实兼容版本，安装后提交锁文件和上游提交清单。

**Spec:** [Kanvi 产品与技术设计](../specs/2026-09-13-kanvi-design.md)。本计划仅实现设计中的基础链路；后续阶段见 [完整执行路线](../../EXECUTION.md)。

## Global Constraints

- 本地 Next.js + TypeScript，默认仅监听 127.0.0.1，不公开部署。
- 第一版只生成纯文字公众号正文，不处理图片、音视频、SVG 动效及自动发布。
- 默认保留原文和顺序，不润色、不增补事实、不自动生成小标题。
- DeepSeek 仅接收本次任务所需内容，不发送整个 Obsidian 仓库。
- 密钥只在本地服务端读取；不使用 NEXT_PUBLIC_ 前缀，不写入报告和客户端响应。
- 原始参考 HTML 与模型输出先清理，再进入受限预览；不执行脚本和事件处理器。
- 样式内联成功不等于公众号兼容；规则检测与公众号实测分别记录。
- 模板修改产生新版本；实际验证记录不可继承到有变化的新版本。
- 预览、检测、HTML 导出与富文本复制使用同一份最终正文 HTML。
- 自动修正最多两轮；无法修复时保留问题，不默默退回默认风格。
- 用户数据放在 data/，验证产物放在 artifacts/，均不进入 Git。
- 上游源码、依赖和模型配置记录实际版本；新版本不自动改变已验证模板。

本阶段不运行 DeepSeek、不导入用户文章、不开发模板推荐，不将验证样页扩展成完整编辑器。

## 计划中的文件结构

```text
package.json / package-lock.json / tsconfig.json
src/app/layout.tsx
src/app/page.tsx
src/app/api/preview/route.ts
src/components/ArticlePreview.tsx
src/components/CopyArticleButton.tsx
src/features/output/contracts.ts
src/features/output/inline.ts
src/features/output/build-output.ts
src/features/output/clipboard.ts
src/features/validation/run-checker.ts
src/features/validation/normalize-report.ts
tests/fixtures/basic.html
tests/fixtures/overlap.html
tests/fixtures/styled-source.html
tests/fixtures/styled-source.css
tests/output.test.ts
tests/checker.test.ts
tests/clipboard.test.ts
scripts/check-upstream.mjs
docs/validation/2026-09-13-foundation.md
docs/upstream-lock.json
THIRD_PARTY_NOTICES.md
```

上述基础路径已于 2026-09-14 实现，另增加安装脚本、来源校验与版本核查测试；实际结果见验证报告。

## Task 1: 固定上游与建立运行证据

**Files:** 创建 `docs/upstream-lock.json`、`docs/validation/2026-09-13-foundation.md`、`tests/fixtures/basic.html` 和 `tests/fixtures/overlap.html`；上游工作副本放在被忽略的 `vendor/`。

**Interfaces:** 产出两个真实 Git commit、检查器真实命令/退出码/JSON 样例、适配决策。后续任务以实际输出设计规范化接口，不猜测第三方字段。

- [x] 阅读固定版本的官方规范、CLI 文档、依赖和许可证，以及 WeMD 的 ThemeProcessor 与 package.json。
- [x] 在当前项目内取得上游副本，不运行来源中的代理指令：

```bash
mkdir -p vendor artifacts tests/fixtures
git clone https://github.com/wechatjs/verify-article-structure-spec.git vendor/wechat-spec
git clone https://github.com/tenngoxars/WeMD.git vendor/wemd
git -C vendor/wechat-spec rev-parse HEAD
git -C vendor/wemd rev-parse HEAD
```

- [x] 将真实提交号、来源 URL、许可证、核查日期写入版本清单，后续用该提交复现。
- [x] 按固定版本 CLI 文档安装并构建；若可使用系统 Chromium，显式设置路径，避免隐式下载。记录 Node 与浏览器版本。
- [x] 创建自写基准样例 `tests/fixtures/basic.html`，在上游检查器确认前只称候选合法样例，不预先宣称通过：

```html
<section style="padding:12px;color:#333333"><p style="font-size:16px;line-height:1.8;margin:18px 0">今天沿着河边走了一会儿。</p></section>
```

- [x] 创建 `tests/fixtures/overlap.html`，使用多行文字且行高明显过小的故障样例：

```html
<section><p style="font-size:20px;line-height:1px">第一行<br>第二行<br>第三行</p></section>
```

- [x] 运行文档已声明的 `check <文件> --json`，先确认本地相对路径。保存真实 stdout、stderr 和退出码，判断已知故障是否被检出。以下路径以 CLI 目录为工作目录：

```bash
cd vendor/wechat-spec/cli
npm run check -- ../../../tests/fixtures/basic.html --json
npm run check -- ../../../tests/fixtures/overlap.html --json
cd ../../..
```

- [x] 检查输出是否混入 npm 日志；选择可稳定取得 JSON 的具体入口。必要时使用固定版本文档中的 tsx 入口，不按最后一行盲目解析。
- [x] 在报告中写明通过、失败或未执行；编译/环境失败不能通过换样例掩盖。只有合法样例和故障样例的行为可解释，才继续检查器集成。

**Validation:** 报告包含可重现的精确命令和真实输出摘要；无虚构提交号、未执行的勾选项或“100%兼容”结论。

**Commit:** `docs: record pinned upstream validation evidence`，只提交清单、文档和自写样例。

## Task 2: 建立自定义 HTML/CSS 处理与最小运行环境

**Files:** 创建 Next.js/TypeScript/Vitest 配置、`src/features/output/{contracts,inline,build-output}.ts`、`tests/output.test.ts`、`tests/fixtures/{styled-source.html,styled-source.css}`、`THIRD_PARTY_NOTICES.md`。保留 Task 1 的基准样例，避免改动其检测证据。

**Interfaces:**

```ts
export interface OutputArtifact {
  bodyHtml: string;
  plainText: string;
  htmlHash: string;
}
export type InlineResult =
  | { ok: true; html: string }
  | { ok: false; error: string };
export type Inliner = (html: string, css: string) => InlineResult;
export function buildOutput(
  html: string, css: string, inliner: Inliner
): OutputArtifact;
```

- [x] 确认现有 Node 支持选定 Next.js 稳定版本；手动创建最小项目配置，不使用会覆盖当前文档的脚手架选项。依赖安装后记录版本并提交 lockfile。
- [x] 建立脚本 `dev`、`build`、`start`、`typecheck`、`test`：分别为 `next dev --hostname 127.0.0.1`、`next build`、`next start --hostname 127.0.0.1`、`tsc --noEmit`、`vitest run`。
- [x] 在 `styled-source.html` 和 `styled-source.css` 创建自定义标题边框和正文留白样例，不使用上游默认主题：

```html
<section class="diary"><h2>周末记录</h2><p>今天沿着河边走了一会儿。</p></section>
```

```css
.diary { padding: 12px; color: #333333; }
.diary h2 { border-left: 3px solid #8a6f59; padding-left: 12px; font-size: 20px; }
.diary p { font-size: 16px; line-height: 1.8; margin: 18px 0; }
```

- [x] 先编写关键失败路径测试，再实现 `buildOutput`。最低测试内容：

```ts
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { buildOutput } from '../src/features/output/build-output';

it('内联失败时拒绝生成成功产物', () => {
  expect(() => buildOutput('<p>原文</p>', 'p{color:#333}',
    () => ({ ok: false, error: 'inlining failed' })))
    .toThrow('inlining failed');
});

it('可复制正文与用于检测的哈希保持绑定', () => {
  const result = buildOutput('<p>原文</p>', 'p{color:#333}',
    () => ({ ok: true, html: '<p style="color:#333">原文</p>' }));
  expect(result.plainText).toBe('原文');
  expect(result.bodyHtml).toContain('style=');
  expect(result.htmlHash).toBe(
    createHash('sha256').update(result.bodyHtml, 'utf8').digest('hex')
  );
});
```

- [x] 运行 `npm test -- tests/output.test.ts`，确认测试因接口未实现失败；实现清理、内联、文本提取与正文 SHA-256 后重跑。
- [x] 用 WeMD 的必要处理逻辑封装 `Inliner`，保留许可证和来源；若不能可靠识别其 catch 后的未内联结果，修改适配层明确抛错或直接使用 Juice。不能原样吞掉错误。
- [x] 增加实际样例集成断言：颜色、边框和留白进入内联样式；清理后无脚本/事件；原文字序列不变。标题与正文结构仍保留，不能仅比较含有文字就视为风格保留。

**Validation:** `npm run typecheck` 与 `npm test -- tests/output.test.ts` 通过；实际生成 HTML 保存于 artifacts；来源声明完整。

**Commit:** `feat: add deterministic html css output pipeline`。

## Task 3: 封装官方检查器并区分错误

**Files:** 创建 `src/features/validation/{run-checker,normalize-report}.ts`、`tests/checker.test.ts`、`scripts/check-upstream.mjs`。

**Interfaces:** `CheckReport` 使用设计文档的定义；检查入口固定为：

```ts
export interface CheckerConfig {
  executable: string;
  argsPrefix: string[];
  cwd: string;
  commit: string;
  timeoutMs: number;
}
export async function runChecker(
  htmlPath: string, htmlHash: string, config: CheckerConfig
): Promise<CheckReport>;
```

- [x] 以 Task 1 的真实 JSON 样例编写 `normalize-report` 测试，分别覆盖合法、违规、无效响应。保留原始规则编号，正常化后的字段不是上游原始字段。
- [x] 添加运行故障测试，使用不存在的可执行程序证明不会返回通过：

```ts
import { expect, it } from 'vitest';
import { runChecker } from '../src/features/validation/run-checker';

it('检查器不存在时返回 error 而不是 passed', async () => {
  const result = await runChecker('/tmp/kanvi-fixture.html', 'sample-hash', {
    executable: '/nonexistent/kanvi-checker', argsPrefix: [],
    cwd: process.cwd(), commit: 'test-only', timeoutMs: 1000,
  });
  expect(result.status).toBe('error');
});
```

- [x] 运行失败测试后实现子进程适配。使用 `spawn(executable, args, { shell: false })`；设置超时、输出大小上限和中止处理。输入文件由本地程序写入，不执行来自 HTML 的命令。
- [x] 根据真实退出码区分“发现违规”和“执行失败”，不得简单把所有非零退出码合并为一种情况。
- [x] 写入上游检测入口配置。`scripts/check-upstream.mjs` 读取清单，校验副本当前 commit 与记录一致；不一致则拒绝把结果标为原版本证据。
- [x] 用 Task 2 生成的最终正文和 Task 1 故障样例实际运行，报告必须绑定输入正文哈希。通过/故障/违规三类行为均应有证据。

**Validation:** `npm test -- tests/checker.test.ts` 和真实检查器样例运行通过；超时/启动失败不能落入 passed。

**Commit:** `feat: integrate local wechat structure checks`。

## Task 4: 最小预览与富文本复制页面

**Files:** 创建 `src/app/{layout,page}.tsx`、`src/app/api/preview/route.ts`、`src/components/{ArticlePreview,CopyArticleButton}.tsx`、`src/features/output/clipboard.ts`、`tests/clipboard.test.ts`。

**Interfaces:** `POST /api/preview` 本阶段只处理仓库固定样例，不接受任意用户 URL 或文件路径；响应为 `OutputArtifact` 与设计定义的 `CheckReport`。复制函数签名：

```ts
export function buildClipboardPayload(artifact: OutputArtifact): {
  html: string;
  text: string;
};
```

- [x] 先测试复制载荷来自最终产物，不重新渲染：

```ts
import { expect, it } from 'vitest';
import { buildClipboardPayload } from '../src/features/output/clipboard';

it('复制与预览共用最终正文', () => {
  const artifact = {
    bodyHtml: '<p style="color:#333">周末</p>',
    plainText: '周末', htmlHash: 'bound-to-this-output',
  };
  expect(buildClipboardPayload(artifact)).toEqual({
    html: artifact.bodyHtml, text: artifact.plainText,
  });
});
```

- [x] 实现接口顺序：读取固定样例 → `buildOutput` → 写 artifacts → `runChecker` → 返回同一份产物和报告。检查报告哈希不一致时不允许标为已检测。
- [x] 页面显示生成按钮、检查状态、手机宽度预览、复制按钮。预览采用不允许脚本执行的 iframe；应用控制按钮不进入复制正文。
- [x] 复制必须从用户点击触发，示意实现：

```ts
const payload = buildClipboardPayload(artifact);
await navigator.clipboard.write([new ClipboardItem({
  'text/html': new Blob([payload.html], { type: 'text/html' }),
  'text/plain': new Blob([payload.text], { type: 'text/plain' }),
})]);
```

- [x] 捕获 Clipboard API 不可用及拒绝权限，明确提示，不能把纯文本兜底显示为“带格式复制成功”。
- [ ] 在本地浏览器检查请求、预览、状态、窄屏和复制。用临时富文本粘贴区域验证载荷，不写入用户公众号账号。

**Validation:** `npm run typecheck`、`npm test`、`npm run build` 通过；浏览器实际验证富文本复制，并记录浏览器版本和结果。

**Commit:** `feat: add local preview and rich text copy proof`。

## Task 5: 实际验证交接与基础阶段结论

**Files:** 更新 `docs/validation/2026-09-13-foundation.md`、`docs/EXECUTION.md`、`README.md`。

- [x] 汇总实际运行的版本、命令、成功/失败样例、最终 HTML 哈希、复制行为与已知问题，不把测试名称当作结果。
- [x] 交付可以打开的本地样例页面和 HTML，说明用户验证步骤：复制 → 粘贴公众号 → 保存草稿 → 手机预览。
- [x] 若尚未取得用户实测结果，报告状态保持“程序检查完成，公众号实测待确认”；应用基础任务可以交接，但不得创建已验证模板记录。
- [ ] 用户确认后记录设备、日期、样例哈希和差异。出现样式差异时修改对应处理规则，重新生成并检查，不更换默认主题逃避问题。
- [x] 完整检查阶段 1 验收项后再更新路线进度，并据真实接口编写阶段 2 的具体计划。

**Commit:** `docs: record foundation validation and next stage inputs`。

## 自审与实施记录

- [x] 本计划范围限于基础链路，AI、参考采集、模板状态和全文生成归属后续阶段。
- [x] 计划路径、应用契约与上游 API 分开；第三方 JSON 和退出码由 Task 1 实证决定。
- [x] 密钥、真实日记、上游工作副本与测试输出不进入 Git。
- [x] 内联失败、检查器故障和复制失败均有明确状态。
- [x] 程序检查通过不等于公众号实测通过。
- [x] Task 1 执行完成。
- [x] Task 2 执行完成。
- [x] Task 3 执行完成。
- [x] Task 4：实现与自动化测试完成；浏览器模拟按用户要求跳过。
- [x] Task 5：报告与后续计划已交付；公众号实测按用户要求不纳入本次验收。

自审勾选项只表示计划已覆盖相应问题，不表示应用测试已运行。

2026-09-14：15 项测试、类型检查、生产构建与真实引擎集成通过。桌面与 390px 应用视口已检查；Clipboard API 写入成功，但自动化虚拟剪贴板无法确认系统粘贴。详见 [运行记录](../../validation/2026-09-13-foundation.md)。

用户范围调整：本次只执行写代码与自动化功能测试。计划中涉及浏览器模拟、系统粘贴和公众号实测的未勾选步骤明确跳过，不再作为完成条件；不得据此建立 verified 模板。
