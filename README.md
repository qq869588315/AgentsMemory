# agents-memory

Local-first memory runtime for AI agents.

## Goals

- Keep key session state before context compaction.
- Share project knowledge across sessions.
- Share global memory across Codex, Claude, Cursor, and other agents.

## Quick Start

```powershell
node am-src/am-cli.mjs init --am-data-root E:\work\AM-data
node am-src/am-cli.mjs register-project --id sdcr --root E:\workspace\company_jz\sdcr
node am-src/am-cli.mjs start-session --project sdcr --agent codex
node am-src/am-cli.mjs rebuild-index --project sdcr
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
