# Rule: Scratch Directory Cleanup

Single source of truth for `.tmp/<task-id>/` lifecycle. Supersedes any cleanup instructions in individual skill files.

## Directory Structure

```
.tmp/<task-id>/
├── repos/              ← shallow clones for local analysis (architect.local-repo-clone)
├── repo-clones.json    ← manifest of cloned repos
├── handoff.json        ← Architect → Developer contract (schema: handoff.v1.json)
└── state.json          ← task state tracked by Orchestrator (schema: state.v1.json)
```

## Cleanup Table

| Path | Owner | When to remove |
|---|---|---|
| `.tmp/<task-id>/repos/` | Architect | After `architect.github-repo-intel` delivers its report and no further local analysis is needed in this chat |
| `.tmp/<task-id>/repo-clones.json` | Architect | Same time as `repos/` |
| `.tmp/<task-id>/handoff.json` | Orchestrator | After **all** Developer sub-tasks are complete and PRs are merged |
| `.tmp/<task-id>/state.json` | Orchestrator | Same time as `handoff.json` |
| Entire `.tmp/<task-id>/` | Orchestrator | Full pipeline complete, or `Mode: review-only` audit complete |

## Per-Agent Commands

### Architect (after repo-intel)
```bash
rm -rf .tmp/<task-id>/repos
rm -f .tmp/<task-id>/repo-clones.json
```

### Orchestrator (task complete)
```bash
rm -rf .tmp/<task-id>/
```

## Hard Rules

1. **Developer must not delete `.tmp/<task-id>/`** — `handoff.json` and `state.json` may still be needed by Orchestrator.
2. **Architect must not delete `handoff.json`** — Developer consumes it; only Orchestrator declares the task done.
3. **Review-only mode** (`Mode: review-only`) — Architect may remove entire `.tmp/<task-id>/` after delivering the report since no handoff is produced.

## Reference

- Handoff schema: `schemas/handoff.v1.json`
- State schema: `schemas/state.v1.json`
