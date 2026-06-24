# Agentic Worklfow

Four coordinated AI agents (Orchestrator, Architect, Developer, Staff) running in Claude Code, backed by ClickUp, GitHub, Slite, and Figma via MCP.

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
| `/architect [task detail with document id or github link]` | Sonnet | Design, ADR authoring, repo intel; writes `.tmp/<task-id>/handoff.json` |
| `/developer [task-id] [fr-label]` | Sonnet | Implementation; reads `handoff.json`, halts if `adr_url` missing |
| `/staff [free-form request]` | Opus | Deep analysis; reads all MCPs; never writes to external systems |

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
.claude/commands/       Claude Code slash commands (orchestrator, architect, developer, staff)
.claude/skills/         Step-by-step skill docs referenced from role prompts
.mcp.json               MCP server config (GitHub, Slite, Figma; ClickUp via claude.ai cloud)
schemas/                handoff.v1.json schema + example
scripts/
  new-worktree.sh       Provision isolated git worktrees per task/role
  clone-repo-for-analysis.sh  Shallow-clone product repos for Architect analysis
metrics/                Prometheus + Grafana observability stack → [metrics/README.md](metrics/README.md)
rules/                  Shared workflow rules (approval gate, disclaimers, cleanup, etc.)
HANDOFF.md              Handoff contract reference
.env.example            Required environment variables
```

## Handoff File

After ADR approval, Architect writes `.tmp/<task-id>/handoff.json` (schema: `schemas/handoff.v1.json`). Developer reads this file; the `adr_url` field is mandatory.

## MCP Servers

| Server | Auth | How configured |
|--------|------|----------------|
| ClickUp | claude.ai cloud connector | Automatic (no `.mcp.json` entry needed) |
| GitHub (Copilot remote) | `GITHUB_TOKEN` | `.mcp.json` remote |
| Slite | `SLITE_API_TOKEN` (Bearer) | `.mcp.json` remote or claude.ai cloud |
| Figma | `FIGMA_API_KEY` | `.mcp.json` stdio (`figma-developer-mcp`) |

Secrets go in `.env` — never commit them.
