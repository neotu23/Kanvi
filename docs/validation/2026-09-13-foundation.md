# 基础链路验证记录

实施日期：2026-09-14。当前正在实施，公众号实测尚未进行。

## 上游决策

固定提交见 [upstream-lock.json](../upstream-lock.json)。已完整阅读官方规范、CLI 说明和许可证，核查 WeMD ThemeProcessor。

- 使用 Juice 的独立 HTML/CSS 内联能力，不引入 WeMD 编辑器。WeMD 的 `processHtml` catch 返回未内联正文，不能作为成功标志。
- 微信 CLI 版本 0.2.16，JSON 为 `isValid/source/violations`，各组包含 `key/message/items`，不提供 CSS selector。保留段落索引、截断 HTML 证据，不编造选择器。
- 原 CLI 在 `finally` 前 `process.exit`，异常入口还注释了错误退出码；适配层需要可靠地关闭浏览器、检查 JSON 与退出码一致性。
- `verifyTimeoutMs` 尚未用于中断引擎；本应用从外部对子进程实施超时和输出限制。
- 上游依赖 `mp-darkmode@1.2.3-alpha.1` 要求 Node >=23.11。系统 Node 22 不满足，采用项目内 Node 24，不替换系统版本。

## 证据边界

这些是已完成的源码核查，运行结果将在执行后补入。程序检测与浏览器复制均不能替代公众号后台保存草稿和手机预览。

## 原始 CLI 首次运行

直接入口：`node vendor/wechat-spec/cli/node_modules/tsx/dist/cli.mjs vendor/wechat-spec/cli/src/index.ts <样例绝对路径> --json`，通过 `PUPPETEER_EXECUTABLE_PATH` 指定系统 Chrome。

首次探索使用系统 Node 22.22.3 / Chrome 152.0.7977.83：basic 退出 0，`isValid:true, violations:[]`；overlap 退出 1，`line-height` 两条节点证据。JSON 未混入 npm 日志；stderr 有旧 headless 弃用警告。原始输出保存在本地 artifacts，两份脱敏的完整 JSON 在 tests/fixtures。正式集成仍使用满足依赖要求的 Node 24 重新验证。
