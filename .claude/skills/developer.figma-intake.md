# developer.figma-intake

Use this skill when the Architect handoff contains `figma_frames`.

## Purpose

Fetch Figma design context before implementation and treat it as the visual source of truth for the assigned FR.

## Steps

1. Read `figma_frames` from `.tmp/<task-id>/handoff.json`.
2. For each frame URL, fetch frame data through the Figma MCP before coding.
3. Extract the implementation-relevant details:
   - layout structure and responsive behavior
   - components and variants
   - spacing, sizing, typography, and color tokens
   - interaction states and empty/loading/error states when visible
4. Compare Figma details with the ADR and assigned `sub_task.scope`.
5. If Figma conflicts with the ADR or the sub-task scope, halt and surface the conflict to Orchestrator before coding.
6. Implement UI changes against the Figma design, using existing project conventions and design-system components.
7. Include a short Figma conformance note in the change report.

## Constraints

- Do not ask the user for a Figma URL if none is present.
- Do not start UI implementation until referenced frames have been fetched.
- Store any scratch notes under `.tmp/<task-id>/` only.
