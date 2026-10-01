---
name: architect-doc-intake
description: Collect source-of-truth requirements from documentation systems (e.g. Slite) before planning, extracting requirements, constraints, and embedded repo URLs. Use when the architect needs to read spec or requirement documents.
---

# Skill: architect-doc-intake

## Purpose
Collect source-of-truth requirements from documentation systems before planning.

> **MCP availability:** Slite is **not** wired in this opencode setup. If no doc MCP is available, ask the user to paste the relevant document content or provide a locally readable file, and proceed from that.

## Inputs
- Documentation URL(s), ID(s), or query terms (optional)
- Optional doc-space/workspace hint

If documentation references are not provided, the Architect must ask the user whether a doc (or other source) exists for this task.

## Steps
1. If documentation references are not provided, ask the user for the doc ID/URL (or paste the content).
2. Fetch relevant documents via the configured documentation MCP/API.
3. Extract requirements, constraints, ADR decisions, and acceptance expectations.
3a. Extract any `github.com` or `gitlab.com` repository URLs embedded in the document body (as hyperlinks or raw text). Record these as `repo_urls_in_doc` for consumption by `architect-github-repo-intel`.
4. Cross-check with task intake and flag conflicts or gaps.
5. Produce a consolidated requirement summary for implementation planning.

## Output
- Documentation summary
- Key requirements and constraints
- ADR implications for implementation
- Conflicts/gaps to resolve
- `repo_urls_in_doc`: list of `github.com`/`gitlab.com` repository URLs found in the document body (may be empty)

## ADR Trigger Rule
- If the task requires ADR creation or update, hand off to `architect-adr-authoring` and enforce ADR template usage.
