# Skill Catalog

This repository uses a docs-managed skill system to separate role boundaries from reusable capabilities.

## How to use

- Roles in `.claude/prompts/` define authority and constraints.
- Skills in `.claude/skills/` define repeatable workflows.
- Rules in `rules/` define cross-cutting policies (disclaimers, gates, cleanup, conflict resolution).
- Orchestrator assigns required skills for each delegation.

## Available skills

### Architect
- `architect.task-intake.md`
- `architect.doc-intake.md`
- `architect.ux-intake.md`
- `architect.local-repo-clone.md`
- `architect.github-repo-intel.md`
- `architect.adr-authoring.md`
- `architect.progress-review.md`
- `architect.outcome-verifier.md`
- `architect.code-feedback.md`

### Staff
- `staff.doc-compare.md`
- `staff.repo-audit.md`
- `staff.task-triage.md`
- `staff.risk-assessment.md`

### Developer
- `developer.worktree-bootstrap.md`
- `developer.ux-intake.md`
- `developer.implementation.md`
- `developer.test-validation.md`
- `developer.change-report.md`

## Cross-cutting rules

Rules in `rules/` are referenced by skills and prompts — not repeated in them:

| Rule file | What it governs |
|---|---|
| `rules/disclaimers.md` | Task and documentation AI disclaimer format |
| `rules/approval-gate.md` | ADR human approval gate definition and state transitions |
| `rules/cleanup.md` | `.tmp/<task-id>/` lifecycle and ownership per agent |
| `rules/design-conflict.md` | How to resolve UX-design vs ADR conflicts |
