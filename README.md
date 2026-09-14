# Kanvi

本地运行的公众号风格提取与文章排版工具。

最终目标：提供公众号参考链接，提取可复用设计；导入 Obsidian Markdown 后套用模板，生成可预览、检查、下载和复制的正文。

## 当前可用

2026-09-15：已实现基础排版样例和第二阶段参考分析。

- 首页：自定义 HTML/CSS 内联、官方结构规则检测、预览、富文本复制和 HTML 下载。
- 参考风格页（`/references`）：公众号链接读取或 HTML 导入、正文及样式证据、本地参考列表、DeepSeek 设计分析、独立草稿历史。
- 分析失败可重试；没有 API Key 仍可导入与查看参考。不把模型分析当成模板规则检测通过。

62 项自动测试、类型检查、生产构建、12 项生产 HTTP 接口核验及既有官方检查器集成验证通过。测试使用自写文章与受控模型响应。真实微信链接抓取及真实 DeepSeek 调用尚未验证。按用户要求，不执行公众号实测、系统粘贴或浏览器交互模拟。

模板生成、模板匹配与 Markdown 导入仍未实现，下一阶段是把设计草稿转为可复用模板并做样例规则检测。项目没有完整富文本编辑器。

## 本地启动

前提：Git、npm、系统 Chrome。已在 macOS、Chrome 152.0.7977.83 验证。

```bash
npm ci
npm run setup:checker
npm run dev
```

打开终端显示的本地地址，默认 `http://127.0.0.1:3000`。开发期间的临时预览服务已停止；需要运行时使用上述启动命令。

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
npm run verify:integration
```

若检查器未安装、版本被修改或无法启动，页面显示检测失败，不显示通过。安装脚本不会覆盖已有的不同版本源码。

## 参考风格与 DeepSeek

1. 启动后打开“参考风格”，输入公众号链接，或选择自己保存的 UTF-8 HTML 文件（最大 2 MiB，需含唯一的 `#js_content` 正文区域）。
2. 查看来源诊断和结构证据。抓取遇到验证码或访问限制会报错，不绕过验证。原始 HTML 仅存在本地，不直接预览或执行。
3. 如需 AI 分析，将 `.env.example` 复制为 `.env.local`，在本机填写 `DEEPSEEK_API_KEY`，然后重启服务。默认模型 `deepseek-flash`，可用 `DEEPSEEK_MODEL` 配置。不要把 Key 发送到聊天、放进客户端变量或提交 Git。
4. 重新打开参考后点击“分析设计风格”。仅本篇结构、样式和每个元素最多 120 字的片段会发送到 DeepSeek。分析不会自动运行，也不自动重试收费请求。
5. 查看配色、字号、区域、引用证据、估计及不支持项。每次分析独立保存，仍属于设计草稿。

参考与草稿分别保存在 `data/references/<来源指纹>/snapshot.json` 和 `data/analyses/<来源指纹>/<分析ID>/analysis.json`，重启后可读取。源码和这些本地数据分开管理。

当前分析只读取静态 HTML/CSS，不会运行页面脚本、读取外部样式或测量布局；图片装饰、伪元素、动态和条件样式会有诊断。证据输入超过 100 KiB 时明确报错，不截断后冒充完整分析。

## 使用样例

1. 点击“生成并检测样例”。
2. 查看标题边框、段落留白和引用样式，确认规则检测状态。
3. 点击“复制到公众号”，手动粘贴到公众号后台。
4. 保存草稿并检查手机预览；可同时下载 HTML 留存。
5. 把实际差异、浏览器、手机型号与检测记录中的正文指纹一起记录。未确认前不能将样例视为公众号实测通过。

预览、检测、下载和复制共用同一份最终正文。生成结果在 `artifacts/<正文指纹>/body.html`，报告在同目录 `report.json`。这些是本机数据，不进入 Git。

## 实施原则

- 原文和顺序优先，AI 后续仅负责设计分析、匹配与局部修正建议。
- 风格支持自定义 HTML/CSS，不限于固定 Markdown 主题；当前不支持的媒体、伪元素、动态样式等明确报错。
- 本地运行不等于离线：参考读取和 DeepSeek 请求需要联网；首页样例不调用 AI。
- 样式内联、规则检测与公众号实际预览是三件不同的事。
- `data/`、`artifacts/`、`vendor/`、密钥及浏览器状态不提交。

## 文档

- [产品与技术设计](docs/superpowers/specs/2026-09-13-kanvi-design.md)
- [执行路线及进度](docs/EXECUTION.md)
- [第一阶段计划与实际完成项](docs/superpowers/plans/2026-09-13-foundation-validation.md)
- [第一阶段验证报告](docs/validation/2026-09-13-foundation.md)
- [第二阶段计划与完成项](docs/superpowers/plans/2026-09-14-reference-analysis.md)
- [第二阶段验证报告](docs/validation/2026-09-15-reference-analysis.md)
- [第三阶段模板计划](docs/superpowers/plans/2026-09-15-template-rendering.md)
- [上游版本](docs/upstream-lock.json) · [参考依据](docs/REFERENCES.md) · [第三方许可](THIRD_PARTY_NOTICES.md)

远程仓库：私有 [calzzzx/Kanvi](https://github.com/calzzzx/Kanvi)。本项目仅本机运行，未部署公开网站。
