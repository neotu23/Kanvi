# Kanvi

本地运行的公众号排版工具：用固定版本的 gzh-beautify skill 主题包，把 Markdown 装成可粘贴、可检查的公众号正文。

当前主路径：**完整文章预览 → 选择已保存主题 → 进入正文生成 → 导入自己的 Markdown → AI 按主题槽位装配 → 双规格检查 → 复制或下载**。参考链接提取与模板工作台是更早的路径，现已冻结保留，不再演进。

## 当前可用

2026-09-24：新增风格主题链路（gzh-beautify skill 固定版本、主题库、主题工厂、AI 直出 HTML 与双校验、CLI 与 `/styles` 界面）。2026-09-15 的基础排版、参考分析、模板工作台与 Markdown 文章生成仍可用。

- 首页（`/`，`/styles` 保留为兼容入口）：选择已保存主题、完整文章预览、进入正文生成、复制和下载结果。
- 模板制作（`/studio`）：浏览与搜索主题和草案，查看设计提示词，自行设计或微调现有主题，对比调整前后的全文预览，保存为独立新主题。
- 文章历史（`/history`）：查看已保存的正文及检查报告，复制或下载结果。
- 设置（`/settings`）：运行状态、DeepSeek 模型配置、备份与恢复、本地数据路径和旧工具入口。
- CLI：`theme:seed`、`theme:make`、`theme:confirm`、`theme:remove`、`theme:render`。
- 排版样例（`/demo`）：自定义 HTML/CSS 内联、官方结构规则检测、预览、富文本复制和 HTML 下载。
- 参考风格页（`/references`）与模板页（`/templates`）、文章生成页（`/generate`）：见下方“历史路径（已冻结）”。

149 项自动测试、类型检查和生产构建通过；`npm run verify:themes` 用真实上游脚本与真实官方检查器验证了整条新链路，模型响应为受控 fixture。**真实 DeepSeek 调用与公众号实测未执行**，详见 [第七阶段验证报告](docs/validation/2026-09-24-theme-skill.md)。

2026-09-26 导航与模板制作更新：169 项自动测试、完整类型检查及生产构建通过。支持查看与编辑设计提示词、基于原主题微调、前后预览及独立保存。本次未执行真实模型调用、浏览器交互模拟或公众号实测，详见[模板制作验证报告](docs/validation/2026-09-26-theme-studio.md)。

2026-09-26 主题切换体验更新：首页与模板制作页换主题时不再清空正文预览，旧正文保留到新正文就绪，滚动位置不再被浏览器挤回页首。正文切换优先交给浏览器原生视图过渡做交叉淡化：新旧画面抓取之间会等新正文渲染完成并量好高度，`view-transition-name` 只作用于正文区，页面其余部分不参与；浏览器不支持或用户选择减少动效时，退回组件自己的淡出淡入。182 项自动测试、完整类型检查及生产构建通过；视图过渡与 iframe 截图属浏览器行为，本次未执行浏览器交互模拟，效果需在 Chrome 实测确认。

2026-10-11 DeepSeek 配置更新：`/settings` 新增“DeepSeek 模型”区块，可填写与保存 API Key、模型名，测试连接（一次 `/models` 请求），以及清除本地密钥。保存写入 `data/settings.json`（0600，已在 `.gitignore` 内），无需重启即生效；生效顺序为本地设置优先、环境变量回退，设置文件损坏时明确报错并保留原文件、不静默覆盖。密钥只回显尾 4 位，接口拒绝非本机请求与越权字段，备份导出同时检查环境变量与本地设置中的密钥。188 项自动测试、完整类型检查及生产构建通过；连接测试的失败分支由受控 transport 覆盖，未对真实 DeepSeek 验证 Key 可用性，浏览器交互模拟与公众号实测未执行。

2026-10-12 正文可选字段修复：缺少日期、作者和简介时，不再保留主题生成的独立占位行；属性区已提供日期时使用该值，已有署名保留，不编造日期或作者。处理只适用于独立的主题可选空行，并在处理前检查原始产物，未知占位符、原文字面符号和其他违规仍由原有门禁拦截。旧历史不修改，需重新点击“生成并检查”，全部通过后使用“复制到公众号”；“复制全文”仍是 HTML 源码。194 项自动测试、类型检查和生产构建通过，详见[可选字段修复验证](docs/validation/2026-10-12-optional-metadata.md)。

2026-10-13 原文目录修复：正文生成默认只排版原文，原文没有目录时不再提炼“三看点”，已有目录保留原标题、条目数量、顺序与位置。最终提示词覆盖主题和上游的目录要求；模型仍新增、重复或扩写可识别目录时判为“需修正”并展示原因，不开放通过后的富文本复制。旧历史继续按原提示词版本复算，需重新“生成并检查”使用新规则。217 项自动测试、类型检查、生产构建与上游版本检查通过；未执行真实模型调用、浏览器交互模拟或公众号实测。详见[原文目录修复验证](docs/validation/2026-10-13-source-toc.md)。

## 本地启动

前提：Git、npm、系统 Chrome、`python3`（运行 skill 校验脚本，实测 3.9.6 可用，可用 `KANVI_PYTHON` 指定）。已在 macOS、Chrome 152.0.7977.83 验证。

```bash
npm ci
npm run setup:checker   # 同时克隆 wechat-spec 检查器与 gzh-beautify skill 到 vendor/
npm run theme:seed      # 把 6 套示例主题复制到 themes/ 作为初始主题库
npm run dev
```

打开终端显示的本地地址，默认 `http://127.0.0.1:8787`（避开 3000、5173、8080 以及 macOS 上被 AirPlay 占用的 5000/7000）。

端口偶尔被占用时不必改仓库配置，直接在命令行覆盖：

```bash
npm run dev -- --port 5555
npm run start -- --port 5555
```

`npm ci` 同时安装项目内 Node 24.21.0；npm 脚本优先使用该版本，不替换系统 Node。`setup:checker` 下载固定上游源码，使用已提交的依赖锁文件，不自动下载 Chromium。macOS 默认使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`；其他安装位置请设置 `PUPPETEER_EXECUTABLE_PATH` 后再启动。

```bash
# 自定义浏览器路径示例
PUPPETEER_EXECUTABLE_PATH=/absolute/path/to/chrome npm run dev

# 生产模式
npm run build
npm run start

# 检查与集成验证
npm test
npm run typecheck
npm run check:upstream
npm run verify:themes
npm run verify:integration
npm run verify:templates
npm run verify:articles
```

若检查器未安装、版本被修改或无法启动，页面显示检测失败，不显示通过。安装脚本不会覆盖已有的不同版本源码。`gzh-beautify-skill` 是可选上游：没有安装时只影响风格主题链路，不会让既有检查链路失败；缺失时相关操作会提示 `npm run setup:checker`。

## 风格主题（skill 直出 HTML）

1. 打开首页，上方横排本地主题库，窄屏可横向滚动。种子 6 套来自上游示例（`mist-masthead`、`step-workshop`、`paper-journal`、`cinnabar-catalog`、`graphite-editorial`、`moss-zen`），点主题名可看下方完整文章预览，页面默认打开第一套可用主题。预览随全文展开，不设内部滚动区。
2. 查看已保存主题的预览后，点击主题栏右上角“生成正文”，导入或粘贴 Markdown，点击“生成并检查”。已保存主题不显示确认按钮；新生成的草案自动打开预览，右上角显示“未保存主题”，点击可保存入库。预览底部不放操作按钮，切换主题保留已输入的正文。生成过程会先做结构解析与发送上限检查，再把内容交给模型按 `THEME.md` 的槽位装配。
3. 检查分两道：skill 的 `validate_article.py --strict`（可粘贴结构、平台红线、`span[leaf]` 包裹、全角标点等，要求 0 ERROR / 0 WARN）与官方 wechat-spec 检查器（真实 Chrome）。两道都通过、且原文保真门禁通过，才显示“规格检查通过”并启用复制。
4. 原文保真：产物中每个内容单元的句子必须按顺序出现，出现改写、丢段、换序或残留 Markdown 标记都会判为“需要修正”。目录只能沿用原文，不从章节提炼三看点；新增、重复或扩写可识别目录时也判为需修正。章节编号、英文标签等主题装饰会单独列出供核对。
5. 模板制作：在“模板制作”新建主题，或选已有主题填写调整要求，生成草案（写入 `data/theme-drafts/<主题id>/`），草案只保留在本地待你确认；确认时重新运行 lint，通过后写入 `themes/<主题id>/` 并记录生成来源。删除主题可使用 CLI，种子主题可用 `npm run theme:seed` 恢复，已有渲染历史不受影响。

预览示例为自写的《把一个下午还给自己》，保存在 [`public/samples/slow-afternoon.md`](public/samples/slow-afternoon.md)，页面提供下载入口。六套主题使用同一份文章，按各自 `THEME.md` 的正文槽位装配，不依赖模型；上游 `preview.html` 仍保留为主题包资产。样例预览不表示正文规格检查通过。缺槽、未知变量或正文丢失会明确报错，不退回占位文案。详见 [主题预览与入口改动验证](docs/validation/2026-09-25-theme-preview.md)。

模板制作分为主题列表、设计编辑、全文预览三栏。可编辑名称、设计提示词与本次调整要求，并切换当前版本和调整后版本。旧主题没有原始提示词时，会明确显示按主题参数整理的设计说明；新生成主题将实际提示词、调整要求和原版快照保存在 `DESIGN.json`。保存采用独立新 ID，不覆盖原版。编辑生成后的提示词需重新生成，确保保存的记录与预览一致。

CLI 等价入口：

```bash
npm run theme:render -- --theme moss-zen --input 文章.md   # 0=通过 1=需修正 2=错误
npm run theme:make -- --brief 风格说明.md                   # 只产出草案
npm run theme:confirm                                       # 列出待确认草案
npm run theme:confirm -- --draft <主题id>                    # 确认入库；--discard 丢弃
npm run theme:remove -- --id <主题id> --confirm <主题id>      # 删除主题包
npm run theme:seed                                          # 从固定版本恢复种子主题
npm run theme:backup                                        # 导出主题包与渲染历史（不含草案、artifacts、密钥）
npm run theme:restore -- --in <备份.json>                     # 恢复：只新增，不覆盖已存在条目
```

产物与记录：正文写在 `artifacts/renders/<记录ID>/body.html`，报告在同目录 `report.json`；可复现的渲染记录保存在 `data/renders/<记录ID>/`，其中带有主题内容快照，所以即使主题被删除，历史仍可读取与复算。

备份与恢复：“设置”页面的“备份与恢复”区块与上面的 CLI 等价。备份是一个 JSON 文件，含主题包（`theme.json`、`THEME.md`、`preview.html`、来源记录、可选的 `DESIGN.json`）与渲染记录，带内容指纹；导出前会断言内容不含本机 API Key（环境变量与 `data/settings.json` 里的都检查）。恢复只新增：已存在的主题或历史会被跳过并计数，不会被覆盖。备份不包含待确认草案、`artifacts/`、`vendor/` 与冻结链路的 `data/`。界面下方同时显示主题库、草案、渲染历史与验证产物的本机路径。

边界：AI 只做装配，不改写原文；模型输出里的 `<script>`、事件属性、可执行 URL、`div`/`class`/`id` 或完整文档外壳一律拒绝，不静默删除后声称成功。图片按原文 `src` 渲染，不编造图床 URL；本地相对路径需要在公众号内重新上传。发送给模型的文章上限 60 KiB，超过直接报错，不截断后声称已发送完整内容。规格检查通过只表示该产物在固定检查器与固定 skill 版本下没有报告问题，不等于公众号实测通过。

## 历史路径（已冻结）

以下两条链路按 2026-09-24 的决定保留现状：不删除、不演进、不改行为，其测试与验证报告继续作为历史证据。

- 参考风格页（`/references`）：公众号链接读取或 HTML 导入、正文及样式证据、DeepSeek 设计分析、独立草稿历史。抓取遇到验证码或访问限制会报错，不绕过验证；原始 HTML 仅存在本地，不直接预览或执行。
- 模板页（`/templates`）与文章生成页（`/generate`）：从设计草稿制作不可变模板版本、样例规则检测与受限行距修正；导入单篇 Markdown 手选模板套版，本篇独立检测并保留历史。

这两条链路此前记录的限制仍然有效：模板按语义映射生成，不能自动重建参考文章的复杂区域布局；官方检查器对同行行内强调存在行距误报，程序保留原样例与原始诊断并停在“需修正”。详见 [第三阶段验证报告](docs/validation/2026-09-15-template-rendering.md) 与 [第四阶段验证报告](docs/validation/2026-09-15-markdown-rendering.md)。

模型配置（两条链路共用）：在“设置”页的“DeepSeek 模型”区块填写 API Key 与模型名，保存后立即生效、无需重启；“测试连接”用一次 `/models` 请求确认 Key 可用，不发送任何文章内容。密钥只写入 `data/settings.json`（权限 600，已被 `.gitignore` 覆盖），界面与接口只回显尾 4 位，备份导出前也会检查该文件中的密钥。仍可用 `.env.example` → `.env.local` 的环境变量方式配置：本地设置优先，本地未填写时才读取 `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL`。默认模型 `deepseek-flash`。不要把 Key 发送到聊天、放进客户端变量或提交 Git。

## 使用排版样例（`/demo`）

1. 点击“生成并检测样例”。
2. 查看标题边框、段落留白和引用样式，确认规则检测状态。
3. 点击“复制到公众号”，手动粘贴到公众号后台。
4. 保存草稿并检查手机预览；可同时下载 HTML 留存。
5. 把实际差异、浏览器、手机型号与检测记录中的正文指纹一起记录。未确认前不能将样例视为公众号实测通过。

预览、检测、下载和复制共用同一份最终正文。生成结果在 `artifacts/<正文指纹>/body.html`，报告在同目录 `report.json`。这些是本机数据，不进入 Git。

## 实施原则

- 原文和顺序优先；AI 只负责装配、设计分析与局部修正建议，不改写事实。
- 上游与主题资产都固定版本：检查器、skill 与主题包的实际版本记录在 `docs/upstream-lock.json` 与每个主题包的 `SOURCE.json` 中。
- 模型输出与上游预览页都视为数据：不执行脚本与事件处理器，危险结构在入口报错。
- 本地运行不等于离线：参考读取、主题生成与文章装配需要联网；首页主题预览和排版样例不调用 AI。
- 样式内联、规格检查与公众号实际预览是三件不同的事。
- `data/`、`artifacts/`、`vendor/`、`.reasonix/`、密钥及浏览器状态不提交。

## 文档

- [产品与技术设计](docs/superpowers/specs/2026-09-13-kanvi-design.md)
- [执行路线及进度](docs/EXECUTION.md)
- [第一阶段计划与实际完成项](docs/superpowers/plans/2026-09-13-foundation-validation.md) · [第一阶段验证报告](docs/validation/2026-09-13-foundation.md)
- [第二阶段计划与完成项](docs/superpowers/plans/2026-09-14-reference-analysis.md) · [第二阶段验证报告](docs/validation/2026-09-15-reference-analysis.md)
- [第三阶段模板计划与完成项](docs/superpowers/plans/2026-09-15-template-rendering.md) · [第三阶段验证报告](docs/validation/2026-09-15-template-rendering.md)
- [第四阶段 Markdown 计划与完成项](docs/superpowers/plans/2026-09-15-markdown-rendering.md) · [第四阶段验证报告](docs/validation/2026-09-15-markdown-rendering.md)
- [第五阶段 AI 推荐计划（已冻结）](docs/superpowers/plans/2026-09-15-template-recommendation.md)
- [第七阶段主题 skill 计划](docs/superpowers/plans/2026-09-24-theme-skill-rendering.md) · [第七阶段验证报告](docs/validation/2026-09-24-theme-skill.md)
- [上游版本](docs/upstream-lock.json) · [参考依据](docs/REFERENCES.md) · [第三方许可](THIRD_PARTY_NOTICES.md)

远程仓库：私有 [neotu23/Kanvi](https://github.com/neotu23/Kanvi)。本项目仅本机运行，未部署公开网站。
