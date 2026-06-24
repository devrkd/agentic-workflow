# Three-Agent Claude Code Template

Three coordinated AI agents (Orchestrator, Architect, Developer) running in Claude Code, backed by ClickUp, GitHub, Slite, and Figma via MCP.

## Quick Start

```bash
cp .env.example .env
# Fill in: CLICKUP_API_TOKEN, GITHUB_TOKEN, SLITE_API_TOKEN, FIGMA_API_KEY
claude  # start Claude Code from this repo root, approve MCP servers when prompted
```

## Slash Commands

| Command | Model | Role |
|---------|-------|------|
| `/orchestrator [task-id] ...` | Haiku | Dispatches to Architect or Developer; never touches code |
| `/architect [task-id]` | Opus | Design, ADR authoring, repo intel; writes `.tmp/<task-id>/handoff.json` |
| `/developer [task-id] [fr-label]` | Sonnet | Implementation; reads `handoff.json`, halts if `adr_url` missing |

## Workflow

```
/orchestrator RTD-541 skip_clickup
  └─► /architect RTD-541          ← design + ADR in Slite
        └─► [human approves ADR]
              └─► /developer RTD-541   ← implement scoped FR
```

ADR approval is a hard gate — Developer will not start without it.

## File Layout

```
.claude/commands/       Claude Code slash commands (orchestrator, architect, developer)
.mcp.json               MCP server config (Slite, ClickUp, GitHub, Figma)
.claude/prompts/        Full role prompt for each agent
.claude/skills/         Step-by-step skill docs referenced from role prompts
schemas/                handoff.v1.json schema + example
scripts/
  new-worktree.sh       Provision isolated git worktrees per task/role
  clone-repo-for-analysis.sh  Shallow-clone product repos for Architect analysis
.env.example            Required environment variables
```

## Handoff File

After ADR approval, Architect writes `.tmp/<task-id>/handoff.json` (schema: `schemas/handoff.v1.json`). Developer reads this file; the `adr_url` field is mandatory.

## MCP Servers

| Server | Auth | Purpose |
|--------|------|---------|
| GitHub (Copilot remote) | `GITHUB_TOKEN` | Repo access, PR creation |
| Slite | `SLITE_API_TOKEN` (Bearer) | ADR authoring, doc intake |
| ClickUp | `CLICKUP_API_TOKEN` | Task tracking |
| Figma | `FIGMA_API_KEY` | Design intake |

Secrets go in `.env` — never commit them.
