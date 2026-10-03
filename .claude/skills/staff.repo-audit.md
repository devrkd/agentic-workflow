# Skill: staff.repo-audit

## Purpose
Read a local repo clone (or GitHub via MCP fallback) and compare the actual code against a reference document (ADR, spec, or design doc) to surface drift, missing implementations, and undocumented behaviour. Read-only — never edits files or creates commits.

## When to Run
- User asks: "audit the repo against the spec", "does the code match the ADR", "what's implemented vs planned", "find undocumented behaviour"
- Post-implementation review before a release
- Design-vs-code consistency check

## Inputs
- Repo path (local clone under `.tmp/<task-id>/repos/` or `.repos/<repo-name>/`) OR GitHub repo URL
- Reference document URL or ID (ADR, spec doc, or design note)
- Optional: specific FR label or scope to focus the audit

## Steps

### 1. Fetch the reference document
Read the reference doc (or ADR) via the documentation MCP. Extract:
- Functional requirements or acceptance criteria
- Expected file paths, module names, API endpoints
- Data models, config keys, metric names

### 2. Locate the repo
Prefer local clone — use Read, Grep, Glob, `rg` on the local path.
If no local clone exists and a GitHub URL is provided, use GitHub MCP to fetch relevant files.
Never use `search_code` broadly — scope searches to paths and keywords from the reference doc.

### 3. Map requirements to code
For each requirement or expected artifact from the reference doc:

| Requirement | Expected location | Found? | Notes |
|---|---|---|---|
| `FR1: fee tier resolver` | `internal/fees/FeeTierResolver.kt` | ✓ | matches spec |
| `FR2: small balance config` | `application.yml: trading.small_balance_threshold` | ✗ | key missing |

Classification:
- **Implemented** — code matches the spec description
- **Partial** — code exists but differs from spec (wrong field name, missing edge case, etc.)
- **Missing** — expected code not found
- **Undocumented** — code found that has no corresponding spec entry

### 4. Check undocumented behaviour
Grep for logic patterns (conditionals, config keys, feature flags) that are not mentioned in the reference doc. These are candidates for undocumented scope creep or tech debt.

### 5. Check observability
If the ADR section 4 (Metrics and Observability) is present, verify:
- Are all specified metric names present in the code?
- Are structured log fields emitted at the expected call sites?

### 6. Produce verdict
- **Aligned** — all requirements implemented and consistent with spec
- **Partial drift** — some requirements partially implemented or spec details differ
- **Significant drift** — multiple missing or contradicting implementations

## Output
- Requirement-to-code mapping table
- Missing implementations list
- Undocumented behaviour list
- Observability gap list (if ADR section 4 present)
- Overall verdict: aligned / partial drift / significant drift
- Local artifact path if report written to `.tmp/analysis/`
