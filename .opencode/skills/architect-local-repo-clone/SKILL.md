---
name: architect-local-repo-clone
description: Clone target product repositories into .tmp/<task-id>/repos so the architect can inspect code locally instead of via GitHub search. Use before github-repo-intel whenever a repo is in scope.
---

# Skill: architect-local-repo-clone

## Purpose
Clone target product repositories into the workspace scratch area so Architect can inspect code **locally** (Read, Grep, Glob, `rg`) instead of via GitHub MCP HTTP search. Run **before** `architect-github-repo-intel` whenever a `github.com` or `gitlab.com` repo is in scope.

## Inputs
- **`task_id`** (required) — e.g. `RTD-541` or `audit-rfq-config`; used for `.tmp/<task-id>/`
- **Repo** — URL (`https://github.com/owner/repo`) or slug (`owner/repo`); may come from invocation, source doc, or task
- **`ref`** (optional) — branch, tag, or commit; default is remote default branch (shallow clone)

## When to run
- Mandatory before `architect-github-repo-intel` when any product repo is identified
- Mandatory for **design-vs-code** / **implementation-audit** / **review-only** invocations that compare docs to code
- Skip only when the user explicitly states no git access and accepts GitHub MCP fallback

## Steps

### 1. Resolve repo slug
- Parse `github.com/<owner>/<repo>` or `gitlab.com/<owner>/<repo>`; strip `/tree/...`, `/blob/...`, `.git` suffix
- Normalize bare names to `your-org/<name>` when org is implied from context
- If no repo can be resolved, ask the user before proceeding

### 2. Clone (prefer script)
From the **workspace root** (this template repo), run:

```bash
scripts/clone-repo-for-analysis.sh \
  --task-id <task-id> \
  --repo-url <url-or-github.com/owner/repo> \
  [--ref <branch-or-tag>]
```

Capture `clone_path=` from stdout.

**Manual equivalent** (if script unavailable):
- Target: `.tmp/<task-id>/repos/<owner>-<repo>/`
- `mkdir -p .tmp/<task-id>/repos`
- Shallow clone: `git clone --depth 1 [--branch <ref>] <git-url> .tmp/<task-id>/repos/<owner>-<repo>/`
- If directory exists and contains `.git`, update: `git -C <path> fetch --depth 1 origin` and `git -C <path> checkout <ref>` when `ref` is set

### 3. Record manifest
Append or write `.tmp/<task-id>/repo-clones.json`:

```json
{
  "task_id": "<task-id>",
  "clones": [
    {
      "repo": "owner/repo",
      "path": ".tmp/<task-id>/repos/owner-repo",
      "ref": "<branch-or-default>",
      "cloned_at": "<ISO-8601>"
    }
  ]
}
```

Merge entries when multiple repos are cloned in one task.

### 4. Local analysis rule (downstream)
After a successful clone, **all** repo file inspection for this task must use:
- **Read**, **Grep**, **Glob** on paths under `clone_path`
- Shell **`rg`**, **`find`**, **`ls`** scoped to `clone_path`

**Do not** use GitHub MCP `search_code` or bulk `get_file_contents` for files that exist in the local clone.

GitHub MCP is allowed only for:
- Resolving the default branch name when `ref` was omitted and the clone needs `--branch`
- Fallback when clone fails (see step 5)

### 5. Fallback — clone failure
If `git clone` fails (no git, auth, network, disk):
- Log the error in chat
- Set `clone_status: failed` on that repo in `repo-clones.json`
- Proceed with the `architect-github-repo-intel` **GitHub MCP fallback** path
- Do **not** guess the tech stack

### 6. Cleanup
See `rules/cleanup.md` for the authoritative cleanup policy and ownership table.

Architect is responsible for removing only the local clone after analysis:
```bash
rm -rf .tmp/<task-id>/repos
rm -f .tmp/<task-id>/repo-clones.json
```

Do **not** remove `handoff.json`, `state.json`, or the entire `.tmp/<task-id>/` directory — that is the Orchestrator's responsibility after all sub-tasks complete.

## Output
- `repo-clones.json` path
- Per repo: `clone_path`, `ref`, `clone_status` (`ok` | `failed`)
- Instruction for `architect-github-repo-intel`: use `clone_path` as `local_path` when `ok`

## Hard gate
`architect-github-repo-intel` must not use GitHub code search when `clone_status` is `ok` for that repo.
