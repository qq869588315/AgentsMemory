# agents-memory 开发说明

本文面向后续接手的 agent 开发人员和人工开发者。后续如果新增功能、调整命令、修改数据结构或路径策略，必须同步更新本文件和 `am-docs/am-user-manual.md`。

## 项目定位

`agents-memory` 是一个本地优先的 AI Agent 记忆运行时，用来解决：
- session 自动压缩后丢失关键状态
- 跨 session 项目知识不同步
- 整个 Codex/Claude/Cursor 下所有 agent 无法共享通用记忆

## 配置约定

正式产品不允许硬编码任何本地绝对路径。路径配置优先级如下：

1. CLI 参数：`--am-data-root <path>`
2. 环境变量：`AM_DATA_ROOT`
3. 用户配置文件：`~/.agents-memory/am-config.toml`
4. 默认值：`~/.agents-memory/am-data`

建议在用户配置文件里维护这些键：

```toml
[paths]
am_data_root = "~/.agents-memory/am-data"
am_global_dir = "{am_data_root}/am-global"
am_projects_dir = "{am_data_root}/am-projects"
am_secrets_dir = "{am_data_root}/am-secrets"
am_locks_dir = "{am_data_root}/am-locks"
```

## 当前代码结构

```text
am-src/
  am-core.mjs
  am-cli.mjs
  am-mcp-server.mjs
am-tests/
  am-smoke-test.mjs
am-docs/
  am-architecture.md
  am-implementation-standard.md
  am-roadmap.md
  am-developer-guide.md
  am-user-manual.md
am-config.example.toml
```

## 核心模块职责

### Memory Gateway

CLI 和 MCP server 都只是入口层，新增命令时必须复用 `am-core` 的同一套函数，不能复制业务逻辑。

### Memory Kernel

`am-core.mjs` 负责：
- 路径解析
- TOML-like 配置解析
- 项目注册
- session 创建
- checkpoint 写入
- promote 晋升
- search 检索
- rule file 追加
- doctor 检查
- secret vault
- legacy migration
- `ripgrep` 优先检索和 SQLite/file fallback 协调

### 规则文件写入

对已有 `AGENTS.md` / `CLAUDE.md` / `.cursorrules`：
- 只追加托管块
- 不修改、不重排、不覆盖原文
- 追加前必须备份到 `am-backups`
- 已有托管块存在时，v1 仍继续追加新块，不自动替换旧块

### 迁移器

`am migrate legacy` 负责把旧 hot/warm/cold Markdown 迁入新结构：
- hot -> session state
- warm -> project warm memory
- cold -> project cold events
- 迁移前建议 dry-run
- 遇到疑似敏感信息要跳过普通记忆导入

## 开发要求

- 不要把推理过程、完整聊天、大段日志写入普通记忆。
- 普通记忆只保留 `secret_ref`，不保留明文密钥。
- JSONL 只能追加，不能覆盖历史。
- Markdown 写入必须 UTF-8。
- 修改任何写入规则前，先跑 smoke test。
- 修改 CLI/MCP 参数或输出时，必须同步更新用户手册。

## 发版前检查

- `npm test` 通过
- `am doctor` 在目标数据目录下通过
- README、开发说明、用户手册同步
- 路径默认值不包含本机绝对路径
- 示例配置只使用用户级默认路径和占位符
- Windows 中文路径可用
