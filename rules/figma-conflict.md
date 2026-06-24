# Rule: Figma vs ADR Conflict Resolution

Single source of truth for handling conflicts between Figma design data and ADR content.

## When a Conflict Exists

A conflict is any case where Figma specifies a UI behaviour, layout, component, or interaction that contradicts what the ADR documents — or vice versa.

Examples:
- ADR says a modal dialog; Figma shows an inline drawer
- ADR specifies a field as optional; Figma marks it required
- Figma introduces a new component not mentioned in the ADR

## Developer Response

When `developer.figma-intake` detects a conflict:

1. **Halt immediately** — do not begin implementation.
2. Surface the conflict to Orchestrator with this message:

   > "Developer halted: Figma conflict detected for FR `<fr-label>`.
   > **Figma says:** `<description>`
   > **ADR says:** `<description>`
   > Please instruct which source is authoritative before implementation resumes."

3. Do not make a judgment call on which source wins.

## Orchestrator Response

When Orchestrator receives a Figma conflict signal:

1. Surface the conflict to the human with both descriptions and ask:
   > "Which source should Developer follow for FR `<fr-label>`?
   > - **Option A:** Follow Figma — `<figma description>`
   > - **Option B:** Follow ADR — `<adr description>`"

2. Record the human's decision in `.tmp/<task-id>/state.json` under the sub-task entry:
   ```json
   "figma_conflict_resolution": "figma" | "adr"
   ```

3. If the human chooses **Figma**: instruct Architect to update the ADR to match, then re-present for approval before Developer resumes.
4. If the human chooses **ADR**: instruct Developer to disregard the conflicting Figma detail and proceed.

## Architect Response (when ADR update required)

- Fetch full current ADR content before editing.
- Update only the conflicting section; copy all other sections verbatim.
- Re-verify non-empty content after update.
- Re-present ADR for human approval (see `rules/approval-gate.md`).

## Priority (when no conflict)

When Figma and ADR are consistent:
- Figma is the authoritative **visual** reference (spacing, colors, component states, typography).
- ADR is the authoritative **behavioral** reference (API contracts, validation rules, business logic).
