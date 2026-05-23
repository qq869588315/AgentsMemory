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

## Project Active Index

项目级热记忆不能代表“唯一当前任务”。多个 agent 并行工作、工作目录不同或任务不同的时候，共用一个项目级 hot 会产生 last-write-wins 语义覆盖。v1 后续必须增加项目级 active index，只记录当前有哪些活跃 session/task/worktree，以及它们各自的 hot 文件路径和状态摘要。

推荐结构：

```text
am-projects/{project_id}/
  am-active.json
  am-sessions/
    {session_id}/
      am-session.md
      am-checkpoints.jsonl
```

`am-active.json` 只做索引，不保存完整任务上下文。每个 agent/session/task/worktree 独立维护自己的 `am-session.md`，避免互相覆盖。

## Session Checkpoint

保存当前会话状态。每轮结束或压缩前写入 `am-session.md` 和 `am-checkpoints.jsonl`，用于防止上下文压缩后丢失关键状态。

session id 应尽量语义化，建议包含 agent、工作区域、任务短名和日期，例如：

```text
codex-sdcr-app-h5-debug-20260522
codex-sdcr-backend-login-20260522
```

继续当前任务时读取自己的 session hot；了解项目整体时读取 active index + project warm/cold；任务完成后通过 `promote` 沉淀到 warm/cold，并在 active index 中标记完成。

## Event Ledger

使用 JSONL 追加式记录历史事件，禁止覆盖。Markdown 是人工可读投影，SQLite 是索引，不是唯一事实来源。

## Index Store

使用词法检索优先的混合策略。对代码和项目记忆来说，文件路径、命令、错误信息、API 名、类名、配置键和 session id 往往比语义相似度更重要，因此 v1 不把向量 RAG 放在主路径。

检索顺序：

1. 精确路径、session、active index 和已知文件直接读取。
2. `ripgrep` 实时检索 Markdown/JSONL/TOML 源文件。
3. SQLite FTS5 或普通 SQLite `LIKE` 检索可重建索引。
4. 文件扫描兜底。
5. 后续版本可以把向量检索作为扩展召回层，但必须经过去重、重排和预算裁剪。

索引失败不影响原始记忆写入；索引文件可以删除后重建。回答前应优先引用命中的源片段，而不是只相信压缩摘要。

## Secret Vault

敏感信息独立存储。普通记忆只保存 `secret_ref`，不保存密码、token、cookie、密钥等明文。
