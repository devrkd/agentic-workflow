# Rules

Cross-cutting policies shared across all agents. Skills and prompts reference these files rather than repeating the policy inline.

| File | What it governs |
|---|---|
| `disclaimers.md` | Exact format for AI-generated content disclaimers in ClickUp and Slite |
| `approval-gate.md` | ADR human approval gate: how it works, who enforces it, state transitions |
| `cleanup.md` | `.tmp/<task-id>/` directory lifecycle: who removes what and when |
| `figma-conflict.md` | How agents handle conflicts between Figma design data and ADR content |
