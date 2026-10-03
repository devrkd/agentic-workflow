---
title: Reference
description: The 18 skills grouped by agent, MCP availability, shared assets, guardrails and permissions, and the two parallel harnesses
---

# Reference

## Skills

Skills are reusable step-by-step workflow documents under **`.opencode/skills/<name>/SKILL.md`**. Agent definitions reference them by name and load them on demand; the skill list is also surfaced to the model automatically. There are 18 skills, grouped by owning agent:

| Agent | Skills |
|---|---|
| **architect** (9) | `architect-task-intake`, `architect-doc-intake`, `architect-ux-intake`, `architect-local-repo-clone`, `architect-github-repo-intel`, `architect-adr-authoring`, `architect-progress-review`, `architect-outcome-verifier`, `architect-code-feedback` |
| **developer** (5) | `developer-worktree-bootstrap`, `developer-ux-intake`, `developer-implementation`, `developer-test-validation`, `developer-change-report` |
| **staff** (4) | `staff-doc-compare`, `staff-repo-audit`, `staff-task-triage`, `staff-risk-assessment` |

Skills whose source category is not bound in opencode (e.g. `architect-task-intake` → `task`, `architect-ux-intake` → `ux`) degrade gracefully: the agent states the source is unavailable and proceeds with what is accessible rather than fabricating data.

## MCP availability

opencode is configured with the **GitHub MCP server** (`opencode.json` → `mcp.github`, a remote endpoint at `api.githubcopilot.com/mcp/` with a `GITHUB_TOKEN` bearer header). Tool names are prefixed `github_*`.

The `task`, `documentation`, and `ux` source categories are declared in `opencode.json` (`mcp.task` / `mcp.documentation` / `mcp.ux`, disabled by default) and in `.mcp.json` for the parallel **Claude Code** path. **No provider is bound by default** — bind one per category to enable the corresponding skills; agents discover at runtime which category servers are connected and proceed with local repos, GitHub, and user-provided content when a category is unbound.

## Shared assets

| Path | Purpose |
|---|---|
| `rules/` | Cross-cutting policies: [approval-gate.md](https://github.com/devrkd/mentat/blob/main/rules/approval-gate.md) (ADR human approval gate), [cleanup.md](https://github.com/devrkd/mentat/blob/main/rules/cleanup.md) (`.tmp/` lifecycle), [disclaimers.md](https://github.com/devrkd/mentat/blob/main/rules/disclaimers.md) (exact AI-content disclaimer formats for task/documentation sources), [design-conflict.md](https://github.com/devrkd/mentat/blob/main/rules/design-conflict.md) (UX-design-vs-ADR conflicts), [README.md](https://github.com/devrkd/mentat/blob/main/rules/README.md) (index) |
| `schemas/` | JSON Schemas: [handoff.v1.json](https://github.com/devrkd/mentat/blob/main/schemas/handoff.v1.json) (+ non-secret example), [state.v1.json](https://github.com/devrkd/mentat/blob/main/schemas/state.v1.json) — see [Handoff](handoff.md) |
| `scripts/` | `new-worktree.sh` (canonical clone + per-task/role worktree), `clone-repo-for-analysis.sh` (shallow clone into `.tmp/<task-id>/repos/`), `slack-server.sh` (headless opencode server with the Slack bridge), `healthcheck.sh` (branch/commit/date), `push-metrics.sh` (Claude Code Stop-hook metrics — Claude-only) |
| `metrics/` | Prometheus + Grafana stack for **Claude Code** usage/cost dashboards (Claude-only) |
| `.opencode/plugins/`, `.opencode/lib/` | The opencode Slack bridge plugin (see [Slack integration](slack-integration.md)) |

## Guardrails and configuration

- **Permissions** (`opencode.json`): read/edit/glob/grep/list/task are allowed; `bash` has an explicit allowlist (safe read-only commands, `git`/`gh` read + write commands, `npm`/`node`, `scripts/*.sh`) with `ask` as the default; destructive commands (`rm`, `git push --force`, `git reset --hard`, `git clean`, branch deletion, worktree removal) are denied.
- **Environment**: `cp .env.example .env`, then `export GITHUB_TOKEN=...` (opencode reads env vars; it does not load `.env` automatically — with one exception: the Slack plugin, see [Slack integration](slack-integration.md)).
- **`.tmp/`, `.repos/`, `.worktrees/`, `.env`, `metrics/data/`** are gitignored.

## Two harnesses in parallel

- `AGENTS.md` / `.opencode/` — the opencode harness described on this site.
- `CLAUDE.md` / `.claude/` — the original Claude Code harness (commands, prompts, skills, hooks). It supports the `task` / `documentation` / `ux` source categories via `.mcp.json` bindings, which opencode does not read.
