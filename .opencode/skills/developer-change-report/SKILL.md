---
name: developer-change-report
description: Produce a complete implementation handoff (change summary, files, validation, branch/PR) for Architect verification. Use when a developer sub-task implementation is complete.
---

# Skill: developer-change-report

## Purpose
Produce a complete implementation handoff for Architect verification.

## Inputs
- Final diff
- Validation results

## Steps
1. Summarize behavior changes and rationale.
2. List files touched and test evidence.
3. Report branch and commit details.
4. Include the PR URL only when PR creation is requested.
5. Do **not** remove `.tmp/<task-id>/` — the Orchestrator owns cleanup after all sub-tasks complete. See `rules/cleanup.md`.

## Output
- Change summary
- Files touched
- Validation results
- Branch, commit(s), optional PR URL
- Blocker tag (`NEEDS_ARCHITECT`) if design context was missing
