# Skill: staff.risk-assessment

## Purpose
Produce a structured risk and impact assessment for a proposed change, feature, or architectural decision by reading source docs, ADRs, code, and task context. Read-only — never modifies any source.

## When to Run
- User asks: "what are the risks", "impact assessment", "what could go wrong", "risk surface", "what depends on this"
- Before approving an ADR or design doc
- Pre-release risk review
- When a change touches shared infrastructure, APIs, or high-traffic code paths

## Inputs
- Primary subject: ADR URL, Slite doc URL, PR URL, or free-form description of the change
- Optional: repo path or GitHub URL for code context
- Optional: ClickUp task ID for scope and timeline context

## Steps

### 1. Understand the change
Fetch and read the primary subject (ADR, spec, or PR diff). Extract:
- What is changing (scope)
- What systems or services are affected
- What external contracts are touched (APIs, schemas, events, config keys)
- What the rollout plan is (phased, flag-gated, immediate)

### 2. Identify risk dimensions
Evaluate each dimension below. For each, note whether it applies and why:

| Dimension | Questions to ask |
|---|---|
| **Correctness** | Can this change produce wrong results under edge cases? Are all code paths covered by tests? |
| **Backwards compatibility** | Does this change break existing API consumers, data formats, or config contracts? |
| **Performance** | Does this add database queries, external HTTP calls, or computation to hot paths? |
| **Security** | Does this change authentication, authorisation, input validation, or data exposure? |
| **Observability** | Will failures be visible? Are metrics, logs, and alerts in place before rollout? |
| **Rollback** | Can this be reverted safely? Are there database migrations or irreversible state changes? |
| **Dependency** | Does this change block or unblock other in-flight tasks? What does it depend on? |
| **Data integrity** | Does this touch stored data or migrations? Is there a backfill or dual-write needed? |
| **Operational** | Does this require infrastructure changes, runbook updates, or on-call awareness? |

### 3. Classify each risk

| Risk | Dimension | Likelihood | Impact | Severity |
|---|---|---|---|---|
| Fee tier applied to wrong segment | Correctness | Medium | High | **Critical** |
| Config key missing in prod | Operational | Low | High | **Major** |
| Tooltip copy unclear to users | UX | High | Low | **Minor** |

Severity matrix:
- **Critical** — High impact + Medium/High likelihood; must be resolved before rollout
- **Major** — High impact + Low likelihood, or Medium impact + Medium likelihood; should be addressed
- **Minor** — Low impact regardless of likelihood; can be deferred

### 4. Check mitigation coverage
For each Critical or Major risk, check whether the ADR or spec already addresses it:
- Is there a feature flag for staged rollout?
- Is there a rollback procedure documented?
- Are alert thresholds defined for the affected metrics?
- Is the runbook updated?

Flag unmitigated Critical or Major risks explicitly.

### 5. Dependency map
List what this change blocks and what it depends on:
```
This change depends on:
  - [RTD-532] Config service: small_balance_threshold key deployed to prod

This change blocks:
  - [RTD-544] Frontend fee display (needs API response field fee_tier)
```

## Output
- Change scope summary (2–3 bullets)
- Risk table (all dimensions evaluated, classified)
- Unmitigated Critical/Major risks (explicit list)
- Mitigation coverage assessment per risk
- Dependency map (depends-on + blocks)
- Recommended actions before rollout (priority order)
- Overall risk verdict: **low** / **medium** / **high** / **critical**
- Local artifact path if report written to `.tmp/analysis/`
