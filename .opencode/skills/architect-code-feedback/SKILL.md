---
name: architect-code-feedback
description: Provide design-quality feedback on a Developer implementation — structure, boundaries, maintainability, and risk. Use during review when code quality concerns exist, without blocking unless a critical issue is found.
---

# Skill: architect-code-feedback

## Purpose
Provide design-quality feedback on a Developer's implementation — structure, boundaries, maintainability, and risk — without blocking the sub-task from progressing unless a critical issue is found.

## When to Run
- During `architect-progress-review` when the sub-task is likely to receive an **approved** verdict but code quality concerns exist.
- On-demand when the Orchestrator delegates a standalone code review request.
- Do **not** run this skill as a substitute for `architect-progress-review` — scope correctness and acceptance criteria are covered there.

## Inputs
- Target files/modules (from the Developer change report)
- ADR section 3 (High-Level Code Changes) — intended design for comparison
- Repo intel record (language, framework, conventions)
- Sub-task FR label and scope

## Trigger Conditions
Run this skill when any of the following are true:
- A new abstraction or class is introduced that was not in the ADR
- Error handling logic is non-trivial (retries, fallbacks, partial failures)
- A shared utility or interface is modified
- Performance-sensitive code paths are touched (database queries, external HTTP calls, caching)
- The Developer's change report notes non-obvious decisions

Skip this skill when changes are purely additive, mechanical, or fully prescribed by the ADR with no design latitude.

## Steps

### 1. Review structure and boundaries
- Does the new code respect the existing module/package boundaries in the repo?
- Are concerns separated appropriately (e.g. business logic not in controller layer)?
- Does the abstraction level match the surrounding code?

### 2. Review data flow and correctness
- Are inputs validated at the right layer?
- Are error cases handled explicitly or silently swallowed?
- Are there race conditions or shared mutable state that could cause issues under concurrent load?
- Does the implementation match the ADR's stated behavior for edge cases?

### 3. Review maintainability
- Are identifiers named clearly and consistently with the codebase?
- Are there magic numbers or strings that should be constants or config values?
- Are tests readable and independently verifiable?

### 4. Assess risk
For each concern found, classify:
- **Critical** — likely to cause a production bug or security issue; blocks approval.
- **Major** — technical debt or design drift that should be fixed before merge.
- **Minor** — style or naming preference; can be addressed as a follow-up.

### 5. Suggest improvements
For each Major or Critical finding, provide:
- The specific file and line (or function/class) in question.
- What the concern is.
- A concrete suggestion to address it (code snippet if helpful).

Do not suggest refactoring work that is outside the FR scope.

## Output
- Strengths observed (what the Developer did well)
- Findings table (severity, file/location, concern, suggestion)
- Overall code quality verdict: clean / minor concerns / major concerns / critical issues
- Whether this feedback blocks approval (only if a Critical finding exists)
