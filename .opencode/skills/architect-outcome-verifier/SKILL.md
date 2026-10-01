---
name: architect-outcome-verifier
description: Verify that the full set of implemented FRs satisfies the original requirements and produce a final verdict. Use after all sub-tasks are approved, as the final step before task closure.
---

# Skill: architect-outcome-verifier

## Purpose
Verify that the full set of implemented sub-tasks satisfies the original requirements and produce a final verdict for the Orchestrator.

## When to Run
- After all sub-tasks have been approved by `architect-progress-review`.
- Invoked by the Orchestrator as the final step before task closure.
- May also be run standalone for post-implementation audits.

## Inputs
- Source requirement doc URL from the handoff
- Approved ADR (`adr_url`)
- All Developer change reports (one per sub-task)
- All `architect-progress-review` verdicts and evidence tables
- Task ID/URL (optional)

## Steps

### 1. Compile requirement list
Fetch the requirement doc and extract every functional requirement (FR1, FR2, ...) and any non-functional constraints (performance, security, observability). This is the master checklist.

### 2. Build evidence map
For each requirement, collect all evidence from change reports and progress-review verdicts:

| Requirement | FR label | Implementation evidence | Review verdict | Test result |
|---|---|---|---|---|
| `<requirement text>` | FR1 | `<files/logic changed>` | approved | pass |

### 3. Classify each requirement

- **Match** — evidence directly satisfies the requirement; review approved; tests pass.
- **Partial match** — requirement is addressed but with gaps, deferred items, or `[verify with team]` markers that were not resolved.
- **Mismatch** — requirement was not implemented, implemented incorrectly, or its test coverage was classified as "not covered."

### 4. Check observability completeness
Cross-reference ADR section 4 (Metrics and Observability) against change reports:
- All specified metrics emitted?
- All structured log fields added?
- Dashboard and runbook pointers created?

Flag any gap as a partial match or mismatch.

### 5. Produce final verdict

- **Fully satisfied** — all requirements are Match; no critical or major gaps.
- **Partially satisfied** — one or more Partial matches; no Mismatches; document all gaps.
- **Not satisfied** — one or more Mismatches; list with severity and required remediation.

### 6. Report the summary
Deliver the summary in chat (and optionally `.tmp/<task-id>/outcome.md`), with:
- First line: AI disclaimer (see `rules/disclaimers.md`)
- Final verdict
- Requirement-to-evidence table
- Gap list with severity (critical / major / minor) if any
- Recommended follow-up actions

> Do **not** post to an external task board — none is wired in this opencode setup.

## Output
- Requirement-to-evidence table (all FRs)
- Final verdict: fully satisfied / partially satisfied / not satisfied
- Gap list with severity
- Observability completeness check
- Summary location
