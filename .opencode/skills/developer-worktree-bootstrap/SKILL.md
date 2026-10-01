---
name: developer-worktree-bootstrap
description: Prepare an isolated implementation workspace — canonical clone, task-scoped worktree, and dedicated branch — before editing code. Use at the start of any developer implementation task.
---

# Skill: developer-worktree-bootstrap

## Purpose
Prepare an isolated implementation workspace safely.

## Inputs
- Task id
- Repo slug/name
- Base branch

## Steps
1. Ensure a canonical clone exists under `.repos/` (see `scripts/new-worktree.sh`).
2. Create a task-scoped worktree under `.worktrees/`.
3. Create a dedicated branch for implementation.
4. Confirm branch and path before editing.
5. Create the scratch directory `mkdir -p .tmp/<task-id>/` at the workspace root for any intermediate data writes during this task.

## Output
- Canonical clone path
- Worktree path
- Branch name
- Scratch directory: `.tmp/<task-id>/`
- Bootstrap command evidence
