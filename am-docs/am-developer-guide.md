# agents-memory 开发说明

本文面向后续接手的 agent 开发人员和人工开发者。后续任何功能新增、命令变更、数据结构变更、路径规则变更、规则文件写入策略变更，都必须同步更新本文和 `am-docs/am-user-manual.md`。

## 项目定位

`agents-memory` 是本地优先的 AI Agent 记忆运行时，用来解决：

- session 自动压缩后丢失关键状态。
- 跨 session 后项目知识不同步。
- Codex、Claude、Cursor 等多个 agent 无法共享通用记忆库。

## 当前路径

- 代码路径：`E:\workspace\local\AgentsMemory`
- 实施数据路径：`E:\work\AM-data`
- 设计资料路径：`E:\work\项目\agents-memory`

正式产品不能硬编码实施数据路径。数据根目录解析优先级：

1. CLI 参数：`--am-data-root <path>`
2. 环境变量：`AM_DATA_ROOT`
3. 用户配置：`~/.agents-memory/am-config.toml`
4. 默认实施路径：`E:\work\AM-data`

## 当前代码结构

```text
am-src/
  am-core.mjs        核心逻辑
  am-cli.mjs         CLI 入口
  am-mcp-server.mjs  MCP stdio 入口骨架
am-tests/
  am-smoke-test.mjs  端到端 smoke test
am-docs/
  am-architecture.md
  am-implementation-standard.md
  am-roadmap.md
  am-developer-guide.md
  am-user-manual.md
am-scripts/
  am.ps1            PowerShell 包装脚本
```

## 命名规则

- 自有业务目录和文件使用 `am-` 前缀。
- 生态标准文件可以使用标准名称，例如 `package.json`、`tsconfig.json`。
- 外部工具强制入口文件使用原名：`AGENTS.md`、`CLAUDE.md`、`.cursorrules`。

## 核心模块职责

### Memory Gateway

CLI 和 MCP server 都是 gateway。新增命令或工具时，必须调用 `am-core` 中的同一套函数，不要复制业务逻辑。

### Memory Kernel

`am-core.mjs` 目前负责：

- 路径解析。
- TOML-like 配置解析。
- 项目注册。
- session 创建。
- checkpoint 写入。
- promote 晋升。
- search 检索。
- rule file 追加。
- doctor 检查。

后续迁移 TypeScript 时，应先保持函数行为和 CLI 输出兼容。

### Index Store

SQLite 索引是可重建的性能层，不是事实来源。事实来源是 Markdown 和 JSONL。

检索顺序：

1. SQLite FTS5。
2. 普通 SQLite 表。
3. 文件扫描 fallback。

### Rule File Writer

对已有 `AGENTS.md`、`CLAUDE.md`、`.cursorrules`：

- 只能追加托管块。
- 不能修改、重排、格式化、覆盖用户原文。
- 追加前必须备份到 `am-backups`。
- 旧托管块存在时 v1 仍追加新块，不自动删除旧块。

### Legacy Memory Migrator

v1 完成后必须提供旧记忆迁移能力，用于把当前用户已有的 hot/warm/cold Markdown 文件导入 agents-memory 新结构。

迁移命令规划：

```powershell
node am-src/am-cli.mjs migrate legacy --project sdcr --session imported-legacy --hot <hot.md> --warm <warm.md> --cold <cold.md>
```

实现要求：

- 只读取旧文件，不修改、不移动、不删除旧文件。
- `--dry-run` 必须先展示源文件、目标文件和预计导入动作。
- hot 导入到 `am-session.md`，并追加一条 `legacy_hot_import` checkpoint。
- warm 追加到项目 `am-memory/am-warm.md`，保留来源路径和导入时间。
- cold 逐段或整体导入到 `am-memory/am-cold.events.jsonl`，事件类型为 `legacy_cold_import`。
- 迁移后执行 `rebuildIndex`。
- 生成 `am-migration-report.md`，记录源路径、目标路径、导入时间、条目数、跳过原因和注意事项。
- 如果旧文件包含疑似敏感信息，不自动导入对应行；报告中只写“疑似敏感内容已跳过”，不要写明文。

## 常用开发命令

```powershell
npm test
node am-src/am-cli.mjs doctor --am-data-root E:\work\AM-data --project agents-memory
node am-src/am-cli.mjs rebuild-index --am-data-root E:\work\AM-data --project agents-memory
```

## 开发约束

- 不保存推理过程、完整聊天、大段日志或敏感明文。
- 普通记忆只保存 `secret_ref`。
- JSONL 只能追加，不覆盖历史。
- Markdown 写入需要 UTF-8。
- 任何写入规则文件的改动都必须先跑 smoke test。
- 修改 CLI/MCP 参数或输出时，必须同步更新用户手册。

## 新功能开发流程

1. 更新或新增测试，明确行为。
2. 修改 `am-core` 核心逻辑。
3. 让 CLI 和 MCP 复用同一核心函数。
4. 更新 `am-developer-guide.md` 和 `am-user-manual.md`。
5. 如涉及架构或实施标准，同步更新相关文档。
6. 运行 `npm test` 和相关手动验证命令。

## 发布前检查

- `npm test` 通过。
- `am doctor` 在实施数据路径下通过。
- README、开发说明、用户手册同步。
- 规则文件写入仍只追加不覆盖。
- Windows 中文路径可用。
- 无敏感信息进入普通记忆、日志或文档。
