# Skill: architect.ux-intake

## Purpose
Fetch UX/design data from the configured `ux` category source for frontend/UI tasks and produce a structured design summary for use in the ADR and Developer handoff.

This skill is **optional** and only runs when a design reference URL (file, frame, or component) is explicitly present in the task, doc, or invocation arguments. Do not ask the user for a design URL if none is provided.

## Inputs
- Design reference URL (file, frame, or component) — must be present to trigger this skill
- Optional: list of specific frame or component names to focus on

## Preconditions
- The `ux` category MCP server and its token must be available. If missing, skip this skill and warn the user:
  > "No ux source is configured. Design intake skipped — bind a provider to the `ux` category in .mcp.json and set UX_PROVIDER_TOKEN in .env to enable this skill."

## Steps
1. Confirm a design reference URL is present. If not, skip this skill entirely.
2. Fetch the design node data via the `ux` MCP using the provided URL.
3. Extract and structure the following design properties:
   - **Layout**: frame dimensions, auto-layout direction, padding, gap/spacing
   - **Components**: component names, variants, and nesting hierarchy
   - **Typography**: font families, sizes, weights, line heights used
   - **Color tokens**: fill colors, stroke colors (prefer design token names where available)
   - **Spacing scale**: recurring spacing values (useful for mapping to CSS/design-system tokens)
   - **Interaction hints**: any prototype links, hover states, or transition notes in the design metadata
4. Cross-reference extracted design constraints against requirements from `doc-intake` output to flag any mismatches (e.g. a doc specifies a button style that conflicts with the design frame).
5. Produce a structured design summary (see Output below).

## Output
```
design_summary:
  source_url: <design-url>
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
- Included in the Developer handoff block under `design_frames`.

## Developer Handoff Format
When this skill produces output, the Architect must add the following to the Developer handoff block:

```
design_frames:
  - url: <design-url>
    summary: |
      <concise prose description of the design: layout, key components, colors, typography>
```

## Notes
- Do not pass raw design-tool API JSON to the model. Use the MCP's simplified output only.
- If the design URL points to a top-level file rather than a specific frame, ask the user which frame or component is relevant before fetching.
- Prefer fetching the smallest scoped node (frame or component) rather than the full file to minimise context noise.
