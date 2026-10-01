# The Agentic Workflow (opencode harness)

This repository is a **harness for a multi-agent software-development workflow** run under [opencode](https://opencode.ai/). It contains no application code — only agent definitions, slash commands, skills, schemas, rules, helper scripts, and an opencode plugin for Slack.

Four coordinated agents — **Orchestrator, Architect, Developer, Staff** — are backed by the **GitHub MCP server**. The Orchestrator classifies user intent and dispatches work to the right subagent via opencode's `task` tool; the Architect designs and produces ADRs; the Developer implements scoped functional requirements; Staff does deep read-only analysis.

A parallel Claude Code harness is retained in `.claude/` for Claude Code users; opencode ignores it. The two harnesses are kept in parallel (`AGENTS.md` for opencode, `CLAUDE.md` for Claude Code).

## The four agents

Agent definitions live in [`../.opencode/agent/`](../.opencode/agent/). Model mapping is set per agent (opencode has no `haiku`/`sonnet`/`opus` aliases); edit the `model:` field in each `../.opencode/agent/*.md` to remap.

| Agent | Mode | Model | Variant | Role |
|---|---|---|---|---|
| `orchestrator` | `primary` | `deepseek/deepseek-flash` | `low` | Classifies intent, dispatches via the `task` tool, never edits product code |
| `architect` | `all` | `deepseek/deepseek-v4-pro` | `max` | Design, ADR authoring, repo intel |
| `developer` | `all` | `deepseek/deepseek-v4-pro` | `max` | Implementation only; requires a task id |
| `staff` | `all` | `deepseek/deepseek-v4-pro` | `max` | Read-only cross-source analysis |

### Orchestrator

The default agent and smart dispatcher. It never implements anything itself:

1. **Classifies** the user's input. Priority order: **Developer > Architect > Staff**.
   - **Developer** — a task ID or URL is present *and* the intent is to implement/fix/build.
   - **Architect** — the default for design, analysis, review, and doc work.
   - **Staff** — only when explicitly requested or when multi-source analysis is clearly needed; the Orchestrator **confirms with the user before routing to Staff**.
2. **Dispatches** to exactly one subagent via the `task` tool with a fully self-contained prompt.
3. **Monitors** subagent output and relays a structured summary; escalates blockers (including Developer's `NEEDS_ARCHITECT` signal) rather than absorbing failures.

The Orchestrator also maintains task state (see [File-based handoff](#file-based-handoff)).

### Architect

Owns design, technical decision-making, and the handoff contract to the Developer. Never implements product code.

- The task id (e.g. `RTD-541`) is **optional**. If missing, it generates a dummy ID (e.g. `arch-<repo-name>-<timestamp>`) for `.tmp/` organisation and runs the full planning flow; after ADR approval it asks the user to either provide a real task ID or confirm the dummy ID before writing `handoff.json`.
- Deliverables order: problem framing → design and risks → implementation plan → verification → ADR → human approval → `handoff.json` → point the user to `/developer`.
- In **review mode** it reviews a Developer result against the approved ADR and produces a verdict (`approved` / `changes requested`).
- When a product repo is in scope it clones it locally for inspection and cleans it up afterwards.

### Developer

Implements the approved design for a **single scoped functional requirement (FR)**. Makes no architecture decisions — if the design is ambiguous it returns a `NEEDS_ARCHITECT` blocker instead of guessing.

- The task id is **required**.
- Reads `.tmp/<task-id>/handoff.json`; halts if the file is missing or `adr_url` is absent (see [Hard gates](#hard-gates)).
- Selects the sub-task by FR label (`/developer <task-id> FR1`); halts and lists options if multiple `sub_tasks` exist and no label was given.
- Stays strictly within FR scope, keeps commits atomic, runs the handoff's `verification_commands`, and reports results in chat.

### Staff

A deep-reading, **read-only** analyst. Never mutates external systems (GitHub/ClickUp/Slite/Figma) — it may only read. It *may* write local report files (e.g. `.tmp/<task-id>/analysis-handoff.json`).

- Cross-document comparison, source-code audits, task-board triage, risk assessment, and PR/commit analysis.
- Always closes with a structured summary: analysis type, sources read, key findings, gaps/risks, recommended actions, local artifacts.

## Commands

Slash commands are defined in [`../.opencode/command/`](../.opencode/command/). Each file binds a command to an agent via frontmatter and injects the arguments.

| Command | Agent | Usage |
|---|---|---|
| `/orchestrator` | orchestrator | `/orchestrator RTD-541 implement the checkout fix` |
| `/architect` | architect | `/architect RTD-541` |
| `/developer` | developer | `/developer RTD-541 FR1` |
| `/staff` | staff | `/staff compare docs A and B for gaps` |

- `.opencode/command/orchestrator.md` — passes `$ARGUMENTS` to the Orchestrator.
- `.opencode/command/architect.md` — `$1` = optional task id, plus `$ARGUMENTS`.
- `.opencode/command/developer.md` — `$1` = required task id, `$2` = optional FR label; instructs reading `.tmp/$1/handoff.json` and halting if it is missing or `adr_url` is absent.
- `.opencode/command/staff.md` — passes `$ARGUMENTS`; instructs writing findings to `.tmp/<task-id>/analysis-handoff.json`.

## End-to-end workflow

```text
/orchestrator <task-id>
  └─► architect              ← design + ADR
        └─► [human approves ADR]
              └─► developer  ← implement scoped FR
                    └─► architect (review)
                          └─► staff (optional deep analysis)
```

The Orchestrator runs the full **Architect → Developer** flow when the user explicitly requests design before implementation (e.g. "design and implement", "write an ADR then build it"). Step by step:

1. **Architect route** — repo intel (hard gate, see below), design, and an ADR. After approval it writes `.tmp/<task-id>/handoff.json`.
2. **ADR approval gate** — the Orchestrator presents the ADR URL and sub-task list, then **stops and waits for an explicit `APPROVED`** reply. On approval it records `adr_approved_at` in the handoff file.
3. **Developer route** — one Developer subagent per FR (asking before each). Developer implements only its assigned FR.
4. **Architect review** — after each Developer run, the Architect is invoked in review mode with the PR URL and returns a verdict.
5. **Staff (optional)** — deep cross-source analysis when requested.

## Hard gates

These are never bypassed:

1. **Repo intel before ADR.** `architect-github-repo-intel` must complete before any ADR authoring — the language, framework, build tool, test framework, and layout must be confirmed from the actual repo, never guessed.
2. **Human `APPROVED` before Developer.** Per `rules/approval-gate.md`, work halts after the ADR is published until the human explicitly approves (an `APPROVED` reply in the session; the rule's Slite-status alternative is not available under opencode since Slite is not wired). Architect must never write a handoff before approval; Orchestrator must never invoke Developer before `adr_approved_at` is present.
3. **Developer halts without a handoff.** Developer halts if `.tmp/<task-id>/handoff.json` is missing or `adr_url` is absent: "Developer halted: `adr_url` is missing from handoff. ADR must be created and approved before implementation."

## File-based handoff

### `.tmp/<task-id>/handoff.json` — Architect → Developer contract

Written by the Architect **only after human ADR approval**, and only when a real (or user-confirmed) task ID is present and implementation is planned. Schema: [`../schemas/handoff.v1.json`](../schemas/handoff.v1.json) (example: [`../schemas/handoff.v1.example.json`](../schemas/handoff.v1.example.json)). The file — not chat — is canonical for the Developer.

| Field | Required | Purpose |
|---|---|---|
| `task_id` | yes | Same identifier as the slash-command argument (e.g. `RTD-541`) |
| `adr_url` | yes | The approved ADR's URL/reference |
| `adr_approved_at` | yes | ISO-8601 timestamp of the human approval |
| `skip_clickup` | no | When `true`, sub-task `id`/`url` may be `null` and FRs are referenced by label only |
| `figma_frames` | no | Figma frame URLs + summaries when Figma was used in planning |
| `sub_tasks[]` | yes (≥1) | One entry per FR: `fr`, `branch`, `scope`, `acceptance_criteria[]`, `verification_commands[]`; optional `id`/`url` (ClickUp), `worktree_backend`/`worktree_frontend` |

Example (abridged):

```json
{
  "task_id": "RTD-541",
  "adr_url": "https://slite.com/api/notes/example-adr-id",
  "adr_approved_at": "2026-05-08T12:00:00Z",
  "skip_clickup": true,
  "sub_tasks": [
    {
      "id": null,
      "url": null,
      "fr": "FR1",
      "branch": "agent/RTD-541/fr1",
      "scope": "Implement hello endpoint per ADR section FR1.",
      "acceptance_criteria": ["GET /hello returns 200 with expected body"],
      "verification_commands": ["./gradlew :service:test"]
    }
  ]
}
```

> Note: the example uses a Slite URL because the schema predates the opencode harness. Under opencode (Slite not wired), the Architect writes ADRs locally (e.g. `.tmp/<task-id>/adr.md`) and records that reference in `adr_url`.

### `.tmp/<task-id>/state.json` — Orchestrator-maintained task state

Schema: [`../schemas/state.v1.json`](../schemas/state.v1.json). Tracks overall task status and per-FR progress:

- Top level: `task_id`, `status` (`pending` / `in_progress` / `completed` / `blocked`), optional `adr_approved_at`.
- `sub_tasks[]`: `fr`, `status` (`pending` / `in_progress` / `changes_requested` / `completed` / `blocked`), optional `branch`, `pr_url`, `review_verdict`, `reviewed_at`, `figma_conflict_resolution` (`figma` / `adr`), `blockers[]`.

### Lifecycle

`rules/cleanup.md` is the single source of truth for who removes what and when:

- Architect removes `.tmp/<task-id>/repos/` (and `repo-clones.json`) after repo intel.
- Developer must **not** delete `.tmp/<task-id>/`; Architect must not delete `handoff.json` — only the Orchestrator removes `handoff.json`/`state.json` after all sub-tasks complete and PRs merge, and the whole `.tmp/<task-id>/` once the pipeline is done.
- `.tmp/` is gitignored.

## Skills

Skills are reusable step-by-step workflow documents under **`.opencode/skills/<name>/SKILL.md`**. Agent definitions reference them by name and load them on demand; the skill list is also surfaced to the model automatically. There are 18 skills, grouped by owning agent:

| Agent | Skills |
|---|---|
| **architect** (9) | `architect-task-intake`, `architect-doc-intake`, `architect-figma-intake`, `architect-local-repo-clone`, `architect-github-repo-intel`, `architect-adr-authoring`, `architect-progress-review`, `architect-outcome-verifier`, `architect-code-feedback` |
| **developer** (5) | `developer-worktree-bootstrap`, `developer-figma-intake`, `developer-implementation`, `developer-test-validation`, `developer-change-report` |
| **staff** (4) | `staff-doc-compare`, `staff-repo-audit`, `staff-clickup-triage`, `staff-risk-assessment` |

Skills whose sources are not wired in opencode (e.g. `architect-task-intake` → ClickUp, `architect-figma-intake` → Figma) degrade gracefully: the agent states the source is unavailable and proceeds with what is accessible rather than fabricating data.

## MCP availability

opencode is configured with the **GitHub MCP server only** (`opencode.json` → `mcp.github`, a remote endpoint at `api.githubcopilot.com/mcp/` with a `GITHUB_TOKEN` bearer header). Tool names are prefixed `github_*`.

**ClickUp, Slite, and Figma are intentionally not wired for opencode.** When a request needs one of those sources, the agent says so and proceeds with local repos, GitHub, and user-provided content. `.mcp.json` (GitHub, Slite, Figma) remains the MCP configuration for the parallel **Claude Code** path and is not used by opencode.

## Branch naming

- `scripts/new-worktree.sh` generates **`agent/<task-id>/<role>`** (e.g. `agent/RTD-541/architect`, `agent/RTD-541/developer`), appending `-<timestamp>` if the branch already exists.
- Developer FR branches use **`agent/<task-id>/<fr-label>`** (e.g. `agent/RTD-541/fr1`), taken from the handoff's `sub_tasks[].branch`.

## Shared assets

| Path | Purpose |
|---|---|
| `rules/` | Cross-cutting policies: [`approval-gate.md`](../rules/approval-gate.md) (ADR human approval gate), [`cleanup.md`](../rules/cleanup.md) (`.tmp/` lifecycle), [`disclaimers.md`](../rules/disclaimers.md) (exact AI-content disclaimer formats for ClickUp/Slite), [`figma-conflict.md`](../rules/figma-conflict.md) (Figma-vs-ADR conflicts), [`README.md`](../rules/README.md) (index) |
| `schemas/` | JSON Schemas: `handoff.v1.json` (+ non-secret example), `state.v1.json` |
| `scripts/` | `new-worktree.sh` (canonical clone + per-task/role worktree), `clone-repo-for-analysis.sh` (shallow clone into `.tmp/<task-id>/repos/`), `slack-server.sh` (headless opencode server with the Slack bridge), `healthcheck.sh` (branch/commit/date), `push-metrics.sh` (Claude Code Stop-hook metrics — Claude-only) |
| `metrics/` | Prometheus + Grafana stack for **Claude Code** usage/cost dashboards (Claude-only) |
| `.opencode/plugins/`, `.opencode/lib/` | The opencode Slack bridge plugin (see [Slack integration](slack-integration.md)) |

## Guardrails and configuration

- **Permissions** (`opencode.json`): read/edit/glob/grep/list/task are allowed; `bash` has an explicit allowlist (safe read-only commands, `git`/`gh` read + write commands, `npm`/`node`, `scripts/*.sh`) with `ask` as the default; destructive commands (`rm`, `git push --force`, `git reset --hard`, `git clean`, branch deletion, worktree removal) are denied.
- **Environment**: `cp .env.example .env`, then `export GITHUB_TOKEN=...` (opencode reads env vars; it does not load `.env` automatically — with one exception: the Slack plugin, see below).
- **`.tmp/`, `.repos/`, `.worktrees/`, `.env`, `metrics/data/`** are gitignored.

## Two harnesses in parallel

- `AGENTS.md` / `.opencode/` — the opencode harness described here.
- `CLAUDE.md` / `.claude/` — the original Claude Code harness (commands, prompts, skills, hooks). It supports ClickUp/Slite/Figma via claude.ai connectors, which opencode does not.
