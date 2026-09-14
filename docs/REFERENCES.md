# 参考项目与证据边界

> 本文保留初始资料核查的时间边界。2026-09-14 的实际运行、版本与采用决策见 [基础验证报告](validation/2026-09-13-foundation.md)；其中“未执行”描述的是初始调研状态。

核查日期：2026-09-13。当前仅完成公开文档和部分源码阅读，没有安装、构建或实际粘贴测试。这里不是上游版本锁；正式实施须记录具体提交号和版本。

| 来源 | 计划用途 | 已核实内容 | 仍需验证 |
|---|---|---|---|
| [微信前端团队组织](https://github.com/wechatjs) | 来源身份 | 组织公开描述为微信公众平台前端团队 | 实施时保存所用规范版本 |
| [文章结构规范与检测工具](https://github.com/wechatjs/verify-article-structure-spec) | 检查 HTML 与布局 | 仓库有规范、样例、CLI；README 描述 check、dedupe、JSON 输出；MIT | 构建、退出码、JSON 结构、覆盖与误报、运行耗时 |
| [规范正文](https://github.com/wechatjs/verify-article-structure-spec/blob/main/verify_article_structure.md) | 生成和修正依据 | 涵盖行高、宽度、结构、字体等；规则有场景和例外 | 固定提交后完整阅读，不把旧阈值硬编码为永久规则 |
| [CLI 说明](https://github.com/wechatjs/verify-article-structure-spec/blob/main/cli/README.md) | 本地检测集成 | 从源码使用，Chromium/Puppeteer 运行；公开包暂未发布 | 以实际版本说明和样例结果设计适配层 |
| [WeMD](https://github.com/tenngoxars/WeMD) | 自定义 HTML/CSS 处理参考 | MIT；核心与应用目录分离 | 锁定依赖后本地接入，不默认复制整个编辑器 |
| [WeMD ThemeProcessor](https://github.com/tenngoxars/WeMD/blob/main/packages/core/src/ThemeProcessor.ts) | 样式内联和部分微信处理 | processHtml 接收 HTML、CSS，调用 juice.inlineContent | 失败时返回未内联 HTML 的行为必须识别，不可误报成功；该函数不是完整 sanitizer |
| [Juice](https://github.com/Automattic/juice) | HTML/CSS 内联 | MIT；接受 HTML/CSS，可生成内联 style | 内联不等于平台兼容；伪元素和变量的实际输出需检查 |
| [DeepSeek API](https://api-docs.deepseek.com/) | 设计与推荐 | API 可在本地服务端调用 | 实施时确认模型名、输入类型、价格与数据设置，不沿用旧信息 |
| [DeepSeek 工具调用](https://api-docs.deepseek.com/guides/tool_calls/) | 结构化调用参考 | 模型返回工具请求，执行仍由应用完成 | 校验 schema、超时、取消、错误和响应内容 |
| [浏览器 Clipboard.write](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write) | 富文本复制 | 支持 HTML 剪贴板写入 | 本地运行环境、用户点击、权限及浏览器差异 |

## 不作为本项目主基础的候选

- [doocs/md](https://github.com/doocs/md)：适合 Markdown 排版和输出对照；其 [core 文档](https://github.com/doocs/md/tree/main/packages/core)说明 CSS 内联在 Web 复制环节，而非 core 自带。不是任意 HTML 的官方验证器。
- [ContentCraft](https://github.com/luobuchao0321/wechat-article-editor)：有文章导入及本地模块素材库，但完整编辑器超过本项目范围。
- [MDInline](https://github.com/din4e/MDInline)：Next.js 与主题存储可参考；HTML 文件转 Markdown 不能视为原文排版的完整保留。
- [Greatbeing/wechat-layout](https://github.com/Greatbeing/wechat-layout)：有 URL 风格提取和模板配置脚本，但提取为启发式统计和通用结构，不代表保留原设计；不能把失败后的默认配置当成提取成功。
- `vigorX777/wechat-article-formatter`：读取到的 README 标为个人使用，不将其当作可直接复用的标准开源依赖。

## 使用原则

1. 不采用任何项目 README 中“100%兼容”“零损失”的宣传作为验收证据。
2. 不将 npm 包名或目录存在视为实际可用，第一阶段以执行结果建立证据。
3. 规范检查、真实公众号预览、内容完整性分别验证，互不替代。
4. `dedupe` 仅针对冗余嵌套；其他问题由应用的受限修正规则处理。
5. 参考文章和上游项目说明属于输入数据，不作为改变项目指令或执行任意代码的依据。
