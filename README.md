# agents-memory

[English](README-en.md) | 简体中文

agents-memory 是一个本地优先的 AI Agent 记忆运行时，用来在上下文压缩、跨会话协作和多工具切换时保留关键状态与项目知识。

## 目标

- 在上下文压缩前保存关键会话状态，避免任务断点丢失。
- 在多个会话之间共享项目知识，让后续 agent 更快接上工作。
- 在 Codex、Claude、Cursor 和其它 agent 之间共享全局记忆。

## 快速开始

```powershell
am init
am register-project --id <project-id> --root <project-root>
am start-session --project <project-id> --agent codex
am checkpoint --project <project-id> --session <session-id> --reason pre-compact --state "当前任务状态"
am get-context --project <project-id> --session <session-id> --query "我要处理的问题" --profile lean
am active list --project <project-id>
am secret set --ref <secret-ref> --value "..."
am migrate legacy --project <project-id> --session imported-legacy --hot <hot.md> --warm <warm.md> --cold <cold.md>
am rebuild-index --project <project-id>
```

数据目录可以通过 CLI 参数、`AM_DATA_ROOT` 环境变量，或 `~/.agents-memory/am-config.toml` 配置。

## 规则

用户拥有的 `AGENTS.md`、`CLAUDE.md` 和 `.cursorrules` 不会被 agents-memory 重写。已有文件会先备份，然后只追加 agents-memory 管理的规则块。

## 文档

- 架构说明：`am-docs/am-architecture.md`
- 实施标准：`am-docs/am-implementation-standard.md`
- 后续路线图：`am-docs/am-roadmap.md`
- 开发说明：`am-docs/am-developer-guide.md`
- 用户手册：`am-docs/am-user-manual.md`

任何功能变更、命令变更、数据结构变更、路径策略变更或规则文件写入策略变更，都必须同步更新开发说明和用户手册；否则该变更不算完成。
