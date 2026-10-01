---
title: Workflow
description: The end-to-end Architect → Developer flow, the three hard gates, and branch naming
---

# Workflow

## End-to-end flow

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

The four slash commands that drive this flow are covered in [Commands](commands.md).

## Hard gates

These are never bypassed:

1. **Repo intel before ADR.** `architect-github-repo-intel` must complete before any ADR authoring — the language, framework, build tool, test framework, and layout must be confirmed from the actual repo, never guessed.
2. **Human `APPROVED` before Developer.** Per [rules/approval-gate.md](https://github.com/devrkd/agentic-workflow/blob/main/rules/approval-gate.md), work halts after the ADR is published until the human explicitly approves (an `APPROVED` reply in the session; the rule's Slite-status alternative is not available under opencode since Slite is not wired). Architect must never write a handoff before approval; Orchestrator must never invoke Developer before `adr_approved_at` is present.
3. **Developer halts without a handoff.** Developer halts if `.tmp/<task-id>/handoff.json` is missing or `adr_url` is absent: "Developer halted: `adr_url` is missing from handoff. ADR must be created and approved before implementation."

## Branch naming

- `scripts/new-worktree.sh` generates **`agent/<task-id>/<role>`** (e.g. `agent/RTD-541/architect`, `agent/RTD-541/developer`), appending `-<timestamp>` if the branch already exists.
- Developer FR branches use **`agent/<task-id>/<fr-label>`** (e.g. `agent/RTD-541/fr1`), taken from the handoff's `sub_tasks[].branch`.
