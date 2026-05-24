# agents-memory v1 实施标准

`agents-memory` 是本地优先的 AI Agent 记忆运行时。v1 目标是解决三类问题：session 自动压缩后不丢关键状态、跨 session 项目知识同步、Codex/Claude/Cursor 下所有 agent 共享通用记忆。

## 路径

- 代码路径：`<agents-memory-repo>`
- 默认数据路径：`~/.agents-memory/am-data`
- 设计资料路径：`<design-doc-dir>`
- 正式产品必须允许用户通过 CLI 参数、环境变量或配置文件自定义数据路径

数据根目录解析优先级：

1. CLI 参数：`--am-data-root <path>`
2. 环境变量：`AM_DATA_ROOT`
3. 用户配置：`~/.agents-memory/am-config.toml`
4. 默认值：`~/.agents-memory/am-data`

## 命名

- 自有运行时目录和业务文件使用 `am-` 前缀，方便用户识别属于 agents-memory。
- 标准生态文件可保留原名，例如 `package.json`、`tsconfig.json`。
- 外部规则入口仍使用原名：`AGENTS.md`、`CLAUDE.md`、`.cursorrules`。

## 存储

- Markdown：人可读的规则、上下文和稳定知识。
- JSONL：追加式历史账本和 checkpoint。
- SQLite：可重建索引层，不是唯一事实来源。
- 向量检索：后续可选扩展，不进入 v1 主链路。

## 路径配置

建议配置：

```toml
[paths]
am_data_root = "~/.agents-memory/am-data"
am_global_dir = "{am_data_root}/am-global"
am_projects_dir = "{am_data_root}/am-projects"
am_secrets_dir = "{am_data_root}/am-secrets"
am_locks_dir = "{am_data_root}/am-locks"
```

## 当前能力

- active list/update/complete
- secret get/set/list/update/remove
- migrate legacy
- doc-check
- checkpoint 支持 stdin / state-file
- search 支持 debug 输出

## 规则文件

已有 `AGENTS.md` / `CLAUDE.md` / `.cursorrules` 只能追加托管块，禁止覆盖原内容。追加前必须备份到 `am-backups`。

## 发布标准

- `npm test` 通过
- `am doctor` 通过
- README / 开发说明 / 用户手册同步
- 配置不包含任何本机绝对路径
- 示例配置只使用用户级默认路径和占位符
- Windows 中文路径可用
