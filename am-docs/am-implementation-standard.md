# agents-memory v1 实施标准

`agents-memory` 是本地优先的 AI Agent 记忆运行时。v1 目标是解决三类问题：session 自动压缩后不丢关键状态、跨 session 项目知识同步、整个 Codex/Claude/Cursor 下所有 agent 共享通用记忆。

## 路径

- 本次实施代码路径：`E:\workspace\local\AgentsMemory`
- 本次实施数据路径：`E:\work\AM-data`
- 本次设计资料路径：`E:\work\项目\agents-memory`
- 正式产品必须允许用户通过 CLI 参数、环境变量或配置文件自定义数据路径。

数据根目录解析优先级：

1. CLI 参数：`--am-data-root <path>`
2. 环境变量：`AM_DATA_ROOT`
3. 用户配置：`~/.agents-memory/am-config.toml`
4. 默认路径：`E:\work\AM-data`

## 命名

- 自有运行时目录和业务文件使用 `am-` 前缀，方便用户识别属于 agents-memory。
- 生态标准文件可以使用标准名称，例如 `package.json`、`tsconfig.json`。
- 外部工具强制入口文件使用原名：`AGENTS.md`、`CLAUDE.md`、`.cursorrules`。

## 存储

- Markdown：人工可读的规则、上下文和稳定知识。
- JSONL：追加式历史账本和 checkpoint，禁止覆盖历史。
- 词法检索：优先使用 `ripgrep` 对 Markdown/JSONL/TOML 源文件做实时精确检索，用于路径、命令、报错、API、配置键、session id 等高精确信息。
- SQLite FTS：优先使用 FTS5；如果本机 sqlite 不支持 FTS5，则降级为普通 SQLite `LIKE` 检索；如果 sqlite 不可用或索引没有命中，再降级为文件扫描。索引可通过 `am rebuild-index` 重建，不是唯一事实来源。
- 向量检索：v1 不作为默认主路径。后续可以作为可选召回层，但不能替代词法检索，也不能未经预算裁剪就把大量相似块塞进上下文。
- Secret Vault：敏感信息独立存储，普通记忆只保存 `secret_ref`。

## 检索策略

- 检索必须先看确定性入口：当前 session hot、active index、项目配置、已知路径。
- 对代码项目和 agent 记忆，`rg`/FTS/BM25 这类词法检索优先级高于纯向量 RAG。
- 语义向量适合“我记得意思但不记得原词”的扩展召回，不适合作为查找标识符、路径、命令和错误文本的唯一方式。
- 合并多个检索源时必须去重，优先保留源文件路径明确、命中词可解释、更新时间更近的结果。
- 返回 Context Pack 前必须做上下文预算控制，禁止因为命中结果过多而挤掉当前任务状态。

## 热记忆并发模型

- 禁止使用一个项目级 hot 文件代表唯一当前任务。
- 项目级热状态必须拆成 `am-active.json` 和多个 session hot。
- `am-active.json` 只记录活跃 session/task/worktree 索引、状态一句话、更新时间和文件路径。
- 每个 agent/session/task/worktree 独立维护自己的 `am-session.md` 和 `am-checkpoints.jsonl`。
- 写锁必须短等待并检测 stale lock，防止并发 checkpoint 直接失败；但锁只能防止文件写坏，不能解决任务状态归属冲突，因此不同任务不得互相覆盖 hot。
- 温记忆和冷记忆仍然项目共享，因为它们保存稳定知识和历史索引，而不是当前任务状态。

## 规则文件

对用户已有 `AGENTS.md`、`CLAUDE.md`、`.cursorrules` 必须保守写入：

- 文件不存在时可以创建。
- 文件存在时只在末尾追加托管块。
- 不修改、不重排、不格式化、不覆盖用户原有内容。
- 追加前备份到 `am-backups`。
- v1 发现旧托管块时仍追加新版本块，不自动替换。

托管块边界：

```md
<!-- AM:BEGIN agents-memory v1 -->
...
<!-- AM:END agents-memory v1 -->
```

## 性能

同步路径只允许轻量操作：读小文件、`ripgrep` 小范围检索、SQLite FTS、追加 JSONL、写 session checkpoint。LLM 总结、向量化、图谱抽取和长文档重建索引放到后台或后续版本。

目标：

- `get-context`: p50 < 100ms, p95 < 300ms
- `checkpoint`: p50 < 50ms, p95 < 150ms
- `search`: p50 < 80ms, p95 < 250ms
