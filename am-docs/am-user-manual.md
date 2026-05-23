# agents-memory 用户使用手册

本文面向普通用户和项目负责人。后续如果新增功能、调整命令、改变配置路径或修改使用流程，必须同步更新本文和 `am-docs/am-developer-guide.md`。

## agents-memory 是什么

`agents-memory` 是一个本地优先的 AI Agent 记忆工具，用来帮助 Codex、Claude、Cursor 等 agent 在多个会话之间共享项目知识，并减少上下文压缩后丢失任务状态的问题。

它主要解决三件事：

- 当前会话变长或压缩后，关键任务状态还能恢复。
- 新开会话后，agent 能读取项目级知识，而不是重新从零了解项目。
- 多个 agent 能共享同一套全局偏好、项目规则和历史索引。

## 当前实施路径

当前开发和验证使用：

```text
代码路径：E:\workspace\local\AgentsMemory
数据路径：E:\work\AM-data
设计资料路径：E:\work\项目\agents-memory
```

正式产品中，数据路径可以由用户自行配置。优先级：

1. 命令参数：`--am-data-root <path>`
2. 环境变量：`AM_DATA_ROOT`
3. 用户配置：`~/.agents-memory/am-config.toml`
4. 默认路径：`E:\work\AM-data`

## 快速开始

进入代码目录：

```powershell
cd E:\workspace\local\AgentsMemory
```

初始化数据目录：

```powershell
node am-src/am-cli.mjs init --am-data-root E:\work\AM-data
```

注册项目：

```powershell
node am-src/am-cli.mjs register-project --am-data-root E:\work\AM-data --id sdcr --root E:\workspace\company_jz\sdcr
```

创建 session：

```powershell
node am-src/am-cli.mjs start-session --am-data-root E:\work\AM-data --project sdcr --agent codex
```

保存 checkpoint：

```powershell
node am-src/am-cli.mjs checkpoint --am-data-root E:\work\AM-data --project sdcr --session <session-id> --reason pre-compact --state "当前任务状态"
```

读取上下文：

```powershell
node am-src/am-cli.mjs get-context --am-data-root E:\work\AM-data --project sdcr --session <session-id> --query "我要处理的问题"
```

## 常用命令

```powershell
node am-src/am-cli.mjs doctor --am-data-root E:\work\AM-data --project sdcr
node am-src/am-cli.mjs search --am-data-root E:\work\AM-data --project sdcr --scope project --query "关键词"
node am-src/am-cli.mjs promote --am-data-root E:\work\AM-data --project sdcr --session <session-id>
node am-src/am-cli.mjs rebuild-index --am-data-root E:\work\AM-data --project sdcr
```

## 安装规则入口

可以给不同 agent 的规则文件追加 agents-memory 托管块：

```powershell
node am-src/am-cli.mjs install-rules --am-data-root E:\work\AM-data --target codex --project sdcr --root E:\workspace\company_jz\sdcr
node am-src/am-cli.mjs install-rules --am-data-root E:\work\AM-data --target claude --project sdcr --root E:\workspace\company_jz\sdcr
node am-src/am-cli.mjs install-rules --am-data-root E:\work\AM-data --target cursor --project sdcr --root E:\workspace\company_jz\sdcr
```

对应文件：

- Codex：`AGENTS.md`
- Claude Code：`CLAUDE.md`
- Cursor：`.cursorrules`

如果这些文件已经存在，agents-memory 只会在末尾追加托管块，不会修改、重排或覆盖原内容。追加前会备份到 `am-backups`。

查看项目活跃任务：

```powershell
node am-src/am-cli.mjs active list --am-data-root E:\work\AM-data --project sdcr
```

## 数据存在哪里

默认数据结构：

```text
E:\work\AM-data\
  am-config.toml
  am-global\
  am-projects\
  am-secrets\
  am-locks\
```

项目数据在：

```text
E:\work\AM-data\am-projects\<project-id>\
```

session 状态在：

```text
E:\work\AM-data\am-projects\<project-id>\am-sessions\<session-id>\
```

## 多 agent 并行工作

agents-memory 不应该用一个项目级 hot 文件代表唯一当前任务。多个 agent 同时处理不同工作目录或不同任务时，每个 agent/session/task/worktree 都应该有自己的 session hot：

```text
E:\work\AM-data\am-projects\<project-id>\am-sessions\<session-id>\am-session.md
```

项目级只维护一个活跃任务索引，后续会提供：

```powershell
node am-src/am-cli.mjs active list --project <project-id>
node am-src/am-cli.mjs active update --project <project-id> --session <session-id>
node am-src/am-cli.mjs active complete --project <project-id> --session <session-id>
```

这样新 agent 可以先看项目里有哪些活跃任务，再决定读取哪个 session hot；任务完成后再把结果 `promote` 到项目 warm/cold。

## 敏感信息

敏感信息应放在 `am-secrets` 中。普通记忆里只能保存 `secret_ref`，不要保存真实密码、token、cookie、密钥等明文。

常用命令：

```powershell
node am-src/am-cli.mjs secret get --am-data-root E:\work\AM-data --ref sdcr.mysql.dev
node am-src/am-cli.mjs secret set --am-data-root E:\work\AM-data --ref sdcr.mysql.dev --value "..."
node am-src/am-cli.mjs secret list --am-data-root E:\work\AM-data --prefix sdcr
node am-src/am-cli.mjs secret update --am-data-root E:\work\AM-data --ref sdcr.mysql.dev --value "..."
node am-src/am-cli.mjs secret remove --am-data-root E:\work\AM-data --ref sdcr.mysql.dev
```

## 故障排查

检查环境：

```powershell
node am-src/am-cli.mjs doctor --am-data-root E:\work\AM-data --project <project-id>
```

重建索引：

```powershell
node am-src/am-cli.mjs rebuild-index --am-data-root E:\work\AM-data --project <project-id>
```

如果 `doctor` 显示 `sqlite_fts5` 不可用，工具会降级使用普通 SQLite 或文件扫描，功能仍可用，只是搜索性能可能降低。

如果 `doctor` 显示 `ripgrep` 可用，`search` 会优先用它检索记忆源文件。`ripgrep` 对文件路径、命令、报错、API 名、配置键等精确内容通常比向量 RAG 更可靠；后续即使增加向量检索，也只会作为辅助召回，而不是替代精确检索。

要看更详细的命中情况，可以加 `--debug`：

```powershell
node am-src/am-cli.mjs search --am-data-root E:\work\AM-data --project sdcr --scope project --query "关键词" --debug
```

## 迁移旧记忆

v1 完成后会提供旧记忆迁移命令，用于把当前已有的 hot/warm/cold Markdown 记忆导入 agents-memory 新结构。

规划命令：

```powershell
node am-src/am-cli.mjs migrate legacy --am-data-root E:\work\AM-data --project sdcr --session imported-legacy --hot <hot.md> --warm <warm.md> --cold <cold.md>
```

也可以先 dry-run：

```powershell
node am-src/am-cli.mjs migrate legacy --am-data-root E:\work\AM-data --project sdcr --session imported-legacy --hot <hot.md> --warm <warm.md> --cold <cold.md> --dry-run
```

迁移原则：

- 旧文件只读，不会修改、移动或删除。
- 迁移前可以用 `--dry-run` 查看计划。
- hot 会进入 session 状态和 checkpoint。
- warm 会进入项目稳定记忆。
- cold 会进入追加式历史事件。
- 迁移后会重建索引。
- 迁移报告会写入 `am-migration-report.md`。
- 疑似密码、token、cookie、密钥等敏感信息不会自动导入普通记忆。
- checkpoint 也支持从 `--state-file` 或标准输入读取长文本，避免 PowerShell 转义问题。
- `doc-check` 用来检查 README、开发说明、用户手册和 roadmap 是否同步了关键命令和策略。

```powershell
node am-src/am-cli.mjs doc-check
```

## 当前限制

- 当前仍是 v1 原型。
- MCP server 还只是最小 stdio 骨架。
- Secret Vault 还不完整。
- 旧记忆迁移命令尚未实现，已列入 v1 完成后的必要交付项。
- PowerShell 命令行传长文本不方便，后续会支持从 stdin 读取 checkpoint。
- v1 不做云同步和团队同步。
