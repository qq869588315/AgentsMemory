# agents-memory

English | [简体中文](README.md)

Local-first memory runtime for AI agents.

## Goals

- Keep key session state before context compaction.
- Share project knowledge across sessions.
- Share global memory across Codex, Claude, Cursor, and other agents.

## Quick Start

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

The data path can be configured by CLI argument, `AM_DATA_ROOT`, or `~/.agents-memory/am-config.toml`.

## Rules

User-owned `AGENTS.md`, `CLAUDE.md`, and `.cursorrules` are never rewritten. Existing files are backed up and only appended with a managed block.

## Documentation

- Architecture: `am-docs/am-architecture.md`
- Implementation standard: `am-docs/am-implementation-standard.md`
- Roadmap: `am-docs/am-roadmap.md`
- Developer guide: `am-docs/am-developer-guide.md`
- User manual: `am-docs/am-user-manual.md`

Any feature change, command change, data-structure change, path-policy change, or rule-file write-policy change must update both the developer guide and the user manual before the change is considered complete.

