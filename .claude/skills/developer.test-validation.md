# Skill: developer.test-validation

## Purpose
Validate the implementation for the assigned FR against its acceptance criteria using targeted, requirement-linked checks.

## Inputs
- Sub-task entry: `acceptance_criteria` (array) and `verification_commands` (array) from `handoff.json`
- Changed modules and files (output of `developer.implementation`)
- ADR section 4 (Metrics and Observability) — confirms expected log events and metric names

## Steps

### 1. Map acceptance criteria to tests
For each criterion in `acceptance_criteria`:
- Identify the test file(s) or command that validates it.
- If no existing test covers it, write a new targeted test.
- Record the mapping: criterion → test file:line or command.

Do not write broad coverage tests for code outside the assigned FR scope.

### 2. Run verification commands
Execute every command in `verification_commands` from the handoff exactly as specified:
```bash
# Example
./gradlew :service:test --tests "*FeeTierResolverTest*"
npm run test -- --testPathPattern="OrderPreview"
```
- Capture full stdout/stderr for each command.
- Do not skip a command — if it is not runnable in this environment, note why explicitly.

### 3. Run broader test suite (smoke check)
After targeted tests pass, run the project's standard test command to catch regressions:
```bash
# Confirm with repo intel — examples:
./gradlew test
npm test
pytest
```
If a pre-existing test fails that is unrelated to this FR, note it as a pre-existing failure — do not fix it.

### 4. Evaluate coverage against acceptance criteria

For each criterion in `acceptance_criteria`, classify:
- **Covered** — at least one passing test/command validates this criterion directly.
- **Partially covered** — validation exists but does not cover all edge cases stated.
- **Not covered** — no test validates this criterion; must be noted as a gap.

### 5. Residual risk assessment
Note any scenarios that cannot be validated locally (e.g. integration with external service, production-only config, performance under load). Flag these explicitly so Architect can address them in the change report or ADR.

## Output
- Criterion-to-test mapping table (one row per acceptance criterion)
- Commands executed with pass/fail result and captured output snippet
- Broader test suite result (pass / fail with summary)
- Coverage classification per criterion (covered / partially / not covered)
- Residual risks and untestable scenarios
