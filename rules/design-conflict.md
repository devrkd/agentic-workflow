# Rule: UX Design vs ADR Conflict Resolution

Single source of truth for handling conflicts between UX/design data (from the provider bound to the `ux` category) and ADR content.

## When a Conflict Exists

A conflict is any case where the design specifies a UI behaviour, layout, component, or interaction that contradicts what the ADR documents — or vice versa.

Examples:
- ADR says a modal dialog; the design shows an inline drawer
- ADR specifies a field as optional; the design marks it required
- The design introduces a new component not mentioned in the ADR

## Developer Response

When `developer.ux-intake` detects a conflict:

1. **Halt immediately** — do not begin implementation.
2. Surface the conflict to Orchestrator with this message:

   > "Developer halted: UX/design conflict detected for FR `<fr-label>`.
   > **Design says:** `<description>`
   > **ADR says:** `<description>`
   > Please instruct which source is authoritative before implementation resumes."

3. Do not make a judgment call on which source wins.

## Orchestrator Response

When Orchestrator receives a design conflict signal:

1. Surface the conflict to the human with both descriptions and ask:
   > "Which source should Developer follow for FR `<fr-label>`?
   > - **Option A:** Follow the design — `<design description>`
   > - **Option B:** Follow ADR — `<adr description>`"

2. Record the human's decision in `.tmp/<task-id>/state.json` under the sub-task entry:
   ```json
   "design_conflict_resolution": "design" | "adr"
   ```

3. If the human chooses **design**: instruct Architect to update the ADR to match, then re-present for approval before Developer resumes.
4. If the human chooses **ADR**: instruct Developer to disregard the conflicting design detail and proceed.

## Architect Response (when ADR update required)

- Fetch full current ADR content before editing.
- Update only the conflicting section; copy all other sections verbatim.
- Re-verify non-empty content after update.
- Re-present ADR for human approval (see `rules/approval-gate.md`).

## Priority (when no conflict)

When the design and ADR are consistent:
- The design is the authoritative **visual** reference (spacing, colors, component states, typography).
- ADR is the authoritative **behavioral** reference (API contracts, validation rules, business logic).
