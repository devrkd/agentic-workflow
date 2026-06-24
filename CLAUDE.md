# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## What This Repository Is

A template for running three coordinated AI agents (Orchestrator, Architect, Developer) in **Claude Code**, backed by ClickUp, GitHub, Slite, and Figma via MCP. It contains no application code — only agent prompts, skill definitions, MCP config, schemas, and worktree helper scripts.

Run `claude` from this repo root. Project MCP is **[`.mcp.json`](.mcp.json)**. Approve servers when prompted. Export tokens from [`.env.example`](.env.example) into the environment Claude Code inherits.

### Slash Commands

| Command | Model | Role |
|---------|-------|------|
| `/orchestrator [task-id] ...` | Haiku | Dispatches to Architect or Developer; no product code edits |
| `/architect [task-id] ...` | Sonnet | Design, ADR authoring, repo intel; writes `.tmp/<task-id>/handoff.json` after ADR approval |
| `/developer [task-id] [fr-label]` | Sonnet | Reads `handoff.json`; optional second arg selects `sub_tasks[].fr` when multiple FRs |

**Note:** When Orchestrator dispatches to Architect, it uses Opus. Direct `/architect` invocation uses Sonnet.

Definitions live in [`.claude/commands/`](.claude/commands/). Role prompts and skills are in [`.claude/prompts/`](.claude/prompts/) and [`.claude/skills/`](.claude/skills/).

### File-based Handoff (Architect → Developer)

- **Path:** `.tmp/<task-id>/handoff.json` (gitignored)
- **Schema:** [`schemas/handoff.v1.json`](schemas/handoff.v1.json); example: [`schemas/handoff.v1.example.json`](schemas/handoff.v1.example.json)
- **Writer:** Architect, only after human ADR approval (`adr_url`, `adr_approved_at`, `sub_tasks`, optional `figma_frames`, `skip_clickup`)
- **Reader:** Developer; halts if file or `adr_url` is missing

## Setup

```bash
cp .env.example .env
# Fill in: CLICKUP_API_TOKEN, GITHUB_TOKEN (repo scope), SLITE_API_TOKEN
# Optional: CLICKUP_TEAM_ID, FIGMA_API_KEY
```

Verify GitHub auth:
```bash
gh auth status
```

## MCP Wiring

The primary MCP path is **claude.ai cloud connectors**, which are activated automatically when running `claude` from a claude.ai-connected environment:

| Service | Primary connector | Namespace prefix |
|---------|------------------|-----------------|
| ClickUp | claude.ai cloud | `mcp__claude_ai_ClickUp__*` |
| Slite | claude.ai cloud or `.mcp.json` Bearer | `mcp__claude_ai_Slite_MCP__*` or `mcp__slite__*` |
| Figma | claude.ai cloud or `figma-developer-mcp` stdio | `mcp__claude_ai_Figma__*` |
| GitHub | `.mcp.json` remote (api.githubcopilot.com/mcp/) | `mcp__github__*` |

`.mcp.json` configures the GitHub and Slite remote endpoints, and the Figma stdio server as fallback. It does **not** configure a local ClickUp server — use the cloud connector for ClickUp.

Export `CLICKUP_API_TOKEN`, `GITHUB_TOKEN`, `SLITE_API_TOKEN`, and optionally `FIGMA_API_KEY` before launching `claude`.

## Worktree Management

```bash
# Architect (clones repo if not present)
scripts/new-worktree.sh --task-id RTD-541 --role architect --repo-name my-app --repo-url git@github.com:org/my-app.git

# Developer (reuses existing canonical clone)
scripts/new-worktree.sh --task-id RTD-541 --role developer --repo-name my-app
```

Outputs: `canonical_repo=`, `worktree_path=`, `branch_name=`

Manual cleanup:
```bash
git -C .repos/<repo-name> worktree remove .worktrees/<task-id>/<agent>-<timestamp>
rm -rf .repos/<repo-name>  # only when no active tasks remain
rm -rf .tmp/<task-id>/     # scratch data; remove after task completion
```

## Three-Agent Architecture

**Orchestrator** — smart dispatcher. Classifies intent → routes to Architect or Developer. Never asks clarifying questions; decides based on content. No task ID required for classification.

> **Note:** `.claude/commands/orchestrator.md` is the canonical orchestration contract. `.claude/prompts/orchestrator.md` provides background reference context. When they conflict, the command takes precedence.

**Architect** — design authority, read-only during execution.
- **Works with or without a ClickUp task ID**
- Accepts: design requests, doc updates, tech specs, architecture reviews
- Produces: ADR in Slite, design docs, handoff.json (only if real task ID + implementation planned)
- Review mode: checks Developer PRs against ADR scope

**Developer** — implementation only.
- **Requires a ClickUp task ID** — halts immediately if missing
- Reads `.tmp/<task-id>/handoff.json` (must include `adr_url`)
- Implements only FR scope assigned in sub_tasks[]
- Returns PR URL and blockers

## Critical Workflow Rules

**Hard gates (must not be bypassed):**
1. `architect.github-repo-intel` skill must complete before ADR authoring — tech stack must be confirmed from the actual repo, never guessed.
2. ADR must receive human approval (`APPROVED` reply or Slite status = `Approved`) before Developer starts.
3. Developer handoff must include `adr_url`; Developer halts if absent.

**ADR policy:** Architect must use Slite template `XA-ubsJJqzQTDl` for every ADR. All five required sections must be verified before presenting for approval: API Specification Changes, Change Flow Diagrams (to-be only), High-Level Code Changes, Metrics and Observability, Code Snippets.

**Content disclaimers (mandatory):**

ClickUp (first line):
```
🤖 This was generated by AI, don't forget to verify before making any decision. Agent: <agent-name>
```

Slite (prepend at top):
```
> [!NOTE]
> 🤖 This was generated by AI, don't forget to verify before making any decision. Agent: <agent-name>
```

## File Layout

- `.claude/commands/` — Claude Code slash commands: `orchestrator`, `architect`, `developer`
- `.mcp.json` — MCP server wiring (ClickUp, GitHub, Slite, Figma)
- `.claude/prompts/` — full role prompt for each agent
- `.claude/skills/` — step-by-step skill docs; prefixed `architect.*` or `developer.*`
- `schemas/handoff.v1.json` — JSON Schema for `.tmp/<task-id>/handoff.json`
- `schemas/handoff.v1.example.json` — non-secret example handoff
- `scripts/new-worktree.sh` — provision isolated git worktrees per task/role
- `scripts/clone-repo-for-analysis.sh` — shallow-clone product repos for Architect analysis
- `.repos/<repo-name>/` — canonical clones, shared across worktrees for a repo
- `.worktrees/<task-id>/<role>-<timestamp>/` — ephemeral, one per agent invocation
- `.tmp/<task-id>/` — scratch data for a task; gitignored; remove after task completion

## skip_clickup Flag

When passed as `skip_clickup: true`: omit all ClickUp task creation; ADR references FRs by label only; Developer handoff omits sub-task `id`/`url` fields.

## Branch Naming

`agent/<task-id>/<role>` (e.g., `agent/RTD-541/architect`). If branch already exists, script appends `-<timestamp>`. Developer branches for FRs use `agent/<task-id>/<fr-label>`.
