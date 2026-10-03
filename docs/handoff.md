---
title: Handoff
description: The handoff.json Architect → Developer contract, the Orchestrator's state.json, and the .tmp/ scratch-directory lifecycle
---

# Handoff

Handoffs between agents are **file-based**, kept under `.tmp/<task-id>/`:

- `handoff.json` — the Architect → Developer contract; the file, not chat, is canonical.
- `state.json` — task state maintained by the Orchestrator.
- `rules/cleanup.md` is the single source of truth for the `.tmp/<task-id>/` lifecycle.

## `handoff.json` — Architect → Developer contract

Written by the Architect **only after human ADR approval**, and only when a real (or user-confirmed) task ID is present and implementation is planned. Schema: [schemas/handoff.v1.json](https://github.com/devrkd/mentat/blob/main/schemas/handoff.v1.json) (non-secret example: [schemas/handoff.v1.example.json](https://github.com/devrkd/mentat/blob/main/schemas/handoff.v1.example.json)). The Developer reads this file — not chat copy-paste — as the source of truth for what to implement.

| Field | Required | Purpose |
|---|---|---|
| `task_id` | yes | Same identifier as the slash-command argument (e.g. `RTD-541`) |
| `adr_url` | yes | The approved ADR's URL/reference (mandatory — the Developer halts without it) |
| `adr_approved_at` | yes | ISO-8601 timestamp of the human approval |
| `skip_task_tracking` | no | When `true`, sub-task `id`/`url` may be `null` and FRs are referenced by label only |
| `design_frames` | no | Design frame URLs + summaries when a UX/design source was used in planning |
| `sub_tasks[]` | yes (≥1) | One entry per FR: `fr`, `branch`, `scope`, `acceptance_criteria[]`, `verification_commands[]`; optional `id`/`url` (task source), `worktree_backend`/`worktree_frontend` |

Example (abridged):

```json
{
  "task_id": "RTD-541",
  "adr_url": "https://docs.example.com/notes/example-adr-id",
  "adr_approved_at": "2026-05-08T12:00:00Z",
  "skip_task_tracking": true,
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

> Note: the example uses a generic URL because the schema predates the opencode harness. Under opencode (no documentation provider bound by default), the Architect writes ADRs locally (e.g. `.tmp/<task-id>/adr.md`) and records that reference in `adr_url`.

## `state.json` — Orchestrator-maintained task state

Schema: [schemas/state.v1.json](https://github.com/devrkd/mentat/blob/main/schemas/state.v1.json). Tracks overall task status and per-FR progress:

- Top level: `task_id`, `status` (`pending` / `in_progress` / `completed` / `blocked`), optional `adr_approved_at`.
- `sub_tasks[]`: `fr`, `status` (`pending` / `in_progress` / `changes_requested` / `completed` / `blocked`), optional `branch`, `pr_url`, `review_verdict`, `reviewed_at`, `design_conflict_resolution` (`design` / `adr`), `blockers[]`.

## `.tmp/` lifecycle

[rules/cleanup.md](https://github.com/devrkd/mentat/blob/main/rules/cleanup.md) is the single source of truth for who removes what and when:

```
.tmp/<task-id>/
├── repos/              ← shallow clones for local analysis
├── repo-clones.json    ← manifest of cloned repos
├── handoff.json        ← Architect → Developer contract (schema: handoff.v1.json)
└── state.json          ← task state tracked by the Orchestrator (schema: state.v1.json)
```

| Path | Owner | When to remove |
|---|---|---|
| `.tmp/<task-id>/repos/` | Architect | After repo intel delivers its report and no further local analysis is needed |
| `.tmp/<task-id>/repo-clones.json` | Architect | Same time as `repos/` |
| `.tmp/<task-id>/handoff.json` | Orchestrator | After **all** Developer sub-tasks are complete and PRs are merged |
| `.tmp/<task-id>/state.json` | Orchestrator | Same time as `handoff.json` |
| Entire `.tmp/<task-id>/` | Orchestrator | Full pipeline complete, or a review-only audit is done |

Hard rules:

- The Developer must **not** delete `.tmp/<task-id>/` — `handoff.json` and `state.json` may still be needed by the Orchestrator.
- The Architect must not delete `handoff.json` — the Developer consumes it; only the Orchestrator declares the task done and removes `handoff.json`/`state.json`, and the whole `.tmp/<task-id>/` once the pipeline is complete.
- Review-only mode (`Mode: review-only`) — the Architect may remove the entire `.tmp/<task-id>/` after delivering the report, since no handoff is produced.
- `.tmp/` is gitignored.
