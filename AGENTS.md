# AGENTS.md

Guidance for running this repository's multi-agent workflow under **opencode**.
Claude Code users are still supported via [`CLAUDE.md`](CLAUDE.md) and `.claude/`; the two harnesses are kept in parallel.

## What This Repository Is

A harness for four coordinated agents (Orchestrator, Architect, Developer, Staff) backed by **GitHub MCP**. It contains no application code — only agent definitions, commands, skills, schemas, rules, and helper scripts.

## Quick Start

```bash
cp .env.example .env
# Required for this opencode setup: GITHUB_TOKEN (repo scope)
# The task / documentation / ux source categories are unbound by default — see MCP below.
export GITHUB_TOKEN=...   # opencode reads env vars, it does not load .env automatically
opencode
```

## Agents (Tab to switch, or use the commands)

| Agent | Mode | Model | Variant | Role |
|-------|------|-------|---------|------|
| `orchestrator` | primary | `deepseek/deepseek-flash` | `low` | Classifies intent, dispatches via the `task` tool, never edits product code |
| `architect` | all | `deepseek/deepseek-v4-pro` | `max` | Design, ADR authoring, repo intel |
| `developer` | all | `deepseek/deepseek-v4-pro` | `max` | Implementation only; requires a task id |
| `staff` | all | `deepseek/deepseek-v4-pro` | `max` | Read-only cross-source analysis |

Definitions live in [`.opencode/agent/`](.opencode/agent/).

> Model mapping is set per agent (opencode has no `haiku`/`sonnet`/`opus` aliases). Edit the `model:` field in each `.opencode/agent/*.md` to remap. See `opencode models` for available ids.

## Commands

| Command | Agent | Usage |
|---------|-------|-------|
| `/orchestrator` | orchestrator | `/orchestrator RTD-541 implement the checkout fix` |
| `/architect` | architect | `/architect RTD-541` |
| `/developer` | developer | `/developer RTD-541 FR1` |
| `/staff` | staff | `/staff compare docs A and B for gaps` |

Definitions live in [`.opencode/command/`](.opencode/command/).

## Workflow

```
/orchestrator RTD-541
  └─► architect              ← design + ADR
        └─► [human approves ADR]
              └─► developer  ← implement scoped FR
                    └─► architect (review) └─► staff (optional deep analysis)
```

Hard gates (never bypassed):
1. Repo intel (`architect-github-repo-intel`) must complete before ADR authoring — tech stack confirmed from the actual repo.
2. ADR must receive human `APPROVED` before Developer starts.
3. Developer halts if `handoff.json` is missing or `adr_url` is absent.

## Skills

18 skills live in [`.opencode/skills/`](.opencode/skills/) as `<name>/SKILL.md`.
Agent files reference them by name (`architect-adr-authoring`, `developer-implementation`, `staff-risk-assessment`, …). The list of available skills is also surfaced to the model automatically.

## MCP

MCP sources are organised into three vendor-neutral **source categories**, each bound to a concrete provider **in config only**:

| Category | Purpose | Example providers you can plug in |
|---|---|---|
| `task` | Task / bug tracker | ClickUp, Jira, GitHub Issues, Linear |
| `documentation` | Docs / wiki | Slite, Confluence, Notion, Google Docs |
| `ux` | Design / UX | Figma, Sketch, Penpot |

GitHub (repo/VCS) stays as-is — it is already generic and is the only server wired by default (`opencode.json` → `mcp.github`).

### Binding a provider to a category

The categories are declared in `opencode.json` under `mcp.task` / `mcp.documentation` / `mcp.ux` (disabled by default). To bind a provider:

1. Replace the placeholder `url` (remote) or `command` (local) with your provider's MCP endpoint or package.
2. Point the auth header/environment at your token (`TASK_PROVIDER_TOKEN`, `DOCUMENTATION_PROVIDER_TOKEN`, `UX_PROVIDER_TOKEN` in `.env.example`).
3. Set `"enabled": true`.

The Claude Code path binds the same categories under `.mcp.json` (`mcpServers.task` / `mcpServers.documentation` / `mcpServers.ux`).

The invariant: **swapping a provider never requires touching agent prompts, commands, skills, rules, or schemas.** Only the config (and env token names) changes. Agents discover at runtime which category servers are connected; skills degrade gracefully (say the source is unavailable, proceed with what is accessible) when a category has no provider bound.

Tool names are prefixed with the server key: `github_*` for GitHub, and `task_*` / `documentation_*` / `ux_*` when those categories are bound. Use `{env:GITHUB_TOKEN}` interpolation syntax in `opencode.json` (not `${...}`).

### Migration from the vendor-specific config

If you were running the earlier harness that named vendors directly, migrate as follows:

1. **Rebind your MCP servers under the category keys** — your current ClickUp server becomes `mcp.task`, your Slite server becomes `mcp.documentation`, your Figma server becomes `mcp.ux`. The servers themselves keep working; only the harness vocabulary changed.
2. **Update env var names** — `CLICKUP_API_TOKEN` → `TASK_PROVIDER_TOKEN`, `SLITE_API_TOKEN` → `DOCUMENTATION_PROVIDER_TOKEN`, `FIGMA_API_KEY` → `UX_PROVIDER_TOKEN` (or keep the old token names and reference them from the category binding).
3. **Regenerate in-flight `handoff.json` files** — `skip_clickup` → `skip_task_tracking`, `figma_frames` → `design_frames`.
4. **Update renamed skill references** (`architect-ux-intake`, `developer-ux-intake`, `staff-task-triage`) in any custom agent files or docs.

## File-Based Handoff

After ADR approval, Architect writes `.tmp/<task-id>/handoff.json` (schema: [`schemas/handoff.v1.json`](schemas/handoff.v1.json)). Developer reads it; `adr_url` is mandatory.

## Slack Bridge

An opencode plugin bridges opencode sessions to Slack and lets you answer approvals from Slack instead of the terminal. Useful for long `/architect` or `/developer` runs you want to monitor away from the keyboard.

- **Out** — one thread per session in the configured channel, used only for approval/question cards with a compact, redacted context summary. Routine progress (tool runs, plan, completion summary, errors) is not posted, and host-specific detail (absolute paths, hostnames, usernames) is redacted from everything posted.
- **In** — permission/approval prompts post as interactive messages with **Approve once / Always / Reject** buttons. The agent's `question` tool posts option buttons too. Replying in the thread injects a prompt into the running session; `!abort` stops it.

### Setup

1. Create a Slack app and enable **Socket Mode** (no public URL needed).
2. Bot scopes: `chat:write`, `channels:read`, plus `channels:history` (public) or `groups:history` (private), `users:read`, `reactions:write`.
3. Generate an **App-Level Token** with `connections:write`, and **Install** to get the Bot token.
4. Turn **Interactivity** on (for the approval buttons), and under **Event Subscriptions** subscribe to `message.channels` (public) or `message.groups` (private) so thread replies reach the agent.
5. `/invite` the app to the target channel and copy its channel ID.
6. Fill `.env`: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_CHANNEL`, and `SLACK_ALLOWED_USERS` (your Slack member ID — recommended, or anyone in the channel can approve commands).
7. Start `opencode`; the plugin loads automatically and installs its deps via Bun on first run.

Set `SLACK_BRIDGE=off` to disable without removing tokens. If config is incomplete the plugin logs once and stays inert, so opencode always starts.

Implementation: `.opencode/plugins/slack-bridge.ts` + `.opencode/lib/slack/`. State (`sessionID` → thread) is kept in `.opencode/slack-bridge-state.json`.

### Watching Slack-triggered work in the terminal

The bridge runs inside the opencode server, so anything Slack injects shows up the same way your own typing does.

- **Normal TUI** — run `opencode`. A Slack reply injected into a session streams live in that session's view. Switch sessions to see other threads.
- **Headless + attach** — run the server, then attach a live TUI:
  ```bash
  scripts/slack-server.sh 4096        # opencode serve --port 4096 --print-logs
  opencode attach http://127.0.0.1:4096
  ```
  `opencode web` is the same view in a browser.
- **Logs only** — `opencode serve --print-logs --log-level DEBUG` prints bridge lines (`injected Slack reply`, `approval card posted`, `session error (not posted to Slack)`) alongside opencode's loop/tool logs.

> The plugin reads `.env` itself, so `SLACK_*` values do not need to be exported. `GITHUB_TOKEN` is still read from the environment by `opencode.json`.

## Shared Assets

- [`rules/`](rules/) — cross-cutting policies (approval gate, disclaimers, cleanup, design conflicts)
- [`schemas/`](schemas/) — handoff and state JSON schemas
- [`scripts/`](scripts/) — `new-worktree.sh`, `clone-repo-for-analysis.sh`, `healthcheck.sh`, `slack-server.sh`
- Branch naming: `agent/<task-id>/<role>` (Developer FR branches: `agent/<task-id>/<fr-label>`)

## Notes

- opencode does not run Claude Code `Stop`/`SubagentStop` hooks; `scripts/push-metrics.sh` is Claude-only for now (metrics integration intentionally deferred).
- `.claude/` is retained for Claude Code users; opencode ignores it except as a rules fallback when no `AGENTS.md` exists.
