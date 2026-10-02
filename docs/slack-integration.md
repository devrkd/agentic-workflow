# Slack Bridge Integration (opencode)

An opencode **plugin** that mirrors agent sessions into Slack and lets you steer long `/architect` or `/developer` runs from Slack — approving prompts, answering the agent's questions, and injecting replies without touching the terminal.

- **Out** — one Slack thread per session in the configured channel: tool runs, the agent's plan (`todo.updated`), completion summaries (`session.idle`), and errors. Subagent (child) sessions get a thread **lazily**, only when they need approval or input (see below).
- **In** — interactive approval messages with **Approve once / Always / Reject** buttons, option buttons for the agent's `question` tool, thread replies injected into the running session as prompts, and `!abort` to stop a session.

The plugin auto-loads when opencode starts. If the Slack config is incomplete it logs once and stays inert, so opencode always starts.

## Implementation files

| File | Purpose |
|---|---|
| [`.opencode/plugins/slack-bridge.ts`](https://github.com/devrkd/mentat/blob/main/.opencode/plugins/slack-bridge.ts) | Plugin entry point. Registers `event` (all events), `tool.execute.after`, and `dispose` hooks and delegates to the bridge. |
| [`.opencode/lib/slack/config.ts`](https://github.com/devrkd/mentat/blob/main/.opencode/lib/slack/config.ts) | Reads the project `.env`, validates the Slack variables, honours `SLACK_BRIDGE=off`. |
| [`.opencode/lib/slack/bridge.ts`](https://github.com/devrkd/mentat/blob/main/.opencode/lib/slack/bridge.ts) | Core logic: event handling, lazy child-thread creation, Slack client wiring (Web API + Socket Mode), button actions, reply injection, stale-click and orphan-card handling. |
| [`.opencode/lib/slack/format.ts`](https://github.com/devrkd/mentat/blob/main/.opencode/lib/slack/format.ts) | Block Kit formatting, mrkdwn escaping/truncation, and normalisation of permission/question events. |
| [`.opencode/lib/slack/session-map.ts`](https://github.com/devrkd/mentat/blob/main/.opencode/lib/slack/session-map.ts) | Persists the `sessionID → Slack thread` mapping. |
| [`.opencode/lib/slack/throttle.ts`](https://github.com/devrkd/mentat/blob/main/.opencode/lib/slack/throttle.ts) | `LineBatch` — coalesces bursts of tool-run lines into a single Slack message per session. |
| [`.opencode/package.json`](https://github.com/devrkd/mentat/blob/main/.opencode/package.json) | Plugin deps: `@slack/web-api`, `@slack/socket-mode`, `@slack/types`, `@opencode-ai/plugin`, `@opencode-ai/sdk`. Installed via Bun on first launch. |
| [`.env.example`](https://github.com/devrkd/mentat/blob/main/.env.example) | Documents the `SLACK_*` variables. |
| `.opencode/slack-bridge-state.json` | Runtime state file (session→thread map), written under `.opencode/` and not committed; a corrupt file is discarded and the bridge starts clean. |

Logging goes to opencode's app log under the service name **`slack-bridge`** (levels debug/info/warn/error).

## Configuration

The plugin reads the project `.env` **itself** (`loadDotenv` in `config.ts`), so the `SLACK_*` values do not need to be exported. Existing environment variables always win over file values.

| Variable | Required | Notes |
|---|---|---|
| `SLACK_BOT_TOKEN` | yes | Bot User OAuth token; must start with `xoxb-`. |
| `SLACK_APP_TOKEN` | yes | App-level token for Socket Mode; must start with `xapp-`. |
| `SLACK_CHANNEL` | yes | Channel ID (e.g. `C0123ABCD`) where per-session threads are posted. |
| `SLACK_ALLOWED_USERS` | recommended | Comma-separated Slack user IDs allowed to answer approvals. If empty, **any** member of the channel can approve agent commands (a warning is logged). |
| `SLACK_BRIDGE` | no | Set to `off` to disable the bridge without removing tokens (`off`/`false`/`0`/`no` all disable). |

On startup the bridge:

1. Checks `SLACK_BRIDGE` and the presence/format of the three required variables. Missing or invalid config → logs `disabled: <reason>` and the plugin returns inert.
2. Verifies the bot token with `web.auth.test()`; failure → logs and disables.
3. Starts the Socket Mode client; connection failures are logged but never break the agent.

## Outbound: mirroring progress

One Slack thread per **top-level** session, created as soon as the session starts. The thread root message is *"Session started — `<title>` / `<directory>`"*, and the mapping is persisted in `.opencode/slack-bridge-state.json` so a plugin reload keeps posting into the same thread instead of spawning a duplicate.

Child (subagent) sessions behave differently — see below.

| opencode event | Slack effect |
|---|---|
| `session.created` | Top-level sessions: creates the thread root message. Child sessions: only recorded — **no thread yet**. |
| `session.updated` | Refreshes the thread root text when a session is renamed (top-level and child threads alike). |
| `todo.updated` | Posts the agent's plan as a `[x]` / `[>]` / `[-]` / `[ ]` checklist. Skipped for children without a thread. |
| `tool.execute.after` | Posts a `• \`tool\` title` progress line. Lines are **batched per session** (default 1200 ms window) so a burst of tool runs doesn't spam Slack. Skipped for children without a thread. |
| `session.idle` | Flushes pending lines, then posts *"Done."* plus the last assistant text (truncated to ~600 chars) as the completion summary. Skipped for children without a thread. |
| `session.error` | Posts an error message. Skipped for children without a thread. |
| `permission.asked` / `permission.updated` | Posts an **approval card** (see below). For a child, this creates the child's thread on demand and drops a pointer notice in the parent's thread. |
| `permission.replied` | Updates the card to *"Approval resolved in terminal: `<reply>`"*. |
| `question.asked` / `question.v2.asked` | Posts a **question card** (see below). For a child, this creates the child's thread on demand and drops a pointer notice in the parent's thread. |
| `question.replied` / `question.rejected` (and v2) | Updates the card to *"Answered/Rejected elsewhere (terminal)"*. |
| `session.deleted` | Removes the session's thread mapping and resolves any pending cards it still owns (see orphan sweep below). |

All posting is **best-effort** — Slack failures are swallowed and never break the agent.

### Child (subagent) sessions

Sessions with a `parentID` — e.g. an Architect or Developer spawned via the Orchestrator's `task` tool — don't get a thread when they start; the bridge just remembers them.

- **Lazy threads.** The child's thread root (*"Subagent session — `<title>` (child of `<parent title>`)"*) is created only when the child first asks for approval or input — i.e. with its first approval or question card. At the same time a pointer notice (*"🛑 Subagent `<title>` is requesting approval — see its thread below."*) is posted in the parent's thread so you can find the child's thread from the parent's.
- **No progress mirroring until then.** Tool progress, plans, completion summaries, and error messages are skipped for a child unless its thread already exists. Once the child has a thread (because it asked for approval or input), its cards and its completion summary are posted there as usual.

### Approval cards

For each `permission.asked`, the bridge posts an interactive message with the permission kind, patterns/metadata, and three buttons:

- **Approve once** → submits `once` for that permission
- **Always** → submits `always`
- **Reject** → submits `reject`

Button values carry a JSON payload (`kind`, `sessionID`, `permissionID`, `response`); the action handler validates the `slackbridge` action prefix, checks the user against `SLACK_ALLOWED_USERS`, and submits via opencode's permission API. The card is then updated to *"Approved once from Slack."*, *"Always allowed from Slack."*, or *"Rejected from Slack."*.

Stale or replayed clicks are discarded: a click is only honoured if the bridge still holds the pending entry it registered for that `permissionID`/`sessionID` pair, so a click on an already-resolved card can never submit twice. If the submit itself fails, a transient failure (network/5xx) keeps the card live for a retry, while a definitive rejection (4xx — e.g. the session can no longer accept the approval) discards the card and updates it to *"Session no longer active — approval discarded."*.

### Question cards

For each `question.asked`, the bridge renders the agent's `question` tool as buttons: one button per option (multi-select toggles), **Submit answers**, and **Reject**. Single-select questions auto-submit once every question has an answer; multi-select needs an explicit Submit. Thread replies can also fill in the first unanswered question (including custom answers when the question allows them). Submission posts to the opencode server's `/question/<id>/reply` endpoint; rejection posts to `/question/<id>/reject`. Stale clicks on a request that is no longer pending are ignored.

## Inbound: steering from Slack

Socket Mode delivers `block_actions` (button clicks) and `event_callback` (messages). For thread replies, the bridge:

1. Ignores bot messages, message subtypes, and anything not in a known thread.
2. Checks the sender against `SLACK_ALLOWED_USERS`; unauthorized users are ignored (and a warning is logged).
3. `!abort` (or `abort`) → aborts the session via opencode's abort API.
4. Otherwise, if a question is pending for the session, the reply answers the first unanswered question (auto-submitting a fully-answered single-select question).
5. Otherwise the reply is **injected into the running session as a prompt** via `promptAsync` — it behaves exactly like a typed prompt in the terminal.

## Setup

1. Create a Slack app at <https://api.slack.com/apps> → **From scratch**, and enable **Socket Mode** (no public request URL needed).
2. **OAuth & Permissions → Bot Token Scopes**: `chat:write`, `channels:read`, plus `channels:history` (public channels) **or** `groups:history` (private channels), `users:read`, `reactions:write`. Install to the workspace and copy the `xoxb-` Bot User OAuth Token.
3. **Basic Information → App-Level Tokens**: generate one with the `connections:write` scope; copy the `xapp-` token.
4. Turn on **Interactivity**, and under **Event Subscriptions** subscribe to `message.channels` (public channels) **or** `message.groups` (private channels) — matching the history scope from step 2.
5. `/invite` the app to the target channel and copy its channel ID (`C…`). Copy your member ID (`U…`) for `SLACK_ALLOWED_USERS`.
6. Fill `.env`:

   ```ini
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_APP_TOKEN=xapp-...
   SLACK_CHANNEL=C0123ABCD
   SLACK_ALLOWED_USERS=U0123ABCD
   ```

7. Run `opencode`. The first launch installs the plugin's dependencies via Bun; the bridge then connects and posts a thread per session.

Set `SLACK_BRIDGE=off` to disable without removing tokens. Leave `SLACK_ALLOWED_USERS` unset at your own risk — then anyone in the channel can approve agent commands.

## Watching Slack-triggered work in the terminal

The bridge runs **inside the opencode server**, so anything Slack injects shows up the same way your own typing does.

- **Normal TUI** — run `opencode`. A Slack reply injected into a session streams live in that session's view. Switch sessions to see other threads.
- **Headless + attach** — run the server (see [`scripts/slack-server.sh`](https://github.com/devrkd/mentat/blob/main/scripts/slack-server.sh)), then attach a live TUI:

  ```bash
  scripts/slack-server.sh 4096        # opencode serve --port 4096 --print-logs
  opencode attach http://127.0.0.1:4096
  ```

  `opencode web` is the same view in a browser.
- **Logs only** — `opencode serve --print-logs --log-level DEBUG` prints bridge lines (`injected Slack reply`, `posted completion`) alongside opencode's loop/tool logs.

## Environment-variable notes

- The plugin reads `.env` itself, so `SLACK_*` values do not need to be exported.
- `GITHUB_TOKEN` is the opposite: it is read from the **environment** by `opencode.json` (`{env:GITHUB_TOKEN}` interpolation), so it must be exported.

## Known behaviour and limitations

- **Child (subagent) threads are lazy.** Sessions with a `parentID` get no thread, no tool progress, and no plan/completion mirroring until they first ask for approval or input; from then on their cards and completion summary post to their own thread, reachable via the pointer notice in the parent's thread.
- **Stale clicks are discarded.** Approval and question buttons are only honoured while the bridge still holds the corresponding pending request; clicks on resolved or replayed cards are ignored. A failed approval submit keeps the card live on transient errors and discards it (*"Session no longer active — approval discarded."*) when opencode definitively rejects it.
- **Orphan sweep on `session.deleted`.** When a session is deleted, the bridge removes its thread mapping and resolves every pending approval/question card still registered for it — the Slack cards are updated to *"Session ended — pending request discarded."* and the pending entries are dropped so stale state can never resolve a different session.
- All Slack posts are best-effort; a failed post is silent. To diagnose, run `opencode serve --print-logs --log-level DEBUG` and look for `slack-bridge` service lines: `Slack bridge connected`, `created Slack thread`, `approval card posted`, `child approval card posted`, `posted completion`, `injected Slack reply`, `disabled: …`, `Socket Mode connection failed`, `ignored approval from unauthorized user …`, `ignored stale approval`, `ignored stale question action`, `orphaned card resolved`.
- The session→thread map persists in `.opencode/slack-bridge-state.json` (not committed). If it is corrupted it is discarded and the bridge starts clean, which can result in a duplicate root message for sessions created before the restart.
- Progress lines are coalesced per session (default 1200 ms window); completion summaries and cards force a flush first.
