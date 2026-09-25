# Kanvi 完整执行路线

日期：2026-09-13。本文是全项目路线；阶段 1 另有可逐项执行的实施计划。后续阶段进入实施前，应按已验证的接口补充对应阶段计划，避免现在凭空指定上游 API。

## 当前状态

- [x] 确认需求与本地运行范围。
- [x] 编写设计、执行路线和第一阶段计划。
- [x] 阶段 1：基础代码、自动化功能测试、真实检查器集成与生产构建完成。按用户最新要求，公众号实测与浏览器模拟不纳入本次验收。
- [x] 阶段 2：参考文章读取与设计分析代码完成；受控功能测试通过，真实链接/API 调用未验证。
- [x] 阶段 3：模板语法、语义样式映射、版本库、样例检测、受限修正与工作台完成；复杂布局自动重建未实现，上游行距误报保留。
- [x] 阶段 4：Markdown/Obsidian 受限转换、手选套版、本篇检测与历史已实现，语法边界见验证报告。
- [ ] 阶段 5：实现 AI 模板匹配（2026-09-24 因取消模板主路径而冻结，不再推进；计划文档保留为历史记录）。
- [x] 阶段 6：完成本地产品界面与交付（模板页相关条目已由阶段 7 取代；本地数据路径展示与主题/历史备份恢复已补齐）。
- [x] 阶段 7：gzh-beautify 主题 skill 与 AI 直出 HTML（2026-09-24 确定的当前主路径，代码、自动测试、集成验证与文档已完成）。

阶段 1 已按调整后的代码与自动化测试范围完成，具体见 [验证报告](validation/2026-09-13-foundation.md)。阶段 2–4 代码已实现并被冻结保留；阶段 5 不再推进；阶段 7 已实现并通过受控集成验证，最新证据及限制见 [第七阶段报告](validation/2026-09-24-theme-skill.md)。继续工作前先读 [设计基线](superpowers/specs/2026-09-13-kanvi-design.md) 和 [第七阶段计划](superpowers/plans/2026-09-24-theme-skill-rendering.md)。

## 阶段 1：验证输出、检查和复制链路

**目的：** 不接 AI、不抓文章，先用自写 HTML/CSS 验证核心路径。

**交付：** 固定上游版本；合法样例及故障样例；处理适配器；官方检查适配器；简单预览/复制页；事实化验证报告。

**验收：** 内联处理保留原文和自定义布局；检测器识别预期问题，进程故障不判通过；浏览器能复制富文本；用户实际粘贴验证记录与程序检查分开。

**决策：** WeMD 可独立使用则复用必要核心；不适合时采用 Juice 加具名适配规则。检查器运行失败时报告具体障碍，不用第三方主题替代官方检测。

## 阶段 2：参考读取与设计分析

具体实施计划：[参考读取与设计分析](superpowers/plans/2026-09-14-reference-analysis.md)。

**实现文件：** `src/features/references/{fetch-reference,extract-article,contracts}.ts`、`src/features/ai/{client,design-analysis}.ts`、`src/app/api/references/route.ts`。

- [x] 以自写 HTML 建立正文提取样例，覆盖无正文、验证码、重定向、超时和大小限制。
- [x] 完成来源读取、正文区域提取和来源快照；对外部 URL 逐次校验。
- [x] 定义设计分析 schema：文本样式、区域结构、标签、证据位置、估计项和不支持元素。
- [x] 用固定模型响应验证 schema，拒绝额外脚本、无证据结构和无效颜色/尺寸。
- [x] 接入本地服务端 DeepSeek 请求；仅用户选择内容可发送，密钥不进入客户端。
- [ ] 真实公众号链接和真实 DeepSeek 调用：用户尚未提供测试来源与配置，本次未执行。

**验收：** 分析结果可以回溯至来源；失败清晰可见；模型未配置时仍可查看已读取参考。截图通道不在本阶段范围。自动测试记录见 [第二阶段报告](validation/2026-09-15-reference-analysis.md)。

## 阶段 3：模板、样例、检查和修正

具体计划：[模板生成与样例检测](superpowers/plans/2026-09-15-template-rendering.md)。

**实现文件：** `src/features/templates/{schema,from-analysis,render,repository,repair,workflow,handlers}.ts`、`src/app/api/templates/`、`src/app/templates/`、`src/components/TemplateWorkspace.tsx`。

- [x] 定义声明式模板结构及版本数据，包含可重复、可省略和支持的内容类型。
- [x] 渲染时转义文字，禁止模板执行 JavaScript；测试长标题、空引用和多段重复。
- [x] 实现本地原子写入与不可变版本，新版本不继承旧版本的实际验证状态。
- [x] 生成覆盖模板元素的样例，调用阶段 1 的检查器。
- [x] 程序修正只处理明确规则；AI 返回受限补丁，最多两轮；修正前后比较文字完整性。
- [x] 规则通过状态绑定版本、样例哈希和检查器版本；公众号实测登记不在当前范围。
- [x] 完成第一套规则检测通过的模板，保留修正历史和最终样例。

**验收：** 样例规则检测通过后模板可复用；失败或未检测模板不可参与自动匹配。不执行公众号实测或浏览器交互模拟，不承诺完整平台兼容。

## 阶段 4：Markdown 原文保真套版

具体计划：[Markdown 原文保真套版](superpowers/plans/2026-09-15-markdown-rendering.md)。

**实现文件：** `src/features/articles/{parse-markdown,eligibility,workflow,repository,handlers}.ts`、`src/app/api/articles/`、`src/app/generate/`、`src/components/ArticleWorkspace.tsx`。保真渲染复用 `src/features/templates/render.ts`。

- [x] 将 Markdown 转为带 ID 和源位置的内容块，覆盖标题、段落、引用、列表、强调、分隔线。
- [x] 明确属性区、双链、提示块的转换；未支持的嵌入/脚注列出诊断，不删除后继续显示成功。
- [x] 检查模板结构适配性，再从原文读取内容填充模板。
- [x] 对两篇长短和结构不同的自写日记验证无新增、无遗漏、无重复、顺序正确。
- [x] 运行本篇布局检测并展示结果；保存同一份最终正文用于预览、导出和复制。

**验收：** 手动选择规则检测通过的模板可完整生成文章，不依赖 AI；模板不支持的结构有明确处理入口。

## 阶段 5：AI 模板推荐（已冻结）

> 2026-09-24：用户取消以模板为主路径的做法，本阶段不再推进。以下条目与计划文档保留为历史记录，不标记为完成。

具体计划：[AI 模板推荐](superpowers/plans/2026-09-15-template-recommendation.md)。

**计划文件：** `src/features/templates/{eligibility,recommend}.ts`、`src/features/ai/template-recommendation.ts`。

- [ ] 准备至少三套规则检测通过的纯文字模板及区别明显的设计标签。
- [ ] 用结构硬条件筛选候选，再发送文章必要信息和候选设计描述。
- [ ] 校验推荐只能引用候选中的模板 ID 和版本，返回主推荐、备选及原因。
- [ ] 覆盖无候选、模型超时、无效 JSON、未知 ID、重复备选等失败情况。
- [ ] 保留用户手动选择路径；没有 AI 不影响已有模板渲染。

**验收：** 不会推荐未通过规则检测或结构不适配模板；不为模仿风格而改写日记。

## 阶段 6：本地界面与交付（范围已由阶段 7 取代）

> 阶段 7 已完成主题 skill 界面与交付检查；下列“模板页/推荐模板”条目不再实施。本地数据路径展示与历史备份/恢复已在 2026-09-24 补齐（`/styles` 侧栏 + `theme:backup`/`theme:restore` + `GET|POST /api/backup`）。

**计划文件：** `src/app/{page,layout}.tsx`、`src/features/storage/`、`README.md`。

- [x] 主题页（`/styles`）：主题库列表与预览、草案确认、删除、渲染历史。（阶段 7 完成）
- [x] 生成入口：导入 Markdown、选择主题、预览、复制、下载和历史。（阶段 7 完成）
- [x] 显示本地数据路径，实现备份/恢复主题及历史；导出不含密钥。（主题库、草案、渲染历史与应用路径显示在 `/styles`；`theme:backup`/`theme:restore` 与 `/api/backup` 导出含指纹的 JSON 备份并只做新增式恢复，导出前断言不含本机 Key）
- [x] 验证重启后数据存在，权限/磁盘写入失败可理解，不显示误导性保存成功。（阶段 7 覆盖渲染记录与主题库）
- [x] 运行类型检查、相关行为测试、生产构建和服务端接口集成测试（不做浏览器交互模拟）。（阶段 7 完成）
- [x] 更新启动方法、依赖版本、验证边界、已知限制和第三方许可证说明。（阶段 7 完成）

**验收：** 一个新用户能按 README 本地启动并完成主流程。无自动发布、云账号系统和完整富文本编辑器。

## 阶段 7：gzh-beautify 主题 skill 与 AI 直出 HTML

具体计划：[主题 skill 与 AI 直出 HTML](superpowers/plans/2026-09-24-theme-skill-rendering.md)。验证报告：[第七阶段报告](validation/2026-09-24-theme-skill.md)。

固定上游：https://github.com/TwinWrite/gzh-beautify-skill，commit `9accaf5039f29aade5d8ca315739b42845b11225`，MIT（Copyright (c) 2026 TwinWrite）。按现有 `wechat-spec` 模式记入 `docs/upstream-lock.json`，`vendor/` 不提交。

**实现文件：** `themes/<id>/`、`src/features/themes/{article,library,remove,python,factory,confirm,skill-context,prompt,render-article,verify-article,repository,handlers}.ts`、`src/app/styles/`、`src/components/ThemeWorkspace.tsx`、`scripts/{render-theme,make-theme,confirm-theme,remove-theme,seed-themes,verify-themes}.ts`、`.gitignore`。

- [x] 固定上游版本，复制 6 套示例主题为种子库并标注 MIT 来源；提供 `theme:seed` 作为种子删除后的恢复路径。
- [x] 主题库契约校验、`lint_theme.py` 子进程接入（0 ERROR / 0 WARN）与主题删除（二次确认，不影响渲染历史）。
- [x] 主题工厂按 brief 生产草案，lint 通过后进入待确认状态；用户逐个确认气质后重跑 lint 才入库，可丢弃。
- [x] 渲染内核：Markdown + 主题 → AI 按 `THEME.md` 填槽产出干净正文 HTML，`validate_article.py --strict` 与官方检查器双校验，原文按句子片段逐块保真；记录保存主题内容快照，删除主题后历史仍可读。
- [x] CLI 与 `/styles` 界面：主题库画廊、工厂草案确认、删除、生成、历史、通过后复制与下载。
- [x] 受控自动化测试、双校验集成验证与事实报告。

**实际执行（2026-09-24）：** 6 套种子主题整库 lint 0 ERROR / 0 WARN；`npm run verify:themes` 用自写 Markdown + 受控模型响应 + 真实上游脚本 + 真实官方检查器跑通“渲染 → 双校验 → 原文保真 → 工厂确认入库 → 丢弃 → 重启读取”；`npm test` 149 项、`npm run typecheck`、`npm run build`、`npm run check:upstream` 全部通过。**未执行**真实 DeepSeek 调用与公众号实测，不声明实测结论。

**验收：** 自写 Markdown + 已入库主题可产出通过双校验的正文并复制；工厂主题必须经逐个确认才能入库；主题可删除且删除后历史仍可读、种子可恢复；危险结构与改写原文被拒；任一校验失败或故障不显示通过；冻结的参考/模板链路保持原样。公众号实测不纳入本阶段范围。

## 失败处理与验收证据

| 失败 | 产品行为 | 保存证据 |
|---|---|---|
| 公众号读取失败 | 保留链接和错误，提供 HTML 备用入口 | 错误类型、时间、阶段 |
| 模型响应无效 | 拒绝无效结果，可重试或手选模板 | 脱敏错误，不保存 Key |
| 内联失败 | 阻止标为适配完成 | 模板版本、输入哈希、错误 |
| 检查器故障 | 显示检测失败，不等同于零违规 | 退出码、脱敏日志、版本 |
| 两轮后仍有问题 | 保留待调整状态 | 前后差异及剩余规则 |
| 实际粘贴变化 | 修改模板新版本并重测 | 截图、设备和样例哈希 |
| 不支持的 Markdown | 定位原文，要求明确处理 | 内容类型、源位置 |
| 主题 lint 未通过（草案） | 草案留在 `data/theme-drafts/` 待检查，不入库 | lint 输出、草案路径 |
| skill 规范或文章超出发送上限 | 直接报错，不截断后发送 | 上限值与输入大小 |
| 产物含脚本、事件属性或可执行 URL | 拒绝保存，不静默删除后声称成功 | `rawOutputHash`，不保存 Key |
| 产物改写或丢失原文 | 判为需修正并列出缺失片段 | Markdown 指纹、缺失片段 |
| 删除主题 | 二次确认后删除主题包，历史仍可读 | 被删 id、来源类型、时间 |

## Git 与阶段完成

每个可独立验收的任务形成提交；提交前运行与变更相关的检查。阶段完成时更新本文进度、对应计划和验证报告，注明哪些是实际执行证据。用户数据、参考快照、密钥及浏览器状态不能提交。

已按用户授权创建私有 GitHub 仓库并推送文档。基础实现通过核查后合入 main 并推送；不公开部署。
