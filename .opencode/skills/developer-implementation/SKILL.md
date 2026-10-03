---
name: developer-implementation
description: Implement the approved design for the assigned FR with focused, low-risk diffs that stay strictly within sub-task scope. Use after the handoff is validated and the worktree is prepared.
---

# Skill: developer-implementation

## Purpose
Implement the approved design for the assigned FR with focused, low-risk diffs that stay strictly within the sub-task scope.

## Inputs
- Sub-task entry from `handoff.json` (`fr`, `scope`, `acceptance_criteria`, `verification_commands`, `branch`, `worktree_*`)
- Approved ADR (`adr_url`) — read the FR-specific section before writing any code
- Repo intel record (language, framework, build tool, directory conventions)
- UX/design summary (if `design_frames` present in handoff — run `developer-ux-intake` first)

## Pre-flight Checks
Before writing any code:
1. Confirm the worktree is on the correct branch (`git status`).
2. Confirm `adr_url` is present — halt if missing (see `rules/approval-gate.md`).
3. Read the ADR section for the assigned FR. If scope in the handoff conflicts with the ADR, the ADR wins.
4. List the files expected to change (from ADR section 3 "High-Level Code Changes") before touching anything.

## Steps

### 1. Scope boundary check
- Write out the exact files and modules in scope for this FR.
- Mark any file that is **out of scope** and commit to not touching it.
- If ADR scope is ambiguous, halt and surface it to the Orchestrator — do not interpret it yourself.

### 2. Apply changes
- Work file by file in the order implied by the ADR's implementation plan.
- Reuse existing abstractions, utilities, and framework patterns already in the codebase.
- Follow the project's naming, formatting, and directory conventions exactly as observed in the local clone.
- Keep each commit atomic: one logical change per commit.
- Do not mix FR1 changes into a branch for FR2 — keep branches strictly separated.

### 3. Scope enforcement during coding
At the end of each file edit, ask: *"Does this change belong to `<fr-label>`?"* If no, revert it.

Forbidden during implementation:
- Refactoring unrelated code
- Changing test fixtures not related to this FR
- Updating configuration that other FRs depend on
- Adding dependencies not mentioned in the ADR

### 4. Code quality checklist (per file changed)
- [ ] Follows existing naming conventions in this file/module
- [ ] No new dependencies introduced without ADR approval
- [ ] No breaking changes to interfaces shared with other FRs
- [ ] Matches language and framework confirmed by repo intel
- [ ] No `TODO` / `FIXME` left in changed lines unless the ADR explicitly defers them

### 5. Config and environment changes
If the ADR specifies new config/env keys:
- Add them with their documented defaults.
- Add entries to the project's `.env.example` or equivalent config documentation file.
- Never hard-code values that the ADR defines as configurable.

## Output
- List of files changed with a one-line description per file
- Description of what changed and why (linked to acceptance criteria)
- Any non-obvious decisions made and the reason
- Confirmation that the scope boundary was respected (no out-of-scope edits)
