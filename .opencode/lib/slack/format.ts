import type { Todo } from "@opencode-ai/sdk"
import type { KnownBlock } from "@slack/types"

export type SlackBlock = KnownBlock

/** Normalized view of an opencode `permission.asked` event. */
export type PermissionInfo = {
  id: string
  sessionID: string
  kind: string
  patterns: string[]
  always: string[]
  metadata: Record<string, unknown>
  title: string
}

/**
 * The runtime `permission.asked` payload is not the SDK `Permission` shape:
 *   { id, sessionID, permission, patterns, metadata, always, tool }
 */
export function normalizePermission(raw: unknown): PermissionInfo {
  const value = (raw ?? {}) as Record<string, unknown>
  const kind = typeof value.permission === "string" ? value.permission : "action"
  const patterns = Array.isArray(value.patterns)
    ? value.patterns.filter((item): item is string => typeof item === "string")
    : []
  const metadata =
    value.metadata && typeof value.metadata === "object"
      ? (value.metadata as Record<string, unknown>)
      : {}
  const always = Array.isArray(value.always)
    ? value.always.filter((item): item is string => typeof item === "string")
    : []
  const command = typeof metadata.command === "string" ? metadata.command : undefined
  const summary = patterns.length > 0 ? patterns.join(", ") : (command ?? "")
  return {
    id: typeof value.id === "string" ? value.id : "",
    sessionID: typeof value.sessionID === "string" ? value.sessionID : "",
    kind,
    patterns,
    always,
    metadata,
    title: summary ? `${kind}: ${summary}` : `${kind} requires approval`,
  }
}

/** Escape the three characters Slack interprets inside mrkdwn text. */
export function escapeMrkdwn(text: string): string {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function truncate(text: string, max = 280): string {
  const clean = (text ?? "").trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1).trimEnd()}…`
}

export function sessionRootText(title: string, directory?: string): string {
  const name = escapeMrkdwn(truncate(title || "untitled session", 120))
  const where = directory ? `\n_${escapeMrkdwn(directory)}_` : ""
  return `*Session started* — ${name}${where}\nProgress, approvals and replies stay in this thread.`
}

export function toolProgressLine(tool: string, title: string): string {
  const label = escapeMrkdwn(truncate(title || tool, 160))
  return `• \`${tool}\` ${label}`
}

const TODO_MARKERS: Record<string, string> = {
  completed: "[x]",
  in_progress: "[>]",
  cancelled: "[-]",
  pending: "[ ]",
}

export function todoText(todos: Todo[]): string {
  if (!todos || todos.length === 0) return "*Plan* — (empty)"
  const lines = todos.map((todo) => {
    const marker = TODO_MARKERS[todo.status] ?? "[ ]"
    return `${marker} ${escapeMrkdwn(truncate(todo.content, 200))}`
  })
  return `*Plan*\n${lines.join("\n")}`
}

export function idleText(summary?: string): string {
  const body = summary ? `\n\n>${escapeMrkdwn(truncate(summary, 600)).replace(/\n/g, "\n>")}` : ""
  return `*Done.*${body}`
}

export function errorText(error: unknown): string {
  if (!error || typeof error !== "object") return "*Error* — the session reported an error."
  const name =
    typeof (error as { name?: unknown }).name === "string" ? (error as { name: string }).name : "Error"
  const data = (error as { data?: { message?: unknown } }).data
  const message = data && typeof data.message === "string" ? data.message : "no further detail"
  return `*${escapeMrkdwn(name)}* — ${escapeMrkdwn(truncate(message, 500))}`
}

function permissionDetails(permission: PermissionInfo): string[] {
  const details: string[] = []
  const metadata = permission.metadata
  for (const key of ["command", "filePath", "file", "path", "url", "query"]) {
    const value = metadata[key]
    if (typeof value === "string" && value.trim()) {
      details.push(`${key}: \`${escapeMrkdwn(truncate(value, 300))}\``)
    }
  }
  if (permission.always.length > 0) {
    details.push(`always: \`${escapeMrkdwn(truncate(permission.always.join(", "), 200))}\``)
  }
  return details
}

export function permissionText(permission: PermissionInfo): string {
  return `Approval needed: ${permission.title}`
}

export type PermissionAction = "once" | "always" | "reject"

export function permissionBlocks(
  permission: PermissionInfo,
  sessionTitle: string,
  actionPrefix: string,
  valueFor: (action: PermissionAction) => string,
): SlackBlock[] {
  const title = escapeMrkdwn(truncate(permission.title || "action requires approval", 250))
  const details = permissionDetails(permission)
  const contextParts = [
    `session: _${escapeMrkdwn(truncate(sessionTitle, 80))}_`,
    `type: \`${escapeMrkdwn(permission.kind)}\``,
  ]
  if (details.length > 0) contextParts.push(details.join("  ·  "))

  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Approval needed*\n${title}` },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: contextParts.join("\n") }],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: `${actionPrefix}:once`,
          text: { type: "plain_text", text: "Approve once" },
          style: "primary",
          value: valueFor("once"),
        },
        {
          type: "button",
          action_id: `${actionPrefix}:always`,
          text: { type: "plain_text", text: "Always" },
          value: valueFor("always"),
        },
        {
          type: "button",
          action_id: `${actionPrefix}:reject`,
          text: { type: "plain_text", text: "Reject" },
          style: "danger",
          value: valueFor("reject"),
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "You can also reply in this thread to send a prompt, or send `!abort` to stop the session.",
        },
      ],
    },
  ]
}

export function resolvedBlocks(label: string): SlackBlock[] {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: escapeMrkdwn(label) },
    },
  ]
}

/** Normalized view of an opencode `question.asked` event. */
export type QuestionOption = { label: string; description: string }
export type QuestionItem = {
  question: string
  header: string
  options: QuestionOption[]
  multiple: boolean
  custom: boolean
}
export type QuestionRequestInfo = {
  id: string
  sessionID: string
  questions: QuestionItem[]
}

export function normalizeQuestion(raw: unknown): QuestionRequestInfo {
  const value = (raw ?? {}) as Record<string, unknown>
  const questions = Array.isArray(value.questions)
    ? value.questions.map((entry) => {
        const item = (entry ?? {}) as Record<string, unknown>
        const options = Array.isArray(item.options)
          ? item.options.map((opt) => {
              const o = (opt ?? {}) as Record<string, unknown>
              return { label: String(o.label ?? ""), description: String(o.description ?? "") }
            })
          : []
        return {
          question: String(item.question ?? ""),
          header: String(item.header ?? "Question"),
          options,
          multiple: item.multiple === true,
          custom: item.custom === true,
        }
      })
    : []
  return {
    id: typeof value.id === "string" ? value.id : "",
    sessionID: typeof value.sessionID === "string" ? value.sessionID : "",
    questions,
  }
}

export function questionText(info: QuestionRequestInfo): string {
  return `Input needed: ${info.questions[0]?.header ?? "the agent has a question"}`
}

export function questionBlocks(
  info: QuestionRequestInfo,
  sessionTitle: string,
  actionPrefix: string,
  selected: string[][],
  notice?: string,
): SlackBlock[] {
  const blocks: unknown[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Input needed* — _${escapeMrkdwn(truncate(sessionTitle, 80))}_`,
      },
    },
  ]

  info.questions.forEach((question, index) => {
    const chosen = selected[index] ?? []
    const header = `*Q${index + 1}. ${escapeMrkdwn(truncate(question.header, 60))}*`
    const body = escapeMrkdwn(truncate(question.question, 500))
    const hints: string[] = []
    if (question.multiple) hints.push("_Select one or more, then Submit._")
    if (question.custom) hints.push("_Or reply in the thread with your own answer._")
    const hint = hints.length > 0 ? `\n${hints.join(" ")}` : ""
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `${header}\n${body}${hint}` } })

    if (question.options.length > 0) {
      const elements = question.options.map((option, optionIndex) => {
        const button: Record<string, unknown> = {
          type: "button",
          action_id: `${actionPrefix}:qopt:${index}:${optionIndex}`,
          text: { type: "plain_text", text: truncate(option.label || option.description, 75) },
          value: JSON.stringify({
            kind: "qopt",
            requestID: info.id,
            sessionID: info.sessionID,
            index,
            label: option.label,
            multiple: question.multiple,
          }),
        }
        if (chosen.includes(option.label)) button.style = "primary"
        return button
      })
      blocks.push({ type: "actions", elements })
    }
  })

  if (notice) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: escapeMrkdwn(notice) }] })
  }
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        action_id: `${actionPrefix}:qsubmit`,
        text: { type: "plain_text", text: "Submit answers" },
        style: "primary",
        value: JSON.stringify({ kind: "qsubmit", requestID: info.id, sessionID: info.sessionID }),
      },
      {
        type: "button",
        action_id: `${actionPrefix}:qreject`,
        text: { type: "plain_text", text: "Reject" },
        style: "danger",
        value: JSON.stringify({ kind: "qreject", requestID: info.id, sessionID: info.sessionID }),
      },
    ],
  })

  return blocks as SlackBlock[]
}
