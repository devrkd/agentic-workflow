---
description: Developer — implement a scoped FR from .tmp/<task-id>/handoff.json (requires adr_url).
agent: developer
---

Implement the scoped functional requirement.

Task id (required): $1
FR label (optional): $2

Arguments: $ARGUMENTS

Read `.tmp/$1/handoff.json` and halt if it is missing or `adr_url` is absent.
