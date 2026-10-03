---
name: developer-ux-intake
description: Fetch UX/design context from the configured ux category source before implementation and treat it as the visual source of truth for the assigned FR. Use when the Architect handoff contains design_frames and a ux source is configured.
---

# Skill: developer-ux-intake

Use this skill when the Architect handoff contains `design_frames`.

> **MCP availability:** the `ux` category is **not** bound to an MCP server in this opencode setup. If no `ux` source is configured, note that visual validation could not be performed, implement from the written spec/ADR, and flag the gap in the change report.

## Purpose

Fetch UX/design context from the configured `ux` category source before implementation and treat it as the visual source of truth for the assigned FR.

## Steps

1. Read `design_frames` from `.tmp/<task-id>/handoff.json`.
2. For each frame URL, fetch frame data through the `ux` MCP before coding.
3. Extract the implementation-relevant details:
   - layout structure and responsive behavior
   - components and variants
   - spacing, sizing, typography, and color tokens
   - interaction states and empty/loading/error states when visible
4. Compare the design details with the ADR and assigned `sub_task.scope`.
5. If the design conflicts with the ADR or the sub-task scope, halt and surface the conflict to the Orchestrator before coding (see `rules/design-conflict.md`).
6. Implement UI changes against the design, using existing project conventions and design-system components.
7. Include a short design conformance note in the change report.

## Constraints

- Do not ask the user for a design URL if none is present.
- Do not start UI implementation until referenced frames have been fetched.
- Store any scratch notes under `.tmp/<task-id>/` only.
