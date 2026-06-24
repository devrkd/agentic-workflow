# Skill: architect.figma-intake

## Purpose
Fetch Figma design data for frontend/UI tasks and produce a structured design summary for use in the ADR and Developer handoff.

This skill is **optional** and only runs when a Figma URL (file, frame, or component) is explicitly present in the task, Slite doc, or invocation arguments. Do not ask the user for a Figma URL if none is provided.

## Inputs
- Figma URL (file, frame, or component) — must be present to trigger this skill
- Optional: list of specific frame or component names to focus on

## Preconditions
- `FIGMA_API_KEY` must be set in the environment. If missing, skip this skill and warn the user:
  > "Figma MCP is not configured (FIGMA_API_KEY missing). Design intake skipped — provide the token in .env to enable this skill."

## Steps
1. Confirm a Figma URL is present. If not, skip this skill entirely.
2. Fetch the Figma node data via the Figma MCP using the provided URL.
3. Extract and structure the following design properties:
   - **Layout**: frame dimensions, auto-layout direction, padding, gap/spacing
   - **Components**: component names, variants, and nesting hierarchy
   - **Typography**: font families, sizes, weights, line heights used
   - **Color tokens**: fill colors, stroke colors (prefer design token names where available)
   - **Spacing scale**: recurring spacing values (useful for mapping to CSS/design-system tokens)
   - **Interaction hints**: any prototype links, hover states, or transition notes in the Figma metadata
4. Cross-reference extracted design constraints against requirements from `doc-intake` output to flag any mismatches (e.g. a Slite doc specifies a button style that conflicts with the Figma frame).
5. Produce a structured design summary (see Output below).

## Output
```
figma_design_summary:
  source_url: <figma-url>
  frames:
    - name: <frame name>
      dimensions: <W x H>
      layout: <direction, padding, gap>
  components:
    - name: <component name>
      variants: [<variant list>]
  typography:
    - role: <e.g. heading-1, body, label>
      font: <family>
      size: <px>
      weight: <value>
  colors:
    - token: <name or hex>
      usage: <e.g. primary-bg, cta-text>
  spacing_scale: [<values in px>]
  interaction_hints: <notes or "none">
  design_conflicts: [<list of mismatches with doc-intake requirements, or empty>]
```

This output must be:
- Included in the ADR under a **Design Reference** section.
- Included in the Developer handoff block under `figma_frames`.

## Developer Handoff Format
When this skill produces output, the Architect must add the following to the Developer handoff block:

```
figma_frames:
  - url: <figma-url>
    summary: |
      <concise prose description of the design: layout, key components, colors, typography>
```

## Notes
- Do not pass raw Figma API JSON to the model. Use the MCP's simplified output only.
- If the Figma URL points to a top-level file rather than a specific frame, ask the user which frame or component is relevant before fetching.
- Prefer fetching the smallest scoped node (frame or component) rather than the full file to minimise context noise.
