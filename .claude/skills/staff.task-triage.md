# Skill: staff.task-triage

## Purpose
Read task-board tasks from the configured `task` category source and produce a structured sprint or backlog summary — statuses, blockers, assignees, dependencies, and risk signals. Read-only — never creates, updates, or comments on any task.

## When to Run
- User asks: "what's blocked", "what's in progress", "summarise the sprint", "triage the backlog", "what's at risk"
- Pre-standup or pre-planning summary
- Dependency or bottleneck analysis across a set of tasks

## Inputs
- List ID, folder ID, or space ID (required) — or a set of task IDs/URLs
- Optional: filter by assignee, status, or label
- Optional: focus question (e.g. "what's blocking the release", "which tasks are overdue")

## Steps

### 1. Fetch tasks
Use the `task` category MCP to fetch tasks in scope. For each task collect:
- ID, title, status, assignee(s), due date, priority
- Sub-tasks (IDs and statuses)
- Dependencies (blocking / blocked-by)
- Tags and custom fields relevant to the focus question

### 2. Classify by status health

| Health | Criteria |
|---|---|
| **On track** | Status is in-progress or review; due date not passed |
| **At risk** | Due date within 2 days OR blocked dependency OR no assignee |
| **Overdue** | Due date passed and status not complete/closed |
| **Blocked** | Has an unresolved blocking dependency or explicit "blocked" status |
| **Stale** | No status change or activity in 5+ days and not complete |

### 3. Identify bottlenecks
- Tasks with multiple dependents that are themselves blocked or stale
- Assignees with more than 3 in-progress tasks simultaneously
- Tasks in review for more than 3 days with no action

### 4. Surface risk signals
Flag any of the following:
- Tasks with no due date in a time-boxed sprint
- Sub-tasks completed but parent task still open
- Tasks marked complete but with open sub-tasks
- AI-generated tasks (`[AI]` prefix) with no human verification activity

### 5. Produce sprint snapshot

```
Sprint / List: <name>
As of: <date>

Status breakdown:
  Completed:  N
  In progress: N
  Blocked:    N
  At risk:    N
  Overdue:    N
  Stale:      N

Blocked tasks:
  - [TASK-ID] <title> — blocked by: <dependency>

At risk:
  - [TASK-ID] <title> — reason: <due date / no assignee / stale>

Bottlenecks:
  - <assignee or task> — <why it's a bottleneck>

Recommended actions: (priority order)
  1. <action>
```

## Output
- Status breakdown table
- Blocked task list with blocking dependency named
- At-risk task list with reason
- Bottleneck analysis
- Stale task list
- Risk signals (AI tasks, orphaned sub-tasks, etc.)
- Recommended actions ordered by priority
- Local artifact path if report written to `.tmp/analysis/`
