# 第七阶段：gzh-beautify 主题 skill 与 AI 直出 HTML

日期：2026-09-24。状态：待实施，尚未写任何实现代码。实施前先读 [设计基线](../specs/2026-09-13-kanvi-design.md)、[第四阶段报告](../../validation/2026-09-15-markdown-rendering.md) 与本文。主代理实施，子代理仅探索和核验。

## 背景与已确认的决策

2026-09-24 用户决定调整主路径：

1. 不再以“参考链接 → 设计分析 → 模板工作台”作为取风格的方式，不从别人的文章模板入手。
2. 风格改用 **gzh-beautify skill**：skill 固定一组主题模式，集中存放在本地库，并在本地 web 展示。
3. 流程：CLI 给一份本地 Markdown → 服务端调用 AI（使用该 skill）→ **AI 直接输出 HTML** → 程序校验/清洗 → 规格检查 → 通过后复制。
4. 来源记录用 tagged union 区分来源，不伪造字段。
5. 主题库“两者都要”：先把上游 6 套示例主题复制为**种子库**（标注 MIT 来源），同时支持按 brief 用主题工厂**生产新主题入库**。
6. 工厂产出的主题必须**逐个确认气质后才入库**：先出草案，用户看过预览再决定入库或丢弃。
7. 主题库需要**删除功能**（种子与自有主题都能删）；删除不自动提交 Git，用户自行提交。
8. Markdown 内容范围：**按 skill 契约全量支持**（图片、GIF、代码块、表格、待补占位）。
9. 现有参考与模板链路 **冻结保留**：不删除、不演进、不改行为，其测试与验证报告继续作为历史证据。

## 上游固定版本

- 仓库：https://github.com/TwinWrite/gzh-beautify-skill
- commit：`9accaf5039f29aade5d8ca315739b42845b11225`（2026-08-29）
- 许可：MIT，Copyright (c) 2026 TwinWrite
- 接入方式照搬现有 `wechat-spec` 模式：`docs/upstream-lock.json` 增加条目；`vendor/gzh-beautify-skill` 由 `npm run setup:checker` 克隆到固定 commit（`vendor/` 不提交）；`npm run check:upstream` 校验版本、未记录修改与未记录文件。
- 复制进 Kanvi 的主题包属于“substantial portions”，必须在 `THIRD_PARTY_NOTICES.md` 增加 TwinWrite 的 MIT 声明并保留每个包内的 `SOURCE.md`。

## 本次已完成的核查（2026-09-24，临时克隆，未进入仓库）

| 核查项 | 结果 |
|---|---|
| `python3 scripts/lint_theme.py examples/themes/moss-zen` | Python 3.9.6 可运行，ERROR×0 WARN×0 |
| `python3 scripts/validate_article.py --strict scripts/testdata/valid_article.html` | 通过（该文件含 4 处 `span[leaf]`） |
| 6 套示例主题复制到临时库并加 `SOURCE.md` 后整库 lint | 6/6 OK，ERROR×0 WARN×0，种子体积约 244 KB |
| skill 形态产物（`span[leaf]` + 居中衬线 + `border-bottom` 下划线 + 1px 细线 + 14–22px 字号）过官方 wechat-spec 检查器 | `isValid: true`，零违规 |
| 同一产物含 `<strong>` 强调 | `isValid: true`，零违规（未触发行距误报） |
| 现有 `buildOutput` 清洗 skill 产物 | **`leaf` 属性被剥离**（`allowedAttributes` 未含 `leaf`），不能直接复用 |

结论：上游校验脚本无需 Python 3.10+；主题包与官方检查器兼容；但 Kanvi 侧必须为这条链路准备**独立**的清洗/校验配置，不复用模板链路的 `build-output.ts` 白名单。

## 与现有链路的关系

复用（不改行为）：`validation/run-checker.ts` + `normalize-report.ts` + `config.ts`（官方检查器子进程、超时、哈希绑定、错误处理）、`output/document.ts`、`output/clipboard.ts`、`validation/local-request.ts`、`shared/io.ts` 的请求与错误约定、`references/repository.ts` 的 `publishRecord` 原子写入、`ai/client.ts`、`ArticlePreview`、`CopyArticleButton`、`scripts/check-upstream.mjs` 的固定上游机制。

新建：主题库读取与契约校验、上游 lint/validate 的 Python 子进程适配、主题工厂与草案流程、主题删除、渲染内核、渲染记录仓库、CLI、`/styles` 界面、测试与验证脚本。

不改：`/references`、`/templates`、`/generate` 及其 features、测试与验证报告（冻结）。

硬约束（每条都要机器校验，不能只写在提示词里）：

- 渲染产物只从已入库主题包的 `THEME.md` 槽位装配，不允许即兴发明 markup，也不允许一次性的未入库样式。
- 原文不改写：生成正文本的可见文字、顺序、块位置必须与 Markdown 解析结果逐块一致，不一致拒绝保存。
- AI 输出只是数据：`<script>`、事件属性、`javascript:`/`data:html` URL、上游 `FORBIDDEN_TAGS` 命中的标签一律报错，不静默删除后声称成功。
- 检查器或校验脚本缺失、超时、报错、哈希不一致时状态为**检测失败**，不得显示通过。
- 主题删除只移除主题包本身，不删除渲染历史；历史记录自带主题内容快照，删除后仍可读、可复现校验。
- 规则检测通过只表示该产物在固定检查器与固定 skill 版本下未报告问题，不等于公众号实测通过。

## 架构

```text
themes/<id>/{theme.json, THEME.md, preview.html}     ← 种子 6 套 + 已确认的工厂主题（提交 Git）
data/theme-drafts/<draftId>/                         ← 工厂草案，待确认（不提交）
vendor/gzh-beautify-skill/                           ← 固定 commit，不提交

CLI (scripts/render-theme.ts) ─┐
CLI (scripts/make-theme.ts, confirm-theme.ts, seed-themes.ts) ─┤
web (/styles, /api/themes/*) ────────────────────────────────┘
        │
        ├─ 主题入库：草案 → 预览 + lint → 用户确认 → themes/<id>/（重跑 lint，已存在则拒绝）
        ├─ 主题删除：/api/themes/<id>（二次确认）→ 移除主题包；种子可由 seed 脚本恢复
        └─ 文章渲染：Markdown + themeId → AI 按 THEME.md 填槽 → 干净正文 HTML
                      → validate_article.py --strict（0 ERROR/0 WARN）
                      → Kanvi 侧保真与绑定校验 + 官方检查器（真实 Chrome）
                      → data/renders/<uuid>/ + artifacts/
```

四条工作流：

1. **种子入库**：复制上游 `examples/themes/*` 到 `themes/*`，加 `SOURCE.md`，逐包跑 lint 并记录结果。种子被删除后可重跑 seed 脚本恢复。
2. **主题工厂（两阶段）**：CLI/web 给 brief（文字描述，参考图不在本轮范围）→ AI 按 `references/theme-factory.md` 产出 `theme.json`/`THEME.md`/`preview.html` → 写入 `data/theme-drafts/<draftId>/` 并跑 lint → 用户在 web 预览气质后确认，或丢弃。
3. **确认入库**：重跑 lint（草案可能被手改）→ 0 ERROR/0 WARN 且 `themes/<themeId>` 不存在时原子移动入库，并记录来源、模型、提示词版本、时间。
4. **文章渲染**：CLI 或 web 选主题 + 给 Markdown → AI 按 `references/render-contract.md` 填槽 → 双校验 → 通过后可复制/下载。

## 检查权威与“通过”的定义

两个检查器分工，**都通过**才算规格检查通过：

| 检查 | 覆盖 | 来源 |
|---|---|---|
| `validate_article.py --strict` | 可粘贴结构、平台红线、`span[leaf]` 包裹、全角标点、未替换占位、`class`/`id`、677px 根宽、字号 ≤24px | 上游 skill，子进程调用固定版本 |
| `wechat-spec` 官方检查器 | 排版规则（行距、字号等），真实 Chrome 运行 | 现有 `runChecker`，固定 commit |

上游规则**不复制**进 Kanvi，一律子进程调用，避免规则双份漂移。Kanvi 侧只做上游不覆盖的部分：AI 响应契约、原文保真、记录与哈希绑定。

## Task 1：上游固定与种子主题库

- [ ] `docs/upstream-lock.json` 增加 `gzh-beautify-skill` 条目（url、license、commit）；确认 `npm run setup:checker` 能克隆、`npm run check:upstream` 能校验（现有脚本按 lock 遍历，无需为此改逻辑）。
- [ ] 处理影响面：`checkerConfig()` 会调用 `checkUpstream()`，而它遍历 lock 里**所有**项目；`vendor/gzh-beautify-skill` 缺失时，现有检测链路会整体失败。实施时需让“未安装 skill”只影响主题链路并给出 `npm run setup:checker` 指引，或在校验脚本里区分“未安装”与“版本不符”；用测试固定该行为。
- [ ] `THIRD_PARTY_NOTICES.md` 增加 TwinWrite MIT 声明与本项目复制示例主题的说明。
- [ ] 复制上游 6 套示例主题到 `themes/`（`mist-masthead`、`step-workshop`、`paper-journal`、`cinnabar-catalog`、`graphite-editorial`、`moss-zen`），不改其内容，每包加 `SOURCE.md`（上游 URL、commit、许可、复制日期）。
- [ ] `scripts/seed-themes.mjs` + `npm run theme:seed`：按 `upstream-lock.json` 的 commit 从 `vendor/gzh-beautify-skill/examples/themes/` 复制缺失的种子主题；已存在的目录不覆盖；vendor 缺失时给出 `npm run setup:checker` 指引。这是种子主题删除后的恢复路径。
- [ ] 记录实测：整库 `lint_theme.py` 0 ERROR/0 WARN，把命令与结果写入本阶段验证报告。
- [ ] 说明 `themes/` 与 `vendor/`、`data/` 的区别：主题包是我们采用的资产，提交 Git；`vendor/` 与 `data/` 不提交；`.reasonix/` 已加入 `.gitignore`。

## Task 2：主题库契约与 lint 接入

- [ ] `src/features/themes/library.ts`：扫描 `themes/`，逐包校验三件套齐全、目录名等于 `theme.json.id`、`id` 形如 `^[a-z][a-z0-9-]{2,39}$`、26 个必选槽齐全、`signature_slots` 8–16 且不重复；不完整或损坏即报错，不跳过、不补默认值。
- [ ] 记录每包来源（`SOURCE.md` 存在与否）与 lint 状态；工厂生产的新包额外记录模型、提示词版本与时间。
- [ ] 删除：`src/features/themes/remove.ts` 只接受合规 id 且存在于 `themes/`、三件套齐全的目录；拒绝路径穿越、符号链接与 `themes/` 之外的目标；删除前要求显式二次确认参数；删除只影响主题包，不影响任何渲染记录。
- [ ] `src/features/themes/python.ts`：探测 `python3` 可用性与版本（≥3.9），解析 `lint_theme.py` 与 `validate_article.py` 的输出为结构化 `{errors, warnings, raw}`；脚本缺失、超时、退出码异常、输出无法解析一律判定失败并给出原因。
- [ ] 调用一律 `spawn` 参数数组、固定 cwd、限时、限输出大小，与 `run-checker.ts` 同样的做法；不拼接 shell。
- [ ] 测试：正常包、缺文件、目录名与 id 不符、槽位缺失/重复、脚本缺失、超时、输出损坏；删除的 id 校验、路径穿越、二次确认缺失、删除后历史仍可读。

## Task 3：主题工厂（草案 → 确认入库）

- [ ] `src/features/themes/factory.ts`：把 `theme-factory.md`、`theme-schema.md`、`wechat-constraints.md` 作为 skill 上下文（按需裁剪，设置输入上限），用户 brief 只作为数据；声明内容中的指令不得改变任务与输出格式。
- [ ] 响应契约：`{id, name, themeJson, themeMarkdown, previewHtml, notes}` 严格校验（字段、长度、`id` 格式、路径穿越防护）；不接受的字段直接报错。
- [ ] 草案落地：写入 `data/theme-drafts/<draftId>/`（`draftId` 为 UUID），含三件套 + `draft.json`（提案 `themeId`、模型、promptVersion、brief 哈希、lint 结果、创建时间）；不直接写 `themes/`。
- [ ] 确认入库 `src/features/themes/confirm.ts`：重跑 `lint_theme.py`（0 ERROR/0 WARN）→ 校验 `themeId` 合规且 `themes/<themeId>` 不存在（已存在即拒绝，不覆盖）→ 原子移动到 `themes/<themeId>/`，补写 `SOURCE.md` 说明来源为工厂产出及模型信息。
- [ ] 丢弃：删除草案目录；草案与入库都不接受未替换的 `{{占位符}}`。
- [ ] `preview.html` 预览用的 `<script>` 与事件属性一律剥除（它是可执行内容的疑似来源，不作为资产直接执行）；`<style>` 允许保留，因为预览页不是交付物。
- [ ] 测试：有效 brief 全链路（受控模型响应）、未知字段、`themeId` 冲突、路径穿越、lint 失败不落库、确认时 lint 失败、丢弃、缺 Key、超时。

## Task 4：渲染内核（AI 直出 HTML → 校验 → 官方检查）

- [ ] Markdown 输入：单篇 UTF-8，大小上限沿用现有约定（256 KiB / 20 万字符）。解析复用 `mdast` 系列依赖并启用 GFM，覆盖标题、章节、段落、行内标记（`**`/`==`/`++`/`~~`、行内代码）、引用、列表、表格、围栏代码、图片/GIF、`【插入…】` 占位、分隔线。
- [ ] 图片：按 `image`/`image_gif`/`media_ph` 槽渲染，`src` 只用原文给出的值，**不编造图床 URL**；相对路径给出“需在公众号内重新上传”的明确提示；本轮不实现图片上传。
- [ ] `src/features/themes/prompt.ts`：把选中主题的 `THEME.md` + `theme.json` + `render-contract.md` + `wechat-constraints.md` 组装为系统提示词，记录 `promptVersion` 与 skill 版本（vendor commit + 选中主题的 `theme.json` 哈希）。
- [ ] `src/features/themes/render-article.ts`：调用 `completeJson`（需要 `maxTokens` 可配，现有默认 6000 对大正文偏小；`inputLimit` 一并参数化，默认值保持不变以免影响既有分析）；响应契约 `{html, notes}`，HTML 非空、长度上限、无 `<html>/<head>/<body>`、从单一顶层 `<section>` 起。
- [ ] `src/features/themes/verify-article.ts`：`validate_article.py --strict` 子进程校验（0 ERROR / 0 WARN 才通过）+ Kanvi 侧独立门禁：
  - 原文保真：与 Markdown 解析结果逐块比对文字（折叠空白后相等）、顺序、块数，禁止 Markdown 语法残留（`**`、`#`、`[[`）。
  - 绑定：产物哈希、主题 id 与版本、skill 版本、检查器版本全部写入记录，读取时复算校验。
- [ ] 官方检查器：把产物写临时文件后走现有 `runChecker`，按 `checkedReport` 的等价方式校验报告与哈希绑定；失败状态为 `error`。
- [ ] `src/features/themes/repository.ts`：`data/renders/<uuid>/record.json`（不可变：markdown、解析结果、themeId、**主题三件套中的 `theme.json` 与 `THEME.md` 内容快照及哈希**、skill 版本、model、promptVersion、inputHash、rawOutputHash、产物、两份校验报告）+ `result/report.json`；读取时复算校验，损坏记录报错不隐藏；列表分页与上限照现有仓库做法。快照是“删除主题后历史仍可读”的前提。
- [ ] 说明并实测 `hasInlineFragments` 的告警在本链路的适用性：skill 产物普遍含 `span[leaf]`，该判定可能把普通行距违规也标成“疑似误报”；结论写入验证报告，必要时为新链路单独定义判定，**不改**冻结链路的实现。
- [ ] 测试（受控模型响应）：有效响应全链路；缺字段/多余字段；危险结构与可执行 URL；`FORBIDDEN_TAGS`；未替换占位符；原文被改写、丢块、换序、Markdown 残留；超限输入；缺 Key；超时；取消；lint 失败；`validate_article` 失败；官方检查器故障；报告哈希不匹配。断言失败路径不落盘为“通过”。

## Task 5：CLI 与本地 web

- [ ] `npm run theme:render -- --theme <id> --input <file.md>`：tsx 脚本直接调用 Task 4 内核，不依赖 dev server；写出干净正文与预览页到 `artifacts/renders/<id>/`，stdout 打印 JSON 摘要（主题、状态、两份校验结果、路径）。
- [ ] `npm run theme:make -- --brief <file.md>`：走 Task 3 工厂，只产出草案并打印草案路径与 lint 结果，不入库。
- [ ] `npm run theme:confirm -- --draft <draftId> [--discard]`：确认入库或丢弃草案；无参数时列出待确认草案。
- [ ] `npm run theme:remove -- --id <id> --confirm <id>`：删除主题包；种子主题提示可用 `npm run theme:seed` 恢复，自有主题提示不可恢复。
- [ ] 退出码：通过/成功 → 0；校验发现违规或需要人工处理 → 1；错误或检查器/脚本故障 → 2。
- [ ] `/styles`：主题库画廊，逐包展示名称、气质标签、结构模型、来源（种子/生成）、lint 状态，并用 `preview.html` 做受限预览（剥 script 与事件属性，CSP 同现有约定）。
- [ ] 主题工厂区：输入 brief → 生成草案 → 展示 lint 结果与 `preview.html` 预览 → 确认入库或丢弃。
- [ ] 删除：每个主题包提供删除入口，需二次确认；种子主题的提示里给出恢复命令；删除成功后刷新列表，历史记录不受影响。
- [ ] 生成区：选主题 + 上传或粘贴 Markdown → “生成并检查” → 预览、诊断（两份校验的问题分列）、通过后复制与下载、本地历史列表。
- [ ] API：`GET /api/themes`（含草案与 lint 状态）、`POST /api/themes/render`、`POST /api/themes/drafts`、`POST /api/themes/drafts/<id>/confirm`、`DELETE /api/themes/<id>`（`isLocalRequest`、请求体上限、单任务 busy 锁、可取消）。
- [ ] 未配置 Key 时仍可浏览主题库、草案与历史，不显示伪造结果。
- [ ] 测试：接口契约、非本机请求拒绝、busy、超限请求体、未配置 Key、确认/丢弃、删除的二次确认与历史可读、损坏记录行为。

## Task 6：验证与交付

- [ ] `scripts/verify-themes.ts` + `npm run verify:themes`：自写 Markdown + 受控模型响应，跑真实 `lint_theme.py`、真实 `validate_article.py --strict` 与真实官方检查器，产出事实报告（主题、状态、两份校验、产物路径与哈希）。
- [ ] `npm run typecheck`、`npm test`、`npm run build` 与现有 `verify:integration|templates|articles` 全部通过；冻结链路的行为与测试数不因本阶段变化。
- [ ] 事实记录区分：受控模型响应、真实上游脚本、真实官方检查器、真实 DeepSeek 调用、公众号实测各自的状态；未执行就写明未执行。
- [ ] 更新 README、设计基线（第 1、3、4 节的新主路径）、[执行路线](../../EXECUTION.md) 与本阶段验证报告；提交并推送已授权私有 GitHub，开发数据与密钥不进入 Git。

## 失败处理与验收证据

| 失败 | 产品行为 | 保存证据 |
|---|---|---|
| Python 或 skill 脚本缺失 | 明确报出缺失项与安装方式，不显示通过 | 探测结果、脚本路径 |
| `lint_theme.py` 失败（工厂） | 不写入 `themes/`，草案保留在 `data/theme-drafts/` 供检查 | lint 输出、草案路径 |
| 确认入库时 `themeId` 已存在 | 拒绝覆盖，保留草案 | 草案 id 与冲突的目录 |
| `validate_article.py --strict` 有 ERROR/WARN | 列为需修正，不启用复制 | 规则列出、产物哈希 |
| 官方检查器故障或哈希不一致 | 显示检测失败，不等同于零违规 | 退出码、脱敏日志、检查器版本 |
| 模型响应无效或含危险结构 | 拒绝结果并说明原因，可重试 | 脱敏错误、`rawOutputHash`，不保存 Key |
| 原文被改写或增删 | 阻止保存并列出差异块 | Markdown 指纹、差异块 |
| 图片为本地相对路径 | 产出可用但提示需在公众号内重新上传 | 图片槽与原始路径 |
| 删除主题 | 只删主题包并需二次确认；历史仍可读 | 被删 id、删除时间、是否有渲染记录 |

## 完成标准

1. CLI 与 web 共用同一内核：本地 Markdown + 已入库主题 → 干净正文 HTML，两份校验通过后可复制或下载。
2. 主题库同时具备种子 6 套与工厂产出的自有主题；工厂主题必须经逐个确认才入库，草案可丢弃。
3. 主题库可删除任一主题包（二次确认），删除后渲染历史仍可读、可复现校验；种子可由 `npm run theme:seed` 恢复。
4. 原文文字与顺序逐块一致；危险结构、可执行 URL、禁标签、未替换占位在入口被拒。
5. 任一校验失败或故障时不显示通过；历史重启后可读，损坏记录可见。
6. 无 Key 时主题库与历史可用；AI 失败不影响已有记录。
7. 冻结的参考/模板链路代码、测试与报告保持原样。

## 已确认的边界

1. 工厂主题逐个确认气质后入库；确认时重跑 lint。（2026-09-24 用户确认）
2. 工厂产出的主题包随 Git 提交，作为项目资产。（同上）
3. 种子主题按上游 MIT 示例复制为初始库并标注来源，同时提供删除与恢复。（同上）
4. 图片只做“不编造 URL + 提示重新上传”；需要本地图片转公众号素材时另开阶段。（同上）
5. 冻结链路本阶段不删除；若要移除，另开清理阶段并单独授权。（同上）
6. `.reasonix/` 已加入 `.gitignore`。（同上）

## 实施记录（2026-09-24）

实现与本文的差异与补充：

1. **草案目录名用主题 id**，不用 UUID：上游 `lint_theme.py` 会校验“目录名与 `theme.json` 的 id 一致”，所以草案落在 `data/theme-drafts/<主题id>/`；同一 id 已有草案时拒绝覆盖，需先确认或丢弃。
2. **工厂分两次模型调用**：先产出 `theme.json` + `THEME.md`，再据其产出 `preview.html`。理由是单次输出预算（8000 tokens）不足以稳定覆盖三件套（种子包 THEME.md 约 15 KB、preview.html 约 17 KB）。
3. **原文保真按句子级片段匹配**，不按整块文本：主题骨架会合法地插入章节编号、目录与英文标签，整块匹配会误判；片段级匹配仍能拦住改写、丢段与换序。`added` 字段把结构性新增单独列出来供人工核对。
4. **主题包额外带 `SOURCE.json` / `SOURCE.md`**：`SOURCE.json` 是机器可读的来源记录（seed/generated 两类，含上游 commit 或许可），`SOURCE.md` 供人阅读。
5. **`upstream-lock.json` 增加 `required` 字段**：gzh-beautify-skill 标记为 `required:false`，未安装时不影响既有检查链路，只影响主题链路并给出 `npm run setup:checker` 指引。
6. **删除入口用 `DELETE /api/themes/<id>?confirm=<id>`** 与 `theme:remove --id … --confirm …`，不新增独立路由段。
7. 新增 `theme:seed`（种子恢复）、`theme:render`、`theme:make`、`theme:confirm`、`theme:remove` 与 `verify:themes`；`verify:themes` 的模型响应是受控 fixture。
8. 结果与边界见 [第七阶段验证报告](../../validation/2026-09-24-theme-skill.md)。
