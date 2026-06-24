# Skill: architect.doc-intake

## Purpose
Collect source-of-truth requirements from documentation systems (for example Slite) before planning.

## Inputs
- Documentation URL(s), ID(s), or query terms (optional)
- Optional doc-space/workspace hint

If documentation references are not provided, the Architect must ask the user whether a Slite doc (or other doc) exists for this task.

## Steps
1. If documentation references are not provided, ask the user for Slite doc ID/URL.
2. Fetch relevant documents via configured documentation MCP/API.
3. Extract requirements, constraints, ADR decisions, and acceptance expectations.
3a. Extract any `github.com` or `gitlab.com` repository URLs embedded in the document body
    (as hyperlinks or raw text). Record these as `repo_urls_in_doc` in the output for
    consumption by `architect.github-repo-intel`.
4. Cross-check with task intake and flag conflicts or gaps.
5. Produce a consolidated requirement summary for implementation planning.

Note: If the Slite doc does not reference a ClickUp task, Architect should attempt to create a ClickUp task (per ClickUp Creation Rule) when CLICKUP_API_TOKEN is available; otherwise, prompt the user for a ClickUp task destination.

## Output
- Documentation summary
- Key requirements and constraints
- ADR implications for implementation
- Conflicts/gaps to resolve
- `repo_urls_in_doc`: list of `github.com`/`gitlab.com` repository URLs found in the document body (may be empty)

## ADR Trigger Rule
- If the task requires ADR creation or update, hand off to `architect.adr-authoring` and enforce ADR template usage from Slite note `XA-ubsJJqzQTDl`.
