---
title: Commands
description: The four slash commands — /orchestrator, /architect, /developer, /staff — their agents, usage, and how arguments flow
---

# Commands

Slash commands are defined in [`.opencode/command/`](https://github.com/devrkd/mentat/blob/main/.opencode/command/). Each file binds a command to an agent via frontmatter and injects the arguments.

| Command | Agent | Usage |
|---|---|---|
| `/orchestrator` | orchestrator | `/orchestrator RTD-541 implement the checkout fix` |
| `/architect` | architect | `/architect RTD-541` |
| `/developer` | developer | `/developer RTD-541 FR1` |
| `/staff` | staff | `/staff compare docs A and B for gaps` |

## Per-command notes

- `.opencode/command/orchestrator.md` — passes `$ARGUMENTS` to the Orchestrator.
- `.opencode/command/architect.md` — `$1` = optional task id, plus `$ARGUMENTS`.
- `.opencode/command/developer.md` — `$1` = required task id, `$2` = optional FR label; instructs reading `.tmp/$1/handoff.json` and halting if it is missing or `adr_url` is absent.
- `.opencode/command/staff.md` — passes `$ARGUMENTS`; instructs writing findings to `.tmp/<task-id>/analysis-handoff.json`.

How these commands drive a task end to end is covered in [Workflow](workflow.md).
