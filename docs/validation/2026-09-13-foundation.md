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

## 最终运行结果（2026-09-14）

环境：macOS，系统 Node 22.22.3；正式 npm 脚本使用项目内 Node 24.21.0。Next.js 16.3.5、React 19.3.0、TypeScript 7.0.2、Vitest 5.0.0、Juice 12.1.3；Chrome 152.0.7977.83。准确的传递依赖在锁文件中。

| 验证 | 结果 |
|---|---|
| `npm run setup:checker` | 固定锁文件重装成功，未下载浏览器 |
| `npm test` | 5 个测试文件、15 项通过 |
| `npm run typecheck` | 通过 |
| `npm run check:upstream` | SHA、已跟踪修改、未记录新增文件与依赖锁校验通过 |
| `npm run verify:integration` | basic 通过；overlap 返回 line-height 违规；自定义样式通过 |
| `npm run build` | 生产构建通过 |
| 浏览器桌面与 390px 应用视口 | 生成、检测、文章预览显示正常，未见截断或重叠 |
| 复制按钮 | `navigator.clipboard.write` 完成并显示成功；载荷测试包含 text/html 与 text/plain |
| 系统富文本粘贴闭环 | 未完成：自动化的虚拟剪贴板没有收到网页写入的数据；读取辅助页也未取得 text/html，不能据此确认实际粘贴 |
| 公众号保存草稿与手机预览 | 未执行，等待用户实际验证 |

最终正文 SHA-256：`87c5d85ebb5b7e01df688f8b947f32eac4647f8cab8609f38ea635ebe2777ad8`。

真实集成输出位于本机 `artifacts/integration.json`；应用按该指纹保存 `body.html/report.json`。正文包含暖棕标题边框、4 个段落和浅色引用，标题、段落次序及原文均保留。不会创建任何 verified 模板。

## 已修复的问题与适配差异

- 使用独立 Juice 适配器，内联错误抛出；前后签名比较正文文字及标签序列，不以默认主题兜底。
- 不直接调用存在提前退出问题的原 CLI。自有入口加载同一固定引擎和 JSON formatter，先关闭浏览器再设置退出码；从外部提供 30 秒时限与 1 MiB 输出限制，取消时终止专属进程组。
- 检测浏览器保留默认浏览器沙箱；拒绝页面网络请求，页面 CSP 禁止脚本/事件与外部资源。引擎由开发协议注入执行，正文只是数据。
- 上游结果没有 selector，当前应用保留规则、段落索引与截断节点证据，不伪造定位。
- Next 内部构建的 request.url 与浏览器看到的 Origin 不总相同，曾导致本机请求被误拒。改为精确核对本机 Host 与 Origin，增加相同 Host 放行、跨站/非本机/端口不同拒绝测试。
- `check-upstream` 会拒绝新增的未跟踪源码；受程序管理的 cli/package-lock.json 单独与已提交锁文件比较。

## 已知限制

应用的 15 项测试与真实引擎样例运行已完成；浏览器界面和 Clipboard API 完成信号已观察，但没有完成系统剪贴板、公众号或真实移动设备的闭环。浏览器控制工具不提供本次可用的控制台日志读取接口，不能把“页面没有错误覆盖层”写成“所有控制台日志已核查”。

本阶段支持常见纯文字 HTML 结构及可直接内联的 CSS；媒体、未知标签、@ 规则、伪元素、CSS 资源 URL、动态变量会明确报错。它不是微信样式支持全集，第二阶段必须保留来源诊断。未验证其它系统、浏览器、长文章与暗色真机效果。

上游固定依赖安装的 npm audit 报告有 10 项已知依赖告警（2 moderate / 7 high / 1 critical，含开发工具）。未使用强制升级改变已验证上游；在接入用户来源前应逐项评估并对更新版本重新验证。应用自身安装时 audit 为 0。

## 人工验收步骤

1. 打开本地首页，生成样例并确认检测指纹。
2. 点击复制，在公众号后台手动粘贴，检查标题边框、4 个段落、引用背景、留白和文字是否一致。
3. 保存草稿，使用手机预览检查换行、截断及暗色效果。
4. 记录浏览器、手机系统/型号、日期、正文指纹与差异。结果未确认时保持待验证。

按用户最新要求，本次只交付代码和自动化功能测试，公众号实测与后续浏览器模拟不再执行。阶段 1 在调整后的范围内完成；以上浏览器记录仅保留已发生的历史证据，不能代表公众号兼容性承诺。下一阶段计划见 [参考分析计划](../superpowers/plans/2026-09-14-reference-analysis.md)。
