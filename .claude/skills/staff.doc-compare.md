# Skill: staff.doc-compare

## Purpose
Compare two or more Slite documents to surface gaps, contradictions, coverage overlaps, and missing requirements. Read-only — never modifies any document.

## When to Run
- Two or more Slite doc IDs or URLs are provided
- User asks: "compare", "find gaps", "is this consistent", "does X cover Y", "what's missing between"
- ADR vs requirement doc alignment check
- Spec vs design doc consistency review

## Inputs
- Two or more Slite doc IDs or URLs (required)
- Optional: comparison axis (e.g. "requirements coverage", "API contract alignment", "scope overlap")

## Steps

### 1. Fetch all documents
Fetch each document via Slite MCP. Record:
- Document title
- Last modified timestamp
- Section headings (top-level structure)

Do not proceed with only one document — halt and ask for a second reference.

### 2. Build a structural map
For each document, extract a flat list of topics/sections it covers. Example:

| Topic | Doc A | Doc B |
|---|---|---|
| Authentication | ✓ | ✓ |
| Rate limiting | ✓ | — |
| Error codes | — | ✓ |

### 3. Deep comparison per topic
For each topic present in more than one document:
- Are the descriptions consistent?
- Do field names, types, or values agree?
- Does one document have more detail than the other?
- Are there contradictions (one says X, the other says Y)?

Classify each finding:
- **Consistent** — both documents agree
- **Gap** — topic exists in one doc but is absent in the other
- **Contradiction** — documents disagree on the same topic
- **Partial** — one document has more detail; the other is incomplete

### 4. Identify coverage holes
Topics that should logically be present but appear in neither document — infer from context (e.g. if both docs describe an API but neither mentions error handling, that is a coverage hole).

### 5. Summarise
Produce a findings table and a priority-ordered gap list.

## Output
- Structural map table (topics × documents)
- Findings table (topic, classification, description)
- Coverage holes (topics missing from all documents)
- Contradiction list with exact conflicting text from each source
- Recommended actions (e.g. "update Doc B section 3 to match Doc A API contract")
- Local artifact path if report written to `.tmp/analysis/`
