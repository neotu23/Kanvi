# Kanvi

本地运行的公众号排版工具：用固定版本的 gzh-beautify skill 主题包，把 Markdown 装成可粘贴、可检查的公众号正文。

当前主路径：**选一套风格主题 → 导入自己的 Markdown → AI 按主题槽位装配 → 双规格检查 → 复制或下载**。参考链接提取与模板工作台是更早的路径，现已冻结保留，不再演进。

## 当前可用

2026-09-24：新增风格主题链路（gzh-beautify skill 固定版本、主题库、主题工厂、AI 直出 HTML 与双校验、CLI 与 `/styles` 界面）。2026-09-15 的基础排版、参考分析、模板工作台与 Markdown 文章生成仍可用。

- 风格主题页（`/styles`）：主题库画廊与预览、按 brief 生产主题草案并逐个确认入库、删除主题、导入 Markdown 生成正文、渲染历史、通过后被复制的富文本。
- CLI：`theme:seed`、`theme:make`、`theme:confirm`、`theme:remove`、`theme:render`。
- 首页：自定义 HTML/CSS 内联、官方结构规则检测、预览、富文本复制和 HTML 下载。
- 参考风格页（`/references`）与模板页（`/templates`）、文章生成页（`/generate`）：见下方“历史路径（已冻结）”。

149 项自动测试、类型检查和生产构建通过；`npm run verify:themes` 用真实上游脚本与真实官方检查器验证了整条新链路，模型响应为受控 fixture。**真实 DeepSeek 调用与公众号实测未执行**，详见 [第七阶段验证报告](docs/validation/2026-09-24-theme-skill.md)。

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

1. 打开“风格主题”，左侧是本地主题库。种子 6 套来自上游示例（`mist-masthead`、`step-workshop`、`paper-journal`、`cinnabar-catalog`、`graphite-editorial`、`moss-zen`），点主题名可看预览。
2. 在右侧选一套主题、导入或粘贴 Markdown，点击“生成并检查”。生成过程会先做结构解析与发送上限检查，再把内容交给模型按 `THEME.md` 的槽位装配。
3. 检查分两道：skill 的 `validate_article.py --strict`（可粘贴结构、平台红线、`span[leaf]` 包裹、全角标点等，要求 0 ERROR / 0 WARN）与官方 wechat-spec 检查器（真实 Chrome）。两道都通过、且原文保真门禁通过，才显示“规格检查通过”并启用复制。
4. 原文保真：产物中每个内容单元的句子必须按顺序出现，出现改写、丢段、换序或残留 Markdown 标记都会判为“需要修正”。章节编号、目录与英文标签属于主题骨架允许的新增，界面会单独列出供核对。
5. 主题工厂：在“主题工厂”输入 brief 生成草案（写入 `data/theme-drafts/<主题id>/`），草案只保留在本地待你确认；确认时重新运行 lint，通过后写入 `themes/<主题id>/` 并记录生成来源。删除主题需要在界面上二次确认，种子主题可用 `npm run theme:seed` 恢复，已有渲染历史不受影响。

CLI 等价入口：

```bash
npm run theme:render -- --theme moss-zen --input 文章.md   # 0=通过 1=需修正 2=错误
npm run theme:make -- --brief 风格说明.md                   # 只产出草案
npm run theme:confirm                                       # 列出待确认草案
npm run theme:confirm -- --draft <主题id>                    # 确认入库；--discard 丢弃
npm run theme:remove -- --id <主题id> --confirm <主题id>      # 删除主题包
npm run theme:seed                                          # 从固定版本恢复种子主题
```

产物与记录：正文写在 `artifacts/renders/<记录ID>/body.html`，报告在同目录 `report.json`；可复现的渲染记录保存在 `data/renders/<记录ID>/`，其中带有主题内容快照，所以即使主题被删除，历史仍可读取与复算。

边界：AI 只做装配，不改写原文；模型输出里的 `<script>`、事件属性、可执行 URL、`div`/`class`/`id` 或完整文档外壳一律拒绝，不静默删除后声称成功。图片按原文 `src` 渲染，不编造图床 URL；本地相对路径需要在公众号内重新上传。发送给模型的文章上限 60 KiB，超过直接报错，不截断后声称已发送完整内容。规格检查通过只表示该产物在固定检查器与固定 skill 版本下没有报告问题，不等于公众号实测通过。

## 历史路径（已冻结）

以下两条链路按 2026-09-24 的决定保留现状：不删除、不演进、不改行为，其测试与验证报告继续作为历史证据。

- 参考风格页（`/references`）：公众号链接读取或 HTML 导入、正文及样式证据、DeepSeek 设计分析、独立草稿历史。抓取遇到验证码或访问限制会报错，不绕过验证；原始 HTML 仅存在本地，不直接预览或执行。
- 模板页（`/templates`）与文章生成页（`/generate`）：从设计草稿制作不可变模板版本、样例规则检测与受限行距修正；导入单篇 Markdown 手选模板套版，本篇独立检测并保留历史。

这两条链路此前记录的限制仍然有效：模板按语义映射生成，不能自动重建参考文章的复杂区域布局；官方检查器对同行行内强调存在行距误报，程序保留原样例与原始诊断并停在“需修正”。详见 [第三阶段验证报告](docs/validation/2026-09-15-template-rendering.md) 与 [第四阶段验证报告](docs/validation/2026-09-15-markdown-rendering.md)。

模型配置（两条链路共用）：把 `.env.example` 复制为 `.env.local`，在本机填写 `DEEPSEEK_API_KEY`，然后重启服务。默认模型 `deepseek-flash`，可用 `DEEPSEEK_MODEL` 配置。不要把 Key 发送到聊天、放进客户端变量或提交 Git。

## 使用首页样例

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
- 本地运行不等于离线：参考读取、主题生成与文章装配需要联网；首页样例不调用 AI。
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
