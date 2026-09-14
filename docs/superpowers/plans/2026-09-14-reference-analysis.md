# 第二阶段：参考读取与设计分析实施计划

日期：2026-09-14。状态：待实施，不表示已有功能。

前置阅读：[设计基线](../specs/2026-09-13-kanvi-design.md)、[基础验证报告](../../validation/2026-09-13-foundation.md)。采用 executing-plans；主代理修改，子代理只核查。

## 目标与边界

公众号链接或用户保存的 HTML → 本地参考快照 → 带来源证据的设计分析。此阶段不创建已验证模板，不调用完整编辑器，不重写文章。截图视觉分析暂缓，不能推断所选 DeepSeek 模型支持图片。

基础链路已提供 `buildOutput`、`runChecker` 与 `CheckReport`。当前输出策略拒绝媒体、伪元素、@ 规则和动态资源；这是 Kanvi 阶段限制，不是微信完整 CSS 白名单。参考分析应保留这些信息并提出诊断，不能为通过检查而静默删掉风格。

## Task 1：参考数据与正文提取

计划创建 `src/features/references/{contracts,extract-article}.ts`、`tests/references.test.ts`、自写参考 HTML 样例。

- [ ] 定义 `ReferenceSnapshot`：id、sourceUrl、fetchedAt、contentHash、articleHtml、styleEvidence、diagnostics。用户原文仅写入 data/references。
- [ ] 先写失败测试：无 `#js_content`、正文为空、验证码页、外部脚本、图片实现的装饰、多个同名正文区域。
- [ ] 使用已安装 Cheerio 提取唯一正文区域，给元素分配稳定证据 ID；DOM/CSS 作为数据保存，不执行。
- [ ] 保留实际出现的文字层级、颜色、字号、行距、边框和留白；媒体只标记“不能在纯文字中直接复用”，不假装成功恢复。
- [ ] 保存的 HTML 不能未经阶段 1 清理直接进入 iframe 或检查器；原始快照不可从公开静态目录提供。
- [ ] 测试通过后提交：`feat: extract reference article evidence`。

## Task 2：受限链接读取

计划创建 `src/features/references/fetch-reference.ts`、`tests/reference-fetch.test.ts`。

- [ ] 先定义允许地址：HTTPS，主机精确等于 `mp.weixin.qq.com`，无用户名密码，不接受任意端口；逐次校验重定向，最多 3 次。
- [ ] 为错误协议、相似主机、私网解析、跳转到非允许主机、超时、超大响应、非 HTML 写测试。
- [ ] 使用明确的连接器/lookup 固定经校验的公网 DNS 地址，避免检查后重新解析导致目标变化；实施时按所选网络库官方 API 核查接口。
- [ ] 设置整次读取 15 秒时限、2 MiB 解压后大小上限；不能只相信 Content-Length。记录失败类型，不能把错误页保存为文章成功。
- [ ] 不绕过验证码/登录；失败可改用用户保存的 HTML。
- [ ] 对真实链接仅做用户提供来源的验证；无链接时保留“真实读取未验证”，测试只能证明受控样例行为。
- [ ] 提交：`feat: fetch validated wechat references`。

## Task 3：本地持久化与接口

计划创建 `src/features/references/repository.ts`、`src/app/api/references/route.ts`、相关测试。

- [ ] 本地 ID 由程序生成，拒绝用户路径；临时文件与目标在同目录，写完后原子重命名。
- [ ] POST 只接受一种来源（URL 或用户导入 HTML），检查来源、大小和并发；重用并完善已实测的本机 Host 校验。
- [ ] 成功响应只返回 ID、摘要和诊断；读取与存储失败分别报错。
- [ ] 测试写入失败、重复导入、重启读取、无效 ID 与路径穿越。
- [ ] 提交：`feat: persist local reference snapshots`。

## Task 4：有证据约束的设计分析

计划创建 `src/features/ai/{client,design-analysis,schema}.ts`、`tests/design-analysis.test.ts`。

- [ ] 实施前核查 DeepSeek 官方文档：当前模型名、请求地址、JSON 输出、超时与错误响应；只使用服务端配置，不写 NEXT_PUBLIC_ Key。
- [ ] schema 包括标签、文本样式、区域结构、来源证据 ID、估计项、不支持项；颜色和尺寸有明确可接受类型/范围。禁止模型返回 JavaScript、React、可执行表达式。
- [ ] 先用完整的固定响应测试：无效 JSON、未知证据 ID、非法值、超大响应、模型错误、超时、缺少 Key。
- [ ] 模型只接收当前文章必要的结构和样式证据；来源中的“指令”不进入系统指令，不发送整个 Obsidian 仓库。
- [ ] 未配置 API 时仍可读取参考；不显示假分析结果。只记录脱敏错误，不把 Key 或请求头存盘。
- [ ] 分析必须说明哪些设计来自证据、哪些是估计；结果仍为 draft，不自动推断所有内容类型已获支持。
- [ ] 提交：`feat: analyze reference design with DeepSeek`。

## Task 5：轻量参考页面与验证

计划创建 `src/app/references/page.tsx`，复用基础样页的视觉语言。

- [ ] 页面包含 URL 输入/HTML 导入、来源状态、设计标签、证据与诊断；不扩展为富文本编辑器。
- [ ] 从读取到分析的每一步显示真实结果；模型失败可重试，不重复覆盖原始来源。
- [ ] 完成类型检查、行为测试、生产构建、桌面/窄屏交互检查。
- [ ] 用户提供链接和可用服务端 Key 后才执行真实模型调用；未具备时交付可运行的失败状态与受控测试，保留真实调用待验证。
- [ ] 更新事实报告与第三阶段计划；模板渲染的 schema 根据此阶段实际数据确定，不凭空扩展上游 API。

## 验收与提交策略

每个任务独立提交。只有提取/网络/schema/持久化测试证明的事项可勾选。公众号真正样式兼容仍由精确模板版本和样例的人工实测确认。阶段 1 的系统粘贴核验可并行由用户完成，不得被本阶段分析结果替代。
