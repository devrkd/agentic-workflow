---
name: architect-github-repo-intel
description: Inspect target repositories to confirm language, framework, build tool, test framework, and layout. Hard gate before any design or ADR authoring; use with a local clone, falling back to the GitHub MCP server.
---

# Skill: architect-github-repo-intel

## Purpose
Inspect target repositories to produce accurate, language-specific design and code guidance. This skill is a **hard gate** — the Architect must not produce a design, code change list, or ADR until repo intel is confirmed. Guessing the tech stack is not permitted.

## Inputs
- Repo hints from task details or source docs (org default: `your-org`)
- **`task_id`** for `.tmp/<task-id>/` paths
- **Local clone** from `architect-local-repo-clone` (preferred)
- GitHub MCP server (`github_*` tools) — fallback only when the local clone failed or is unavailable

## Hard Gate Rule
**Design and ADR authoring must not begin until the following are confirmed for every affected repo:**
- Primary language and version (e.g. Kotlin 1.9, TypeScript 5)
- Framework (e.g. Spring Boot, Ktor, React, Next.js)
- Build tool (e.g. Gradle, Maven, pnpm, npm)
- Test framework (e.g. JUnit 5, Kotest, Jest, Vitest, Playwright)
- Key directory layout (e.g. where services, handlers, models, tests live)

If any of these cannot be confirmed, the Architect must ask the user before proceeding (see Fallback below).

## Steps

### 0. Local clone (required when repo is accessible via git)
For each resolved repo, run **`architect-local-repo-clone`** first.

- Read `.tmp/<task-id>/repo-clones.json` for `path` and `clone_status`
- When `clone_status` is `ok`, set `local_path` to the recorded clone path
- **Do not** use GitHub MCP `search_code` or bulk `get_file_contents` for that repo while `local_path` exists

If clone failed, proceed to step 2 using the **GitHub MCP fallback** only for that repo.

### 1. Resolve repo slugs
Repo URLs and hints may come from any of the following sources — check all before falling back to the user:

1. **Invocation input** — explicit `Repo:` or `repo_url:` field, or any bare `github.com/<owner>/<repo>` URL.
2. **Source doc** (from `architect-doc-intake` output) — `repo_urls_in_doc` list.
3. **Task** (from `architect-task-intake` output) — `repo_urls_in_task` list.
4. **Implicit org default** — if only a repo name (no owner) is found, normalize to `your-org/<repo-name>`.

- Parse any `github.com/<owner>/<repo>` URL found in any source; strip trailing path segments (e.g. `/tree/main`) to obtain the canonical `owner/repo`.
- Normalize to `owner/repo` (default org: `your-org`).
- If no repo can be identified from any source above, ask the user explicitly before proceeding.

### 2. Inspect each repo via local clone (preferred)
When `local_path` is available from step 0, use **only** local tools:

a. **Repository layout** — list clone root; read `README.md` if present.

b. **Root directory listing** — identify build files and project structure indicators:
   - `build.gradle.kts` / `pom.xml` → JVM (Kotlin/Java)
   - `package.json` → Node.js (check `dependencies` for React, Next.js, Vue, etc.)
   - `Cargo.toml` → Rust
   - `go.mod` → Go
   - `pyproject.toml` / `setup.py` → Python

c. **Key source directories** — list `src/`, `app/`, `internal/`, `lib/`, `services/`, or equivalent.

d. **Sample source file** — Read one representative file under `local_path` (handler, service, or controller).

e. **Test directory** — locate tests; Read one sample test file for framework imports.

f. **OpenAPI / API schema** — search under `local_path` for `openapi.yaml`, `swagger.yaml`, `api/`, `docs/api/`.

**Optional:** GitHub MCP may be used only to read the default branch name when `ref` was omitted and the clone script needed it.

### 2b. Task-scoped code analysis (required when local clone exists)
Scale depth to task complexity: narrow change → 1–3 files; cross-cutting → up to 8–10 files.

For each repo with `local_path`:

a. **Keyword search** — derive terms from task requirements (feature names, API paths, domain nouns). Use **`rg`** or **Grep** under `local_path`. Aim for 3–6 files for focused tasks.

b. **Read relevant files** — for each candidate, Read under `local_path`:
   - Existing implementations to extend or integrate with
   - Naming conventions and patterns
   - Interfaces and types to conform to

c. **Test coverage pattern** — Read one nearby test file for structure and mocking style.

d. **Design-vs-code audits** — when comparing a design doc to code:
   - Extract concrete deliverables from the doc (message ids, REST paths, table names, config keys, services)
   - For each deliverable, `rg` under `local_path` and record **implemented** | **partial** | **missing**
   - Cite file paths relative to repo root (e.g. `services/rfq-engine/...`)

e. **Record findings** — `relevant_existing_code` per repo (see step 4).

If local search returns no hits, broaden to key directories from step 2c or ask the user to point to the area.

### 2-alt. GitHub MCP fallback (clone failed only)
When `local_path` is unavailable, use the GitHub MCP server (`github_*` tools):

a. Repository metadata — default branch, language breakdown.

b. Root directory listing via `get_file_contents`.

c.–f. Same checks as step 2, via MCP fetches.

g. Task-scoped analysis via `search_code` and `get_file_contents` (limited to necessary files).

### 3. Fallback — if git and GitHub are both unavailable
If local clone failed and GitHub MCP returns 401, 403, or repo not found:
- **Do not guess or infer the tech stack.**
- Ask the user directly with this exact set of questions (one message):
  > "I cannot access the repository via git or GitHub. To produce accurate design and code guidance, please confirm for each affected repo:
  > 1. Primary language and version (e.g. Kotlin 1.9, TypeScript 5.x)
  > 2. Framework (e.g. Spring Boot, Ktor, React, Next.js)
  > 3. Build tool (e.g. Gradle, pnpm)
  > 4. Test framework (e.g. JUnit 5, Kotest, Jest, Playwright)
  > 5. Rough directory layout — where are services/handlers/components and tests?"
- Record the user's answers as the confirmed tech stack. Proceed only after receiving answers.

### 4. Confirm and record repo intel
Produce a repo intel record for each repo containing:
- `repo`: `owner/repo`
- `local_path`: clone path when available, or `null`
- `default_branch`: confirmed branch name
- `language`: confirmed primary language + version
- `framework`: confirmed framework(s)
- `build_tool`: confirmed build tool
- `test_framework`: confirmed test framework(s)
- `source_layout`: key directories with their purpose
- `api_schema_file`: path to OpenAPI/Swagger file if found, or "not found"
- `sample_file_inspected`: path of the file read in step 2d
- `relevant_existing_code`:
  - `candidate_files`: list of existing file paths likely touch-points for this task
  - `patterns_observed`: key coding patterns, naming conventions, or interfaces noted
  - `test_pattern_file`: path of the test file inspected and a brief note on its structure
  - `design_vs_code` (when applicable): list of `{ requirement, status, evidence_paths[] }`
- `confidence`: `confirmed-via-local-clone` | `confirmed-via-github-fallback` | `confirmed-via-user`

This record is passed as a required input to `architect-adr-authoring` and must be referenced when drafting code snippets, file paths, and language-specific guidance.

### 5. Cleanup reminder
After repo intel and any audit report are delivered, remove `.tmp/<task-id>/repos/` per `architect-local-repo-clone` unless `handoff.json` still needs the same task folder for other artifacts.

## Output
- Repo intel record per repo (see step 4 format)
- Confirmation that the hard gate is satisfied: all language/framework fields are populated
- Any open questions or ambiguities to resolve with the user
