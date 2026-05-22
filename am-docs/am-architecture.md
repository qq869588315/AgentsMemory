# agents-memory v1 架构

```text
Agent / CLI / IDE
  -> Memory Gateway: MCP tools + CLI commands
  -> Memory Kernel
     -> Global Memory
     -> Project Memory
     -> Session Checkpoint
     -> Event Ledger
     -> Index Store
     -> Secret Vault
```

## Memory Gateway

MCP Server 给 Codex、Claude、Cursor 等 agent 共享调用；CLI 给人工和脚本使用。两者调用同一套核心逻辑，避免出现两套行为。

## Global Memory

保存跨项目、跨 agent 的通用偏好、工作流和规则。所有项目都可以检索，但不要把大量正文默认注入上下文。

## Project Memory

保存项目级规则、架构、决策、经验和长期知识。跨 session 共享，通过 `promote` 从 session checkpoint 晋升。

## Session Checkpoint

保存当前会话状态。每轮结束或压缩前写入 `am-session.md` 和 `am-checkpoints.jsonl`，用于防止上下文压缩后丢失关键状态。

## Event Ledger

使用 JSONL 追加式记录历史事件，禁止覆盖。Markdown 是人工可读投影，SQLite 是索引，不是唯一事实来源。

## Index Store

使用 SQLite FTS 做轻量检索。索引失败不影响原始记忆写入；索引文件可以删除后重建。

## Secret Vault

敏感信息独立存储。普通记忆只保存 `secret_ref`，不保存密码、token、cookie、密钥等明文。
