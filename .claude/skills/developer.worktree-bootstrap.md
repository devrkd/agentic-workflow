# Skill: developer.worktree-bootstrap

## Purpose
Prepare an isolated implementation workspace safely.

## Inputs
- Task id
- Repo slug/name
- Base branch

## Steps
1. Ensure canonical clone exists under `.repos/`.
2. Create a task-scoped worktree under `.worktrees/`.
3. Create a dedicated branch for implementation.
4. Confirm branch and path before editing.
5. Create scratch directory `mkdir -p .tmp/<task-id>/` at workspace root for any intermediate data writes during this task.

## Output
- Canonical clone path
- Worktree path
- Branch name
- Scratch directory: `.tmp/<task-id>/`
- Bootstrap command evidence
