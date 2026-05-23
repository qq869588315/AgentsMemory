# agents-memory 后续工作任务

本文用于跟踪从 v1 原型到可上线、可开源产品的后续工作。每次新增功能、修改 CLI/MCP 行为、调整路径/数据结构或改变规则文件策略时，必须同步更新：

- `am-docs/am-developer-guide.md`
- `am-docs/am-user-manual.md`
- 如涉及架构或实施标准，还要同步更新 `am-docs/am-architecture.md` 和 `am-docs/am-implementation-standard.md`

## 里程碑 1：工程化整理

- 建立正式 TypeScript 源码结构，把当前 `.mjs` 原型迁移到可编译的 `.ts`。
- 增加 lint、format、typecheck、test 脚本。
- 保留标准生态文件名，例如 `package.json`、`tsconfig.json`；自有目录和业务文件继续使用 `am-` 前缀。
- 明确 Node 版本、发布包入口、bin 命令和 MCP server 启动命令。
- 增加 Git 仓库初始化、`.gitignore`、LICENSE、CHANGELOG。

## 里程碑 2：CLI 完整化

- 完善 `am init`，支持创建用户配置 `~/.agents-memory/am-config.toml`。
- 完善 `am register-project`，支持重复注册检测和只追加历史事件。
- 增加项目级 `am-active.json`，用于索引当前活跃 session/task/worktree；禁止再把项目级 hot 当作唯一当前任务。
- 完善 `am start-session`，生成语义化 session id，并把 session 注册到 `am-active.json`。
- 增加 `am active list/update/complete`，用于查看、更新和完成活跃任务索引。
- 完善 `am install-rules`，支持 Codex、Claude、Cursor 三类规则入口。
- 完善 `am checkpoint`，支持从 stdin 读取 state，避免长文本命令行转义问题。
- 完善 `am promote`，增加人工确认模式和 dry-run 模式。
- 完善 `am rebuild-index`，支持 global/project/session 作用域。
- 完善 `am search`，形成确定性读取 + `ripgrep` + SQLite FTS/LIKE + 文件扫描的稳定检索链路。
- 增加 `am doc-check`，用来校验 README、开发说明、用户手册、roadmap 的关键命令同步。

## 里程碑 3：MCP Server 可用化

- 按 MCP 协议补齐工具 schema、错误结构和能力描述。
- 提供 Codex、Claude、Cursor 的 MCP 配置示例。
- 保证 MCP 与 CLI 调用同一套核心逻辑。
- 增加 MCP smoke test，覆盖 `am.get_context`、`am.checkpoint`、`am.search`、`am.active_*`、`am.secret_*`。

## 里程碑 4：存储与并发加固

- 把锁机制完善为项目级短锁和 Secret 独占锁。
- 为 `am-active.json` 增加短锁和原子替换，避免并发 agent 更新活跃任务索引时丢条目。
- 增加 stale lock 检测和安全提示。
- 增加 JSONL 事件 schema 校验。
- 增加索引重建和索引损坏恢复测试。
- 在没有 FTS5 的 Windows sqlite 环境下保证 fallback 检索稳定。
- 在没有 `ripgrep` 的环境下保证 SQLite/file fallback 检索稳定。

## 里程碑 4.5：检索质量治理

- 把 `doctor` 的 `ripgrep`、`sqlite3`、`sqlite_fts5` 能力检查纳入验收。
- 增加 search fixture，覆盖路径、命令、错误文本、中文关键词和 session id。
- 增加检索结果去重和预算裁剪测试，避免 Context Pack 被大量历史命中挤满。
- 评估可选向量召回插件，但 v1 默认仍坚持词法检索优先。
- 增加人工可解释的 search debug 输出，显示命中来源、后端和裁剪原因。

## 里程碑 5：规则文件治理

- 确保已有 `AGENTS.md`、`CLAUDE.md`、`.cursorrules` 只追加托管块。
- 追加前总是备份到 `am-backups`。
- 提供 `--dry-run` 预览追加内容。
- 提供 `am doctor` 检测重复托管块，但 v1 不自动删除用户文件内容。

## 里程碑 6：Secret Vault

- 定义 `am-secrets.local.json` schema。
- 增加 `am secret set/get/list`。
- 普通记忆只允许保存 `secret_ref`。
- 用户手册必须明确说明本地 Secret 文件的明文风险和备份建议。

## 里程碑 7：测试与验收

- 覆盖 Windows 中文路径。
- 覆盖数据路径自定义优先级：CLI 参数、环境变量、用户配置、默认值。
- 覆盖并发 checkpoint。
- 覆盖规则文件只追加不覆盖。
- 覆盖删除索引后重建。
- 覆盖无 sqlite、无 FTS5 的降级路径。
- 覆盖 `doc-check` 与文档同步约束。

## 里程碑 8：旧记忆迁移

- 增加 `am migrate legacy` 命令，用于把现有 hot/warm/cold Markdown 记忆迁移到 agents-memory 数据结构。
- 迁移必须只读取旧文件，不修改、不移动、不删除旧文件。
- 支持通过参数指定旧文件路径：`--hot`、`--warm`、`--cold`、`--project`、`--session`。
- hot 迁移到指定 session 的 `am-session.md` 和 `am-checkpoints.jsonl`。
- warm 迁移到项目 `am-memory/am-warm.md`。
- cold 迁移为 `am-memory/am-cold.events.jsonl` 中的 `legacy_import` 事件，同时保留来源路径。
- 迁移完成后自动执行 `am rebuild-index`。
- 提供 `--dry-run`，先展示迁移计划和目标文件，不写入。
- 提供迁移报告 `am-migration-report.md`，记录源文件、目标文件、导入时间、条目数量和跳过原因。

## 里程碑 9：开源发布准备

- 完善 README、开发说明、用户手册。
- 增加 MIT LICENSE。
- 增加贡献指南和 issue 模板。
- 增加版本发布 checklist。
- 发布前运行完整测试，并记录当前已知限制。

## 当前已知限制

- 当前实现还是 Node ESM 原型，不是最终 TypeScript 工程形态。
- MCP server 是最小 stdio 骨架，还未补完整工具 schema。
- 本机缺少 `ripgrep` 或 sqlite3 不支持 FTS5 时会降级为普通 SQLite 和文件扫描。
- Secret Vault 当前只实现 `get`，还未实现 `set/list`。
- `checkpoint --state` 长文本在 PowerShell 中有转义限制，后续应支持 stdin 或 `--state-file`。
