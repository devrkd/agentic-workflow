---
title: Agents
description: The four opencode agents — Orchestrator, Architect, Developer, Staff — their modes, models, and responsibilities
---

# Agents

Agent definitions live in [`.opencode/agent/`](https://github.com/devrkd/agentic-workflow/blob/main/.opencode/agent/). Model mapping is set per agent (opencode has no `haiku`/`sonnet`/`opus` aliases); edit the `model:` field in each `.opencode/agent/*.md` to remap.

| Agent | Mode | Model | Variant | Role |
|---|---|---|---|---|
| `orchestrator` | `primary` | `deepseek/deepseek-flash` | `low` | Classifies intent, dispatches via the `task` tool, never edits product code |
| `architect` | `all` | `deepseek/deepseek-v4-pro` | `max` | Design, ADR authoring, repo intel |
| `developer` | `all` | `deepseek/deepseek-v4-pro` | `max` | Implementation only; requires a task id |
| `staff` | `all` | `deepseek/deepseek-v4-pro` | `max` | Read-only cross-source analysis |

## Orchestrator

The default agent and smart dispatcher. It never implements anything itself:

1. **Classifies** the user's input. Priority order: **Developer > Architect > Staff**.
   - **Developer** — a task ID or URL is present *and* the intent is to implement/fix/build.
   - **Architect** — the default for design, analysis, review, and doc work.
   - **Staff** — only when explicitly requested or when multi-source analysis is clearly needed; the Orchestrator **confirms with the user before routing to Staff**.
2. **Dispatches** to exactly one subagent via the `task` tool with a fully self-contained prompt.
3. **Monitors** subagent output and relays a structured summary; escalates blockers (including Developer's `NEEDS_ARCHITECT` signal) rather than absorbing failures.

The Orchestrator also maintains task state (see [Handoff](handoff.md)).

## Architect

Owns design, technical decision-making, and the handoff contract to the Developer. Never implements product code.

- The task id (e.g. `RTD-541`) is **optional**. If missing, it generates a dummy ID (e.g. `arch-<repo-name>-<timestamp>`) for `.tmp/` organisation and runs the full planning flow; after ADR approval it asks the user to either provide a real task ID or confirm the dummy ID before writing `handoff.json`.
- Deliverables order: problem framing → design and risks → implementation plan → verification → ADR → human approval → `handoff.json` → point the user to `/developer`.
- In **review mode** it reviews a Developer result against the approved ADR and produces a verdict (`approved` / `changes requested`).
- When a product repo is in scope it clones it locally for inspection and cleans it up afterwards.

## Developer

Implements the approved design for a **single scoped functional requirement (FR)**. Makes no architecture decisions — if the design is ambiguous it returns a `NEEDS_ARCHITECT` blocker instead of guessing.

- The task id is **required**.
- Reads `.tmp/<task-id>/handoff.json`; halts if the file is missing or `adr_url` is absent (see [Hard gates](workflow.md)).
- Selects the sub-task by FR label (`/developer <task-id> FR1`); halts and lists options if multiple `sub_tasks` exist and no label was given.
- Stays strictly within FR scope, keeps commits atomic, runs the handoff's `verification_commands`, and reports results in chat.

## Staff

A deep-reading, **read-only** analyst. Never mutates external systems (GitHub/ClickUp/Slite/Figma) — it may only read. It *may* write local report files (e.g. `.tmp/<task-id>/analysis-handoff.json`).

- Cross-document comparison, source-code audits, task-board triage, risk assessment, and PR/commit analysis.
- Always closes with a structured summary: analysis type, sources read, key findings, gaps/risks, recommended actions, local artifacts.
