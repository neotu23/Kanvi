# Kanvi

本地运行的公众号风格提取与文章排版工具。

最终目标：提供公众号参考链接，提取可复用设计；导入 Obsidian Markdown 后套用模板，生成可预览、检查、下载和复制的正文。

## 当前可用

2026-09-14：已实现第一阶段基础链路。首页使用自写日记，处理自定义 HTML/CSS，运行微信团队的结构检查器，显示手机宽度预览，提供富文本复制与 HTML 下载。

15 项自动测试、类型检查、生产构建和真实检查器集成验证通过。桌面及 390px 应用视口已查看。复制按钮的 Clipboard API 写入成功；自动化虚拟剪贴板未能完成实际粘贴闭环，按用户最新要求，系统粘贴、公众号实测及后续浏览器模拟已排除出本次任务，不作为代码交付条件。尚无已验证模板。

参考链接读取、DeepSeek、模板库及 Markdown 导入尚未实现。这里是基础验证页，不是完整编辑器。

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
- 本地处理不等于未来完全离线：参考读取和 DeepSeek 请求需要联网；当前样例不调用 AI。
- 样式内联、规则检测与公众号实际预览是三件不同的事。
- `data/`、`artifacts/`、`vendor/`、密钥及浏览器状态不提交。

## 文档

- [产品与技术设计](docs/superpowers/specs/2026-09-13-kanvi-design.md)
- [执行路线及进度](docs/EXECUTION.md)
- [第一阶段计划与实际完成项](docs/superpowers/plans/2026-09-13-foundation-validation.md)
- [第一阶段验证报告](docs/validation/2026-09-13-foundation.md)
- [第二阶段计划](docs/superpowers/plans/2026-09-14-reference-analysis.md)
- [上游版本](docs/upstream-lock.json) · [参考依据](docs/REFERENCES.md) · [第三方许可](THIRD_PARTY_NOTICES.md)

远程仓库：私有 [calzzzx/Kanvi](https://github.com/calzzzx/Kanvi)。本项目仅本机运行，未部署公开网站。
