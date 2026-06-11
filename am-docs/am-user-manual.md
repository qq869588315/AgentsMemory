# agents-memory 用户使用手册

本文面向普通用户和项目负责人。后续如果新增功能、调整命令、修改配置路径或使用流程，必须同步更新本文件和 `am-docs/am-developer-guide.md`。

## agents-memory 是什么

`agents-memory` 是一个本地优先的 AI Agent 记忆工具，用来帮助 Codex、Claude、Cursor 等 agent 在多个会话之间共享项目知识，并减少上下文压缩后丢失任务状态的问题。

## 配置方式

正式产品支持三层路径配置，优先级如下：

1. CLI 参数：`--am-data-root <path>`
2. 环境变量：`AM_DATA_ROOT`
3. 用户配置文件：`~/.agents-memory/am-config.toml`
4. 默认值：`~/.agents-memory/am-data`

推荐先编辑用户配置文件，或在首次初始化时使用默认位置。

示例配置：

```toml
[paths]
am_data_root = "~/.agents-memory/am-data"
am_global_dir = "{am_data_root}/am-global"
am_projects_dir = "{am_data_root}/am-projects"
am_secrets_dir = "{am_data_root}/am-secrets"
am_locks_dir = "{am_data_root}/am-locks"
```

## 快速开始

```powershell
cd <agents-memory-repo>
am init
am register-project --id <project-id> --root <project-root>
am start-session --project <project-id> --agent codex
am checkpoint --project <project-id> --session <session-id> --reason pre-compact --state "当前任务状态"
am get-context --project <project-id> --session <session-id> --query "我要处理的问题" --profile lean
```

## 上下文档位

`am get-context` 支持 `--profile lean|normal|deep` 来控制注入上下文的长度。

- `lean`：省 token 模式，默认 3 条检索命中，跳过完整 warm memory，只保留短规则、active 摘要和 session 状态。
- `normal`：折中模式，默认 5 条检索命中，保留较短 warm memory。
- `deep`：完整模式，也是默认值，保持原有上下文预算和默认 8 条检索命中。

仍然可以用 `--limit <n>` 覆盖检索命中数量，例如：

```powershell
am get-context --project <project-id> --session <session-id> --query "登录失败" --profile lean --limit 3
```

## 常用命令

```powershell
am doctor --project <project-id>
am search --project <project-id> --scope project --query "关键词"
am promote --project <project-id> --session <session-id>
am rebuild-index --project <project-id>
```

## 安装规则入口

```powershell
am install-rules --target codex --project <project-id> --root <project-root>
am install-rules --target claude --project <project-id> --root <project-root>
am install-rules --target cursor --project <project-id> --root <project-root>
```

## 数据结构

默认数据目录：`~/.agents-memory/am-data`

```text
am-data-root/
  am-config.toml
  am-global/
  am-projects/
  am-secrets/
  am-locks/
```

## 旧记忆迁移

把旧的 hot/warm/cold Markdown 导入新结构：

```powershell
am migrate legacy --project <project-id> --session imported-legacy --hot <hot.md> --warm <warm.md> --cold <cold.md> --dry-run
am migrate legacy --project <project-id> --session imported-legacy --hot <hot.md> --warm <warm.md> --cold <cold.md>
```

迁移时旧文件只读，不会覆盖原内容。

## 敏感信息

敏感信息要放到 `am-secrets`，普通记忆里只保存 `secret_ref`，不要保存真实密码、token、cookie、密钥明文。

## 故障排查

```powershell
am doctor --project <project-id>
am rebuild-index --project <project-id>
```

如果 `doctor` 显示 `sqlite_fts5` 不可用，工具会自动降级到普通 SQLite 或文件扫描，仍可使用，只是搜索可能慢一些。

检索时会优先使用 `ripgrep` 做实时词法命中，再回退到 SQLite 索引和文件扫描。
