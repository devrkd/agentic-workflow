# Rule: ADR Approval Gate

Single source of truth for the human approval gate between Architect and Developer. No agent may bypass this gate.

## The Gate

After Architect publishes the ADR to the documentation source, work **halts** until the human explicitly approves. Developer must never start before approval is confirmed.

## How Approval Is Confirmed

Exactly one of the following must occur:

1. **Session approval** — human replies with `APPROVED` (case-insensitive) in the active conversation.
2. **Documentation status approval** — Architect re-fetches the ADR document and confirms the `status` field is set to `Approved`.

## Approval Request Message

Architect must present the ADR with this exact message:

> "ADR is ready for your review: `<adr_url>`
> Please review the document and either:
> - Reply **APPROVED** in this session to proceed, or
> - Set the ADR document status to **Approved** in the documentation system.
>
> I will not delegate work to Developer until one of these approvals is received."

## Feedback Loop

If the human provides feedback instead of approval:
1. Architect fetches the full current ADR content from the documentation MCP.
2. Identifies only the sections that need to change.
3. Copies all unchanged sections verbatim (preserving all Mermaid fences exactly as returned by the documentation MCP).
4. Updates the ADR in the documentation source.
5. Re-verifies content is non-empty after update.
6. Re-presents the updated ADR URL with the same approval request message.
7. Repeats until explicit approval is received.

## State Transition

On approval, Architect:
- Records `adr_approved_at` (ISO-8601 timestamp).
- Sets the `adr_url` in the handoff file.
- Writes `.tmp/<task-id>/handoff.json` with `adr_url` and `adr_approved_at` set.

Orchestrator must confirm `adr_approved_at` is present in the handoff before invoking Developer.

## Who Enforces This

| Agent | Responsibility |
|---|---|
| Architect | Never produce handoff until approval received |
| Orchestrator | Never invoke Developer until handoff contains `adr_approved_at` |
| Developer | Halt immediately if `adr_url` is missing from handoff |
