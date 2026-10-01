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
  slack-server.sh       Run a headless opencode server with the Slack bridge
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

## Slack Bridge (opencode)

Watch and steer opencode agent runs from Slack. An auto-loaded plugin posts each session into its own Slack thread and turns permission prompts into buttons you can answer from Slack.

- **Progress out**: tool runs, the agent's plan, completion summaries, and errors.
- **Input back**: **Approve once / Always / Reject** buttons on approval prompts, option buttons for the agent's `question` tool; thread replies are injected into the running session as prompts; `!abort` stops it.

### Watching Slack-triggered work in the terminal

The bridge runs inside the opencode server, so Slack-injected prompts behave exactly like typed ones.

- Run `opencode` and watch the session live in the TUI (switch sessions to view a specific thread).
- Or run headless and attach: `scripts/slack-server.sh 4096`, then `opencode attach http://127.0.0.1:4096` (`opencode web` for the browser).
- Or just follow logs: `opencode serve --print-logs --log-level DEBUG` shows `injected Slack reply` / `posted completion`.

### Setup

1. Create an app at <https://api.slack.com/apps> → **From scratch**.
2. **OAuth & Permissions** → Bot Token Scopes: `chat:write`, `channels:read`, plus `channels:history` (public channels) or `groups:history` (private channels), `users:read`, `reactions:write`. Install to workspace; copy the `xoxb-` **Bot User OAuth Token**.
3. **Basic Information → App-Level Tokens** → generate one with `connections:write`; copy the `xapp-` token.
4. **Socket Mode** → on. **Event Subscriptions** → on, subscribe to `message.channels` (public channels) or `message.groups` (private channels) — matching the history scope above. **Interactivity & Shortcuts** → on. No request URLs are needed.
5. `/invite` the app to the channel; copy the channel ID (`C…`) and your member ID (`U…`).
6. Add to `.env`:

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_CHANNEL=C0123ABCD
SLACK_ALLOWED_USERS=U0123ABCD
```

7. Run `opencode`. First launch installs the plugin deps (Bun); the bridge then connects and posts a thread per session.

Set `SLACK_BRIDGE=off` to disable. With no `SLACK_ALLOWED_USERS`, any channel member can approve commands — set it. Thread mapping is persisted in `.opencode/slack-bridge-state.json` (gitignored).
