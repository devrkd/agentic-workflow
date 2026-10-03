# Handoff Document — AI Orchestration Framework

> **Audience:** Engineers onboarding to this repo, or anyone presenting the system to stakeholders.
> **Date:** 2026-06-18

---

## 1. What This Repository Is

A **Claude Code harness** for running three coordinated AI agents against a software development workflow. It contains no product application code — only:

- Agent prompts and slash commands
- Skill definitions (reusable step-by-step workflows)
- MCP server wiring (task / documentation / ux source categories, GitHub)
- Cost tracking via stop hooks
- JSON schemas for handoff and state

**Entry point:** Run `claude` from this repo root. All agent interactions happen through slash commands.

---

## 2. Three-Agent Architecture

```
User
  │
  ▼
/orchestrator ──► classifies intent
  │
  ├──► Architect (Sonnet)   — design, ADR, repo intel
  ├──► Developer  (Sonnet)  — implementation only
  └──► Staff      (Opus)    — read-only analysis
```

### Agent Responsibilities

| Agent | Model | Can Write External Systems? | Requires Task ID? |
|-------|-------|----------------------------|-------------------|
| Orchestrator | Haiku | No | No |
| Architect | Sonnet | Yes (ADR in documentation source, task updates) | Optional |
| Developer | Sonnet | Yes (Git, PRs, task updates) | **Required** |
| Staff | Opus 4.8 | No (read-only only) | No |

### Invocation

```bash
/orchestrator RTD-541 implement the checkout fix
/architect RTD-541
/developer RTD-541 FR1
/staff compare docs A and B for gaps
```

---

## 3. Orchestration Flow — Step by Step

```
1. /orchestrator receives $ARGUMENTS
       │
       ├── Has task ID + "implement"?  ──► Developer
       ├── Read/audit/compare?          ──► Staff
       └── Design/ADR/tech spec?        ──► Architect
                                              │
                         (if implementation planned)
                                              │
                                     writes .tmp/<task-id>/handoff.json
                                              │
                              User types APPROVED
                                              │
                                         /developer
                                              │
                                     reads handoff.json
                                     creates branch + worktree
                                     implements FR scope
                                     opens PR
                                     updates the task
                                              │
                              Architect reviews PR
```

### Hard Gates (Never Bypassed)

1. `architect.github-repo-intel` must complete before ADR authoring — tech stack confirmed from actual repo.
2. ADR must receive human `APPROVED` before Developer starts.
3. Developer halts immediately if `adr_url` is missing from `handoff.json`.

---

## 4. File-Based Handoff (Architect → Developer)

**Path:** `.tmp/<task-id>/handoff.json`

Written by Architect after ADR approval. Read by Developer to start implementation.

**Example handoff:**
```json
{
  "task_id": "RTD-541",
  "adr_url": "https://docs.example.com/notes/example-adr-id",
  "adr_approved_at": "2026-05-08T12:00:00Z",
  "skip_task_tracking": true,
  "design_frames": [
    {
      "url": "https://design.example.com/file/abc123",
      "summary": "Example frame: login form layout."
    }
  ],
  "sub_tasks": [
    {
      "id": null,
      "url": null,
      "fr": "FR1",
      "branch": "agent/RTD-541/fr1",
      "worktree_backend": "/path/to/workspace/.worktrees/RTD-541/dev-001",
      "worktree_frontend": "",
      "scope": "Implement hello endpoint per ADR section FR1.",
      "acceptance_criteria": [
        "GET /hello returns 200 with expected body"
      ],
      "verification_commands": [
        "./gradlew :service:test"
      ]
    }
  ]
}
```

**Schema:** `schemas/handoff.v1.json`

---

## 5. Cost Tracking — How It Works

### The Stop Hook

Claude Code fires a `Stop` (or `SubagentStop`) hook event at the end of every session. This repo wires `scripts/push-metrics.sh` to that event.

The hook receives a **JSON payload** via stdin containing:
- `session_id` — unique session identifier
- `transcript_path` — absolute path to the `.jsonl` transcript file

### What the Script Does

1. **Reads the transcript** — a JSONL file where each line is one message (user or assistant)
2. **Parses each assistant message** for the `usage` block:
   ```json
   {
     "input_tokens": 1234,
     "output_tokens": 456,
     "cache_read_input_tokens": 789,
     "cache_creation_input_tokens": 100
   }
   ```
3. **Calculates cost per turn** using model-specific pricing
4. **Writes to SQLite** at `~/claude-metrics/sessions.db` — two tables: `sessions` and `turns`

### Token Types Explained

| Token Type | What It Is | Billed At |
|---|---|---|
| `input_tokens` | Fresh tokens Claude reads this turn (prompt, context, tool results) | Full input rate |
| `output_tokens` | Tokens Claude generates in response | Output rate (5× input) |
| `cache_read_input_tokens` | Tokens served from prompt cache (already seen context) | **~10% of input rate** |
| `cache_creation_input_tokens` | Tokens written into the prompt cache for future turns | **~25% of input rate** |

### What Is a Turn?

A **turn** = one assistant response message in the transcript.

Each turn has its own token counts. The session is the sum of all turns.

**Example session with 3 turns:**

```
Turn 0 — User asks a question
  Model: claude-sonnet-4-6
  input_tokens:              2,000   (fresh context read)
  output_tokens:               400   (Claude's response)
  cache_read_input_tokens:       0   (nothing cached yet)
  cache_creation_input_tokens: 1,800 (writes most of context to cache)
  Cost: 2000×$3/M + 400×$15/M + 0 + 1800×$3.75/M
      = $0.006 + $0.006 + $0 + $0.00675
      = $0.01875

Turn 1 — User follows up
  Model: claude-sonnet-4-6
  input_tokens:                500   (new user message only)
  output_tokens:               300
  cache_read_input_tokens:   1,800   (reads the cached context from turn 0)
  cache_creation_input_tokens: 500   (caches the new input)
  Cost: 500×$3/M + 300×$15/M + 1800×$0.30/M + 500×$3.75/M
      = $0.0015 + $0.0045 + $0.00054 + $0.001875
      = $0.008415

Turn 2 — User asks another question
  Model: claude-sonnet-4-6
  input_tokens:                300
  output_tokens:               250
  cache_read_input_tokens:   2,300   (reads cache built across turns 0+1)
  cache_creation_input_tokens: 300
  Cost: 300×$3/M + 250×$15/M + 2300×$0.30/M + 300×$3.75/M
      = $0.0009 + $0.00375 + $0.00069 + $0.001125
      = $0.006465

Session Total:
  input_tokens:              2,800
  output_tokens:               950
  cache_read_input_tokens:   4,100
  cache_creation_input_tokens: 2,600
  Total Cost: $0.01875 + $0.008415 + $0.006465 = ~$0.0336
```

### Why Cache Matters

Without caching, turn 1 and turn 2 would each re-read the full context at full input rate. With caching:
- Cache reads cost ~10% of input rate → massive savings on long conversations
- Cache writes cost ~25% of input rate → small upfront cost, recouped on subsequent turns

---

## 6. Pricing Reference

Prices per 1 million tokens (as coded in `scripts/push-metrics.sh`):

| Model | Input | Output | Cache Read | Cache Write |
|-------|-------|--------|------------|-------------|
| claude-opus-4 | $15.00 | $75.00 | $1.50 | $18.75 |
| claude-sonnet-4 | $3.00 | $15.00 | $0.30 | $3.75 |
| claude-haiku-4 | $0.80 | $4.00 | $0.08 | $1.00 |
| claude-opus-3 | $15.00 | $75.00 | $1.50 | $18.75 |
| claude-sonnet-3 | $3.00 | $15.00 | $0.30 | $3.75 |
| claude-haiku-3 | $0.25 | $1.25 | $0.03 | $0.30 |

**Cost formula per turn:**
```
cost = (input × price_in / 1_000_000)
     + (output × price_out / 1_000_000)
     + (cache_read × price_cr / 1_000_000)
     + (cache_write × price_cw / 1_000_000)
```

---

## 7. SQLite Schema

Data lands in `~/claude-metrics/sessions.db`.

### `sessions` table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Session ID |
| name | TEXT | First user message or slash command |
| project | TEXT | `basename $PWD` |
| model | TEXT | Last model used |
| started_at | TEXT | ISO-8601 first message timestamp |
| ended_at | TEXT | ISO-8601 last message timestamp |
| duration_s | INTEGER | Wall-clock seconds |
| input_tokens | INTEGER | Sum across all turns |
| output_tokens | INTEGER | Sum across all turns |
| cache_read_tokens | INTEGER | Sum across all turns |
| cache_creation_tokens | INTEGER | Sum across all turns |
| cost_usd | REAL | Total cost |
| turns | INTEGER | Count of real user turns |
| first_message | TEXT | First human message (up to 120 chars) |

### `turns` table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Assistant message ID |
| session_id | TEXT | Parent session |
| session_name | TEXT | Denormalized for easy querying |
| project | TEXT | Project label |
| model | TEXT | Model for this turn |
| timestamp | TEXT | Turn timestamp |
| turn_index | INTEGER | 0-based position in session |
| input_tokens | INTEGER | Fresh input this turn |
| output_tokens | INTEGER | Output this turn |
| cache_read_tokens | INTEGER | Cache hits this turn |
| cache_write_tokens | INTEGER | Cache writes this turn |
| cost_usd | REAL | Turn cost |

**Example queries:**
```sql
-- Total cost per project
SELECT project, SUM(cost_usd) as total, COUNT(*) as sessions
FROM sessions GROUP BY project ORDER BY total DESC;

-- Most expensive sessions
SELECT name, model, cost_usd, turns FROM sessions ORDER BY cost_usd DESC LIMIT 10;

-- Cost breakdown per model across all sessions
SELECT model,
       SUM(input_tokens) as input,
       SUM(output_tokens) as output,
       SUM(cache_read_tokens) as cache_read,
       SUM(cache_write_tokens) as cache_write,
       SUM(cost_usd) as total_cost
FROM turns GROUP BY model ORDER BY total_cost DESC;
```

---

## 8. Skills System

Skills are reusable, step-by-step workflow documents in `.claude/skills/`. Roles reference them; agents execute them in order.

| Prefix | Skills |
|--------|--------|
| `architect.*` | task-intake, doc-intake, ux-intake, local-repo-clone, github-repo-intel, adr-authoring, progress-review, outcome-verifier, code-feedback |
| `developer.*` | worktree-bootstrap, ux-intake, implementation, test-validation, change-report |
| `staff.*` | doc-compare, repo-audit, task-triage, risk-assessment |

---

## 9. Cross-Cutting Rules

Rules in `rules/` enforce policies across all agents:

| Rule File | What It Governs |
|-----------|----------------|
| `rules/approval-gate.md` | ADR human approval gate — when to wait, what counts as approval |
| `rules/disclaimers.md` | Exact AI disclaimer format for task and documentation content |
| `rules/cleanup.md` | `.tmp/<task-id>/` lifecycle — who owns each directory, when to delete |
| `rules/design-conflict.md` | How to resolve UX-design vs ADR conflicts (human decides) |

### Content Disclaimer Format

**Task sources (first line of any AI-generated content):**
```
🤖 This was generated by AI, don't forget to verify before making any decision. Agent: <agent-name>
```

**Documentation sources (prepend at top):**
```
> [!NOTE]
> 🤖 This was generated by AI, don't forget to verify before making any decision. Agent: <agent-name>
```

---

## 10. MCP Integration

MCP sources are organised into three vendor-neutral **source categories**, each bound to a concrete provider in `.mcp.json` (`mcpServers.task` / `mcpServers.documentation` / `mcpServers.ux`):

| Category | Tool Namespace |
|----------|----------------|
| `task` | `mcp__task__*` |
| `documentation` | `mcp__documentation__*` |
| `ux` | `mcp__ux__*` |
| GitHub | `mcp__github__*` |

Replace the placeholder `url`/`command`/`args` in `.mcp.json` with your provider's MCP endpoint or package; swapping providers never requires touching agent prompts or skills.

---

## 11. Directory Layout

```
.claude/
  commands/        ← slash command definitions (orchestrator, architect, developer)
  prompts/         ← full role prompts per agent
  skills/          ← reusable step-by-step skill docs
  settings.json    ← permissions allow/deny list + hooks config

.mcp.json          ← MCP server wiring (GitHub + task / documentation / ux category bindings)

schemas/
  handoff.v1.json          ← JSON schema for .tmp/<task-id>/handoff.json
  handoff.v1.example.json  ← non-secret example
  state.v1.json            ← JSON schema for .tmp/<task-id>/state.json

scripts/
  new-worktree.sh           ← provision isolated git worktrees per task/role
  clone-repo-for-analysis.sh ← shallow-clone product repos for Architect
  push-metrics.sh           ← stop hook: parse transcript → SQLite cost data
  healthcheck.sh            ← prints branch, commit, date

rules/
  approval-gate.md
  cleanup.md
  disclaimers.md
  design-conflict.md

.repos/<repo-name>/           ← canonical clones, shared across worktrees
.worktrees/<task-id>/<role>/  ← ephemeral per-agent worktrees
.tmp/<task-id>/               ← scratch data (gitignored); remove after task
```

---

## 12. Setup

```bash
cp .env.example .env
# Fill in: GITHUB_TOKEN
# Per category: TASK_PROVIDER_TOKEN, DOCUMENTATION_PROVIDER_TOKEN, UX_PROVIDER_TOKEN

gh auth status     # verify GitHub
claude             # launch — approve MCP servers when prompted
```

---

## 13. Cost Monitoring Setup

The `push-metrics.sh` script runs automatically when Claude Code stops a session, **if** a `Stop` hook is configured in `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "scripts/push-metrics.sh"
          }
        ]
      }
    ]
  }
}
```

After sessions run, query the database:
```bash
sqlite3 ~/claude-metrics/sessions.db \
  "SELECT name, cost_usd, turns FROM sessions ORDER BY cost_usd DESC LIMIT 20;"
```

---

*Generated 2026-06-18. Verify against current codebase before acting on specifics.*
