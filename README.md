<h1 align="center">Kanvi</h1>

<p align="center"><strong>把你自己的 Markdown，装成能直接粘贴的公众号正文。</strong></p>
<p align="center">本地运行的公众号排版工具：固定版本主题库、AI 按槽位装配、双规格检查与原文保真门禁。</p>

<p align="center">
  <img src="https://img.shields.io/badge/local--only-127.0.0.1-0f766e" alt="仅在本机运行" />
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Node.js-24.21-5fa04e" alt="Node.js 24.21" />
  <img src="https://img.shields.io/badge/verified-macOS%20%2B%20Chrome-4b5563" alt="已在 macOS 与 Chrome 验证" />
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能一览">功能一览</a> ·
  <a href="#常用命令">常用命令</a> ·
  <a href="#本地数据与密钥">本地数据与密钥</a> ·
  <a href="#边界与已知限制">边界与已知限制</a> ·
  <a href="#文档">文档</a>
</p>

> **范围**：Kanvi 只在本机运行，默认监听 `127.0.0.1:8787`，没有公开部署。本文中的“规格检查通过”只表示该产物在当前固定检查器与固定 skill 版本下没有报告问题，**不等于公众号实测通过**。真实 DeepSeek 调用、浏览器交互模拟与公众号实测均未执行。

## 为什么用 Kanvi

公众号后台不接受 Markdown。把 Obsidian 里的文章搬过去，通常要么手工套模板、逐段调格式，要么交给在线排版工具再复制回来——前者费时间，后者把正文交到别人的服务器上。

Kanvi 把这一步留在本机：主题是仓库里固定版本的资产，排版交给模型按主题定义的槽位装配，产出先过两道规格检查和一道原文保真门禁，全部通过才开放复制。

它只做装配，不写文章。句子、顺序、目录与事实都来自你的原文；检查不通过时明确停在“需要修正”，不会清空样式、换成默认主题或删掉原文来冒充通过。

## 功能一览

### 一批主题，版本固定

种子 6 套主题（`mist-masthead`、`step-workshop`、`paper-journal`、`cinnabar-catalog`、`graphite-editorial`、`moss-zen`）来自上游示例主题包，由 `npm run theme:seed` 从固定 commit 复制、内容不改。每套主题含 `theme.json`、`THEME.md`、`preview.html` 三件套，另附本项目补充的 `SOURCE.json` / `SOURCE.md` 来源记录（上游 URL、commit、许可）。主题内容一旦被修改即视为新主题，历史记录不追溯修改。

### 先看全文，再决定用哪套

首页（`/`）上方横排本地主题库，窄屏可横向滚动（`/styles` 保留为兼容入口）。点主题名即用同一篇自写样例（[`public/samples/slow-afternoon.md`](public/samples/slow-afternoon.md)）按该主题的 `THEME.md` 正文槽位装配出完整文章，高度随全文与窗口宽度变化，不设内部滚动区。

切换主题时旧正文保留到新正文就绪，滚动位置不会被挤回页首；交叉淡化优先交给浏览器原生视图过渡（抓取新旧画面之间会等新正文渲染完成并量好高度，`view-transition-name` 只作用于正文区），浏览器不支持或用户选择减少动效时退回组件自己的淡出淡入。槽位缺失、变量未知或正文丢失会直接报错，不退回占位文案。预览不调用模型，也不继承或伪造任何检测结论。

### 导入 Markdown，按槽位装配

进入生成正文后导入或粘贴单篇 Markdown（`.md` 或纯文本）。输入上限 256 KiB / 20 万字符；解析为带类型的内容单元（标题、章节、段落、引用、列表、表格、代码块、图片、分隔线）后，连同主题的 `THEME.md`、`theme.json` 与 skill 的 `render-contract.md`、`wechat-constraints.md` 一起组装提示词。发送给模型的正文上限 60 KiB，超过直接报错，不截断后声称已发送完整内容。模型只返回 `{html, notes}`。

### 三道门禁都过，才给复制

1. **skill 严格校验**：`validate_article.py --strict`，覆盖可粘贴结构、平台红线、`span[leaf]` 包裹、全角标点等，要求 0 ERROR / 0 WARN。
2. **官方检查器**：固定版本的 wechat-spec 检查器在真实 Chrome 中运行；检查器故障、超时或报告与正文版本不匹配时状态为失败，不显示通过。
3. **原文保真**：把每个内容单元切成句子级片段，要求按顺序在产物可见文字中命中；改写、丢段、换序或残留 Markdown 标记都判为“需要修正”。

目录只沿用原文：原文没有目录就不新增，已有目录保留原标题、条目数量、顺序与位置。缺少日期、作者、简介时不保留主题生成的独立占位行，也不编造。章节编号、英文标签等主题装饰会单独列出供人工核对。三道门禁全部通过后，才显示“规格检查通过”并启用富文本复制。

### 预览、复制与导出共用同一份正文

预览、检测、HTML 下载与富文本复制使用的是同一份最终正文；“复制到公众号”写入 `text/html` 与 `text/plain`，“复制全文”写入纯文本剪贴板，内容是含文档外壳的整份 HTML 源码，不是给公众号解析的富文本片段。

可复现的渲染记录存放在 `data/renders/<记录ID>/`，其中带有主题内容快照，所以即使主题被删除，历史仍可读取与复算。走 CLI（`npm run theme:render`）时，正文额外写到 `artifacts/renders/<记录ID>/body.html`，报告在同目录 `report.json`。

### 主题工厂：草案先预览，再入库

在“模板制作”（`/studio`）新建主题，或选已有主题填写调整要求，服务端分两次模型调用产出 `theme.json` + `THEME.md` 与 `preview.html`，字段严格白名单校验。草案只写入 `data/theme-drafts/<主题id>/` 并立即跑 `lint_theme.py`；在界面确认时重新运行 lint，通过后才原子移入 `themes/<主题id>/` 并记录生成来源。

界面分主题列表、设计编辑、全文预览三栏：可编辑名称、设计提示词与本次调整要求，对比调整前后版本。旧主题没有原始提示词时，会明确显示按主题参数整理的设计说明；新生成主题把实际提示词、调整要求与父主题快照写入 `DESIGN.json`。保存一律使用独立新 ID，不覆盖原版；改了设计提示词后需要重新生成，确保保存记录与预览一致。删除主题只影响主题包本身，不影响渲染历史，种子可由 `npm run theme:seed` 恢复。

### 历史、备份与恢复

“文章历史”（`/history`）列出已保存的正文及其检查报告，可复制或下载。“设置”（`/settings`）提供运行状态、模型配置、备份恢复、本地数据路径与旧工具入口。备份是一个带内容指纹的 JSON 文件，含主题包与渲染记录；导出前会断言内容不含本机 API Key（环境变量与 `data/settings.json` 里的都检查）。恢复只新增：已存在的主题或历史会被跳过并计数，不会被覆盖。备份不含待确认草案、`artifacts/`、`vendor/` 与冻结链路的数据。

### 检查器缺失时明确失败，不假装通过

`gzh-beautify-skill` 是可选上游：没有安装时只影响风格主题链路，不会让既有检查链路失败，相关操作会提示执行 `npm run setup:checker`。安装脚本下载固定上游源码、使用已提交的依赖锁文件，且不覆盖已有的不同版本源码；检查器未安装、版本被修改或无法启动时，页面显示检测失败，不显示通过。

### 排版样例（`/demo`）：单独验证内联与规则检测

不接 AI、不抓文章的独立工具页：把自定义 HTML/CSS 内联后运行官方结构规则检测，并可预览、富文本复制、下载 HTML。四者共用同一份最终正文，生成结果在 `artifacts/<正文指纹>/body.html`，报告在同目录 `report.json`。页面正常只说明这些检查没有报告问题，仍需自己粘贴到公众号后台并确认手机预览。

## 快速开始

### 前提

Git、npm、系统 Chrome、`python3`（运行 skill 校验脚本，实测 3.9.6 可用，可用 `KANVI_PYTHON` 指定）。已在 macOS、Chrome 152.0.7977.83 验证。

### 从源码启动

```bash
git clone https://github.com/neotu23/Kanvi.git
cd Kanvi
npm ci
npm run setup:checker   # 同时克隆 wechat-spec 检查器与 gzh-beautify skill 到 vendor/
npm run theme:seed      # 把 6 套示例主题复制到 themes/ 作为初始主题库
npm run dev
```

打开终端显示的本地地址，默认 `http://127.0.0.1:8787`（避开 3000、5173、8080 以及 macOS 上被 AirPlay 占用的 5000/7000）。端口偶尔被占用时不必改仓库配置，直接在命令行覆盖：

```bash
npm run dev -- --port 5555
npm run start -- --port 5555
```

`npm ci` 同时安装项目内 Node 24.21.0；npm 脚本优先使用该版本，不替换系统 Node。macOS 默认使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，其他安装位置请设置 `PUPPETEER_EXECUTABLE_PATH` 后再启动：

```bash
# 自定义浏览器路径示例
PUPPETEER_EXECUTABLE_PATH=/absolute/path/to/chrome npm run dev
```

### 一句话跑通主路径

选主题 → 看全文预览 → 点“生成正文” → 导入 Markdown → “生成并检查” → 三道门禁通过后“复制到公众号”。已保存主题不显示确认按钮；新生成的草案自动打开预览，右上角显示“未保存主题”，点击保存入库后方可生成正文。

### 模型配置

在“设置”页的“DeepSeek 模型”区块填写 API Key 与模型名，保存后立即生效、无需重启；“测试连接”用一次 `/models` 请求确认 Key 可用，不发送任何文章内容。密钥只写入 `data/settings.json`（权限 0600，已在 `.gitignore` 内），界面与接口只回显尾 4 位。

仍可用环境变量方式配置：复制 `.env.example` 为 `.env.local` 并重启服务。生效顺序为本地设置优先、未填写时才读取 `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL`；默认模型 `deepseek-flash`。设置文件损坏时明确报错并保留原文件，不静默覆盖。不要把 Key 发送到聊天、放进客户端变量或提交 Git。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` / `npm run build` / `npm run start` | 开发、构建、生产启动 |
| `npm test` | 217 项自动测试（vitest） |
| `npm run typecheck` | TypeScript 严格类型检查 |
| `npm run check:upstream` | 校验上游版本清单与实际源码一致 |
| `npm run setup:checker` | 拉取固定版本的检查器与 skill 到 `vendor/` |
| `npm run verify:themes` | 用受控模型响应与真实上游脚本验证主题链路 |
| `npm run verify:theme-layout` | 用自写样例逐主题检查槽位装配与 lint，不调用模型 |
| `npm run verify:integration` | 内联、检查器与产物的集成验证 |
| `npm run verify:templates` / `npm run verify:articles` | 冻结链路的模板与文章验证（历史证据） |

主题 CLI（与页面等价，`0` = 通过 / `1` = 需修正 / `2` = 错误）：

```bash
npm run theme:render -- --theme moss-zen --input 文章.md   # 装配 + 双规格校验 + 保真门禁
npm run theme:make -- --brief 风格说明.md                   # 只产出草案
npm run theme:confirm                                       # 列出待确认草案
npm run theme:confirm -- --draft <主题id>                    # 确认入库；--discard 丢弃
npm run theme:remove -- --id <主题id> --confirm <主题id>      # 删除主题包
npm run theme:seed                                          # 从固定版本恢复种子主题
npm run theme:backup                                        # 导出主题包与渲染历史（不含草案、artifacts、密钥）
npm run theme:restore -- --in <备份.json>                     # 恢复：只新增，不覆盖已存在条目
```

## 本地数据与密钥

```text
themes/<id>/           # 主题包（提交 Git）：theme.json、THEME.md、preview.html、SOURCE.*、可选 DESIGN.json
data/
  settings.json        # 本机模型配置（0600，不提交）
  theme-drafts/<id>/   # 待确认草案（不提交）
  renders/<id>/        # 渲染记录、报告与主题快照（不提交）
  references/ analyses/ templates/ articles/   # 冻结链路数据（不提交）
artifacts/             # 检测与验证产物（不提交）
vendor/                # 固定提交的上游工作副本（不提交）
.reasonix/ .worktrees/ # 本地工具与工作副本（不提交）
```

首次使用会在设置页显示存储路径。写入采用临时文件后原子替换；主题入库与版本都不可原地覆盖；重启后主题、草案与历史仍可读取。第一版不引入数据库、账户、多用户权限或云同步。

## 边界与已知限制

- **检查通过 ≠ 公众号兼容**。规格检查只覆盖固定检查器与固定 skill 版本已实现的规则，实际粘贴效果与手机预览仍需自己确认。
- **AI 只装配，不改写原文**。模型输出里的 `<script>`、事件属性、可执行 URL、`div`/`class`/`id` 或完整文档外壳一律拒绝，不静默删除后声称成功。
- **图片按原文 `src` 渲染**，不编造图床地址；本地相对路径需要在公众号内重新上传。
- **只生成纯文字正文**：不处理音视频、SVG 动效，不自动发布，也不做完整富文本编辑器。
- **本地不等于离线**：参考读取、主题生成与正文装配需要联网；首页主题预览与排版样例不调用 AI。
- **尚未验证**：真实 DeepSeek Key 的产出质量、超长主题与超长文章的模型输出、浏览器交互与视图过渡效果、公众号粘贴与手机预览。
- 样式内联、规格检查与公众号实际预览是三件不同的事，任一步通过都不代表后一步通过。

## 历史路径（已冻结）

以下两条链路按 2026-09-24 的决定保留现状：不删除、不演进、不改行为，其代码、测试与验证报告继续作为历史证据。

- **参考风格页**（`/references`）：公众号链接读取或 HTML 导入、正文及样式证据、DeepSeek 设计分析、独立草稿历史。遇到验证码或访问限制会报错，不绕过验证；原始 HTML 仅存在本地，不直接预览或执行。
- **模板页**（`/templates`）与**文章生成页**（`/generate`）：从设计草稿制作不可变模板版本、样例规则检测与受限行距修正；导入单篇 Markdown 手选模板套版，本篇独立检测并保留历史。

已记录的限制仍然有效：模板按语义映射生成，不能自动重建参考文章的复杂区域布局；官方检查器对同行行内强调存在行距误报，程序保留原样例与原始诊断并停在“需修正”。详见 [第三阶段验证报告](docs/validation/2026-09-15-template-rendering.md) 与 [第四阶段验证报告](docs/validation/2026-09-15-markdown-rendering.md)。

## 更新记录

最新自动检测状态（2026-11-04 复核）：217 项测试、类型检查与生产构建通过。真实 DeepSeek 调用、浏览器交互模拟与公众号实测未执行，因此不标记为已实测通过。

| 日期 | 变化 |
| --- | --- |
| 2026-10-13 | 正文目录只沿用原文，不再提炼“三看点”；新增、重复或扩写目录判为需修正 |
| 2026-10-12 | 缺少日期、作者、简介时不再保留主题占位行，也不编造 |
| 2026-10-11 | 设置页可保存/测试/清除 DeepSeek 配置，本地优先、环境变量回退 |
| 2026-09-26 | 模板制作支持编辑设计提示词、基于原主题微调、前后预览与独立保存；切主题不再清空预览 |
| 2026-09-24 | 风格主题链路（第七阶段）：固定版本 skill、主题库、主题工厂、AI 直出 HTML 与双校验 |

完整的改动说明、当次测试数字与验证报告链接见 [更新记录](docs/CHANGELOG.md)。

## 文档

- [产品与技术设计](docs/superpowers/specs/2026-09-13-kanvi-design.md)
- [执行路线及进度](docs/EXECUTION.md)
- [第一阶段计划](docs/superpowers/plans/2026-09-13-foundation-validation.md) · [验证报告](docs/validation/2026-09-13-foundation.md)
- [第二阶段计划](docs/superpowers/plans/2026-09-14-reference-analysis.md) · [验证报告](docs/validation/2026-09-15-reference-analysis.md)
- [第三阶段模板计划](docs/superpowers/plans/2026-09-15-template-rendering.md) · [验证报告](docs/validation/2026-09-15-template-rendering.md)
- [第四阶段 Markdown 计划](docs/superpowers/plans/2026-09-15-markdown-rendering.md) · [验证报告](docs/validation/2026-09-15-markdown-rendering.md)
- [第五阶段 AI 推荐计划（已冻结）](docs/superpowers/plans/2026-09-15-template-recommendation.md)
- [第七阶段主题 skill 计划](docs/superpowers/plans/2026-09-24-theme-skill-rendering.md) · [验证报告](docs/validation/2026-09-24-theme-skill.md)
- [主题预览与入口改动验证](docs/validation/2026-09-25-theme-preview.md) · [模板制作验证](docs/validation/2026-09-26-theme-studio.md)
- [可选字段修复验证](docs/validation/2026-10-12-optional-metadata.md) · [原文目录修复验证](docs/validation/2026-10-13-source-toc.md)
- [上游版本](docs/upstream-lock.json) · [参考依据](docs/REFERENCES.md) · [第三方来源与许可](THIRD_PARTY_NOTICES.md)

## 第三方来源

主题种子、`lint_theme.py`、`validate_article.py` 与官方检查器均来自固定版本的上游项目，许可与来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。上游 `vendor/` 工作副本不进入 Git，本仓库未改动上游脚本。

---

远程仓库：私有 [neotu23/Kanvi](https://github.com/neotu23/Kanvi)。本项目仅本机运行，未部署公开网站。
