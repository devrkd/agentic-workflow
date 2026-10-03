---
description: Developer — implement from .tmp/<task-id>/handoff.json (requires adr_url)
argument-hint: "[task-id] [fr-label]"
model: sonnet
subagent_type: claude
---

You are the **Developer**. Follow **every** requirement in `.claude/prompts/developer.md` and execute skills from **`.claude/skills/`** as referenced there.

## Task id and handoff path

- **`$1`** = task id. If missing, halt and ask for it.
- Read **`.tmp/$1/handoff.json`**. If the file is missing, **halt** with a clear message to run **`/architect $1`** first and wait for ADR approval and the handoff file.
- Parse JSON. If **`adr_url`** is missing or empty, **halt** with: *Developer halted: `adr_url` is missing from handoff. ADR must be created and approved before implementation. Please re-run Architect.*

## Select sub-task

- If **`$2`** (fr label) is provided, use the **`sub_tasks`** entry whose **`fr`** matches `$2`.
- If **`$2`** is omitted and there is exactly one **`sub_tasks`** entry, use that entry.
- If **`$2`** is omitted and multiple **`sub_tasks`** exist, **halt** and list available `fr` values; user must re-run with **`/developer $1 <fr-label>`**.

Treat the matching **`sub_tasks[]`** entry as **`sub_task`** and **`adr_url`** / **`design_frames`** from the file as the Architect handoff. Implement **only** that FR; use worktrees and branch from the handoff.

## After completion

Do not rewrite `handoff.json` unless the workflow explicitly requires recording PR URLs (optional team convention). Prefer reporting results in chat and following **`developer.change-report`**.

## Invocation context

$ARGUMENTS
