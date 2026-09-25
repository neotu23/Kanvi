# 第七阶段验证报告：主题 skill 与 AI 直出 HTML

日期：2026-09-24。范围：固定 gzh-beautify skill、种子主题库、主题契约与 lint 接入、主题工厂草案确认、AI 直出 HTML 渲染内核与双校验、CLI 与 `/styles` 界面。

## 已执行的证据

| 项目 | 命令 | 结果 |
|---|---|---|
| 上游版本 | `npm run check:upstream` | 通过，wechat-spec `fa69e373…`，gzh-beautify-skill `9accaf50…` |
| 种子主题库 lint | `python3 vendor/gzh-beautify-skill/scripts/lint_theme.py themes` | 6/6 OK，ERROR×0 WARN×0 |
| 集成验证 | `npm run verify:themes` | 见下 |
| 自动测试 | `npm test` | 22 个文件、149 项通过 |
| 类型检查 | `npm run typecheck` | 通过 |
| 生产构建 | `npm run build` | 通过，新增 `/styles` 与 `/api/themes*` 路由 |
| 冻结链路 | `npm run verify:integration`/`templates`/`articles` 相关测试 | 未改动，测试数与行为保持 |

### `npm run verify:themes` 产出

- 种子库：6 套主题可读，来源记录绑定固定提交 `9accaf5039f29aade5d8ca315739b42845b11225`。
- 整库 lint：ERROR×0 WARN×0。
- 受控渲染（自写 Markdown + 受控模型响应 + 真实脚本 + 真实官方检查器）：
  - skill 校验 `validate_article.py --strict`：0 ERROR / 0 WARN；
  - 官方检查器：`passed`，checker commit `fa69e37341c86bfec4c8c533845910511e534c0c`；
  - 原文保真：通过；`added` 仅 `01`、`·`、`·`（章节编号与列表符号，属主题骨架允许的结构性新增）；
  - 记录状态：`rule-passed`，正文哈希 `d093a497…`。
- 改写原文的对照产物：状态 `needs-fix`，保真门禁报出缺失片段。
- 主题工厂（受控响应 + 真实 lint）：草案 lint 通过 → 确认入库为 `generated` 来源；丢弃路径单独验证。
- 重启读取：新仓库实例读取同一条记录，状态仍为 `rule-passed`。

## 受控与真实的边界

- 真实执行：上游 `lint_theme.py`、`validate_article.py`（固定 commit）、官方 wechat-spec 检查器（真实 Chrome）、文件与 Git 操作。
- 受控：所有模型响应都是受控 fixture，用于固定结构与失败路径。
- **未执行**：真实 DeepSeek 调用（本机未配置 Key，也未做收费请求）、真实公众号粘贴与手机预览、浏览器交互模拟。因此不声明任何公众号实测结论。

## 已知限制

1. 官方检查器对同行行内强调存在行距误报（第四阶段已知）。本阶段产物以 `underline_css` 下划线为主，受控样例未触发；含 `<strong>` 的样例若命中该规则仍会停在“需要修正”，程序保留原文与原始诊断，不自动删强调或扩行高。
2. 图片按原文 `src` 渲染，不编造图床 URL；本地相对路径需要在公众号内重新上传，界面与报告都会提示。
3. 主题预览页来自主题包 `preview.html`：写入与返回时都剥离 `<script>`、事件属性与可执行 URL；预览页本身不是公众号交付物。
4. 发送给模型的文章上限 60 KiB，超过直接报错，不截断后声称已发送完整内容；Markdown 文件本身仍以 256 KiB / 20 万字符为上限。
5. 运行时依赖本机 `python3`（实测 3.9.6 可用）；缺失时相关校验明确报错，不显示通过。`KANVI_PYTHON` 可指定解释器。
6. 主题工厂分两次模型调用（主题三件套与预览页），单次输出预算 8000 tokens；未用真实模型验证过超长主题的完整产出。
7. 种子 6 套主题是上游 MIT 示例，按用户决定复制为初始库并标注来源；可删除，可由 `npm run theme:seed` 从固定版本恢复。

## 数据与文件

- 提交进 Git：`themes/<id>/`（6 套种子 + `SOURCE.json`/`SOURCE.md`）、`src/features/themes/**`、`scripts/*theme*.ts`、`tests/*.test.ts`、文档与 `docs/upstream-lock.json`。
- 不提交：`vendor/`、`data/theme-drafts/`、`data/renders/`、`artifacts/`、`.reasonix/`。
- 每个主题包与每条渲染记录都带内容哈希；渲染记录保存主题快照（`theme.json` + `THEME.md`），因此删除主题后历史仍可读、可复算校验。

## 追加验证：本地数据路径与备份恢复（2026-09-24）

| 项目 | 命令 | 结果 |
|---|---|---|
| CLI 导出 | `npm run theme:backup` | 6 套主题 + 0 条渲染记录导出成功，内容指纹 `b60b3d60…`，文件约 224 KB；不含草案、artifacts、vendor 与密钥 |
| CLI 恢复 | `npm run theme:restore -- --in <备份.json>` | 全部条目按“已存在”跳过，未覆盖本机现状 |
| 自动测试 | `npx vitest run tests/backup.test.ts` | 4 项通过：导出/恢复往返、结构指纹与 id 校验、密钥拦截、接口本机限制与路径展示 |
| 类型检查 | `npm run typecheck` | 通过 |

覆盖与边界：

- 备份内容：主题包三件套 + `SOURCE.json`/`SOURCE.md`，以及渲染记录 `record.json` 与 `result/report.json`。
- 不包含：待确认草案（`data/theme-drafts/`）、`artifacts/`、`vendor/`、冻结链路的 `data/`、任何密钥。
- 导出前断言：若备份文本包含本机 `DEEPSEEK_API_KEY` 的值，直接拒绝导出（测试用过故意注入的假 Key 验证）。
- 恢复是“只新增”：已存在的主题或历史被跳过并计数；主题包与记录都先写临时目录再原子改名，不覆盖既有数据。
- 导入校验：`app` 标记与版本、时间、主题/记录数量上限、`theme.json` 契约、来源记录、主题 id 与记录 UUID 格式、内容指纹一致性；任一项不符即 422，不落盘。
- 未验证：真实 DeepSeek 调用、公众号实测、超大备份（接近 64 MiB）的实际导入表现仍未测试。
