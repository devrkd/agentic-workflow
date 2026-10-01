import { join } from "node:path"
import { WebClient } from "@slack/web-api"
import { SocketModeClient } from "@slack/socket-mode"
import type { PluginInput } from "@opencode-ai/plugin"
import type { Session } from "@opencode-ai/sdk"
import { loadConfig } from "./config.ts"
import { SessionMap, type SessionRef } from "./session-map.ts"
import { LineBatch } from "./throttle.ts"
import {
  childSessionRootText,
  childThreadPointerText,
  errorText,
  idleText,
  normalizePermission,
  normalizeQuestion,
  permissionBlocks,
  permissionText,
  questionBlocks,
  questionText,
  resolvedBlocks,
  sessionRootText,
  todoText,
  toolProgressLine,
  type PermissionAction,
  type PermissionInfo,
  type QuestionRequestInfo,
} from "./format.ts"

type OpenCodeClient = PluginInput["client"]

export type ToolHookInput = {
  tool: string
  sessionID: string
  callID: string
}

export type ToolHookOutput = {
  title: string
  output: string
  metadata: unknown
}

export type Bridge = {
  onEvent(event: { type: string; properties: unknown }): Promise<void>
  onTool(input: ToolHookInput, output: ToolHookOutput): Promise<void>
  dispose(): Promise<void>
}

const SERVICE = "slack-bridge"
const ACTION_PREFIX = "slackbridge"

type PendingPermission = {
  channel: string
  ts: string
  sessionID: string
}

type PendingQuestion = {
  channel: string
  ts: string
  sessionID: string
  info: QuestionRequestInfo
  selected: string[][]
}

export async function createBridge(input: PluginInput): Promise<Bridge | null> {
  const result = loadConfig(input.directory)

  const log = async (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    extra?: Record<string, unknown>,
  ): Promise<void> => {
    try {
      await input.client.app.log({ body: { service: SERVICE, level, message, extra } })
    } catch {
      // logging must never break the agent
    }
  }

  if (!result.ok) {
    await log("warn", `disabled: ${result.reason}`)
    return null
  }

  const config = result.config
  const client: OpenCodeClient = input.client
  const web = new WebClient(config.botToken)
  const socket = new SocketModeClient({ appToken: config.appToken })
  const sessions = new SessionMap(join(input.directory, ".opencode", "slack-bridge-state.json"))
  const childSessions = new Set<string>()
  const threadLocks = new Map<string, Promise<SessionRef | null>>()
  const pendingPermissions = new Map<string, PendingPermission>()
  const pendingQuestions = new Map<string, PendingQuestion>()
  const serverUrl = input.serverUrl

  if (config.allowedUsers.length === 0) {
    await log("warn", "SLACK_ALLOWED_USERS is empty; any member of the channel can answer approvals")
  }

  const batch = new LineBatch(async (sessionID, lines) => {
    const ref = await ensureThread(sessionID)
    if (!ref) return
    await postThread(ref, lines.join("\n"))
  })

  async function resolveParentTitle(parentID: string): Promise<string> {
    try {
      const parent = await client.session.get({ path: { id: parentID } })
      return parent.data?.title ?? ""
    } catch {
      // best-effort label only
      return ""
    }
  }

  async function ensureThread(sessionID: string): Promise<SessionRef | null> {
    const existing = sessions.get(sessionID)
    if (existing) return existing

    const inflight = threadLocks.get(sessionID)
    if (inflight) return inflight

    const task = (async (): Promise<SessionRef | null> => {
      let info: Session | undefined
      try {
        const res = await client.session.get({ path: { id: sessionID } })
        info = res.data
      } catch {
        return null
      }
      if (!info) return null
      if (info.parentID) childSessions.add(sessionID)
      const isChild = info.parentID !== undefined
      const parentTitle = info.parentID ? await resolveParentTitle(info.parentID) : ""
      const title = info.title || "untitled session"
      const rootText = isChild
        ? childSessionRootText(title, parentTitle)
        : sessionRootText(title, info.directory)
      try {
        const posted = await web.chat.postMessage({
          channel: config.channel,
          text: rootText,
          mrkdwn: true,
        })
        if (!posted.ts) return null
        const ref: SessionRef = {
          channel: config.channel,
          ts: posted.ts,
          title,
          createdAt: Date.now(),
          ...(info.parentID ? { parentID: info.parentID } : {}),
        }
        sessions.set(sessionID, ref)
        await log("info", "created Slack thread", {
          sessionID,
          ts: ref.ts,
          title,
          ...(isChild ? { child: true, parentID: info.parentID } : {}),
        })
        return ref
      } catch {
        return null
      }
    })()

    threadLocks.set(sessionID, task)
    try {
      return await task
    } finally {
      threadLocks.delete(sessionID)
    }
  }

  async function postThread(ref: SessionRef, text: string): Promise<void> {
    try {
      await web.chat.postMessage({
        channel: ref.channel,
        thread_ts: ref.ts,
        text,
        mrkdwn: true,
      })
    } catch {
      // best-effort
    }
  }

  async function lastAssistantText(sessionID: string): Promise<string> {
    try {
      const res = await client.session.messages({ path: { id: sessionID } })
      const messages = res.data ?? []
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i]
        if (message.info.role !== "assistant") continue
        const text = message.parts
          .filter((part) => part.type === "text")
          .map((part) => (part as { text: string }).text)
          .join("\n")
          .trim()
        if (text) return text
      }
    } catch {
      // ignore
    }
    return ""
  }

  function permissionValue(permission: PermissionInfo, action: PermissionAction): string {
    return JSON.stringify({
      kind: "permission",
      sessionID: permission.sessionID,
      permissionID: permission.id,
      response: action,
    })
  }

  async function onPermission(permission: PermissionInfo): Promise<void> {
    if (!permission.id || !permission.sessionID) return
    const hadThread = sessions.has(permission.sessionID)
    const ref = await ensureThread(permission.sessionID)
    if (!ref) return
    if (!hadThread && ref.parentID) {
      const parent = sessions.get(ref.parentID)
      if (parent) {
        await postThread(parent, childThreadPointerText(ref.title))
        await log("info", "child thread pointer posted", {
          parentID: ref.parentID,
          childSessionID: permission.sessionID,
        })
      }
    }
    batch.flushNow(permission.sessionID)
    try {
      const posted = await web.chat.postMessage({
        channel: ref.channel,
        thread_ts: ref.ts,
        text: permissionText(permission),
        blocks: permissionBlocks(permission, ref.title, ACTION_PREFIX, (action) =>
          permissionValue(permission, action),
        ),
      })
      if (posted.ts) {
        pendingPermissions.set(permission.id, {
          channel: ref.channel,
          ts: posted.ts,
          sessionID: permission.sessionID,
        })
        await log("info", ref.parentID ? "child approval card posted" : "approval card posted", {
          permissionID: permission.id,
          sessionID: permission.sessionID,
          ...(ref.parentID ? { parentID: ref.parentID } : {}),
        })
      }
    } catch {
      // best-effort
    }
  }

  async function onPermissionReplied(props: { sessionID: string; requestID: string; reply: string }): Promise<void> {
    const pending = pendingPermissions.get(props.requestID)
    if (!pending) return
    pendingPermissions.delete(props.requestID)
    await log("info", "approval resolved elsewhere", {
      requestID: props.requestID,
      reply: props.reply,
    })
    try {
      await web.chat.update({
        channel: pending.channel,
        ts: pending.ts,
        text: `Approval resolved in terminal: ${props.reply}`,
        blocks: resolvedBlocks(`Approval resolved in terminal: \`${props.reply}\``),
      })
    } catch {
      // best-effort
    }
  }

  async function renderQuestion(requestID: string, notice?: string): Promise<void> {
    const pending = pendingQuestions.get(requestID)
    if (!pending) return
    try {
      await web.chat.update({
        channel: pending.channel,
        ts: pending.ts,
        text: questionText(pending.info),
        blocks: questionBlocks(
          pending.info,
          sessions.get(pending.sessionID)?.title ?? "",
          ACTION_PREFIX,
          pending.selected,
          notice,
        ),
      })
    } catch {
      // best-effort
    }
  }

  async function replyQuestion(requestID: string, answers: string[][]): Promise<boolean> {
    try {
      const url = new URL(`/question/${requestID}/reply`, serverUrl)
      url.searchParams.set("directory", input.directory)
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers }),
      })
      if (!response.ok) {
        await log("error", "question reply failed", { requestID, status: response.status })
        return false
      }
      return true
    } catch (error) {
      await log("error", "question reply error", { requestID, error: String(error) })
      return false
    }
  }

  async function submitQuestion(requestID: string): Promise<void> {
    const pending = pendingQuestions.get(requestID)
    if (!pending) return
    const answers = pending.info.questions.map((_, index) => pending.selected[index] ?? [])
    if (answers.some((answer) => answer.length === 0)) {
      await renderQuestion(requestID, "Answer every question before submitting.")
      return
    }
    const ok = await replyQuestion(requestID, answers)
    if (!ok) return
    pendingQuestions.delete(requestID)
    await log("info", "question answered from Slack", { requestID })
    try {
      await web.chat.update({
        channel: pending.channel,
        ts: pending.ts,
        text: "Answered from Slack.",
        blocks: resolvedBlocks("*Answered from Slack.*"),
      })
    } catch {
      // best-effort
    }
  }

  async function rejectQuestion(requestID: string): Promise<void> {
    const pending = pendingQuestions.get(requestID)
    if (!pending) return
    try {
      const url = new URL(`/question/${requestID}/reject`, serverUrl)
      url.searchParams.set("directory", input.directory)
      await fetch(url, { method: "POST" })
    } catch (error) {
      await log("error", "question reject error", { requestID, error: String(error) })
    }
    pendingQuestions.delete(requestID)
    await log("info", "question rejected from Slack", { requestID })
    try {
      await web.chat.update({
        channel: pending.channel,
        ts: pending.ts,
        text: "Rejected from Slack.",
        blocks: resolvedBlocks("*Rejected from Slack.*"),
      })
    } catch {
      // best-effort
    }
  }

  async function onQuestion(info: QuestionRequestInfo): Promise<void> {
    if (!info.id || !info.sessionID || info.questions.length === 0) return
    const hadThread = sessions.has(info.sessionID)
    const ref = await ensureThread(info.sessionID)
    if (!ref) return
    if (!hadThread && ref.parentID) {
      const parent = sessions.get(ref.parentID)
      if (parent) {
        await postThread(parent, childThreadPointerText(ref.title))
        await log("info", "child thread pointer posted", {
          parentID: ref.parentID,
          childSessionID: info.sessionID,
        })
      }
    }
    batch.flushNow(info.sessionID)
    const selected = info.questions.map(() => [] as string[])
    try {
      const posted = await web.chat.postMessage({
        channel: ref.channel,
        thread_ts: ref.ts,
        text: questionText(info),
        blocks: questionBlocks(info, ref.title, ACTION_PREFIX, selected),
      })
      if (!posted.ts) return
      pendingQuestions.set(info.id, {
        channel: ref.channel,
        ts: posted.ts,
        sessionID: info.sessionID,
        info,
        selected,
      })
      await log("info", "question card posted", { requestID: info.id, sessionID: info.sessionID })
    } catch {
      // best-effort
    }
  }

  async function onQuestionResolved(requestID: string, label: string): Promise<void> {
    const pending = pendingQuestions.get(requestID)
    if (!pending) return
    pendingQuestions.delete(requestID)
    await log("info", "question resolved elsewhere", { requestID, label })
    try {
      await web.chat.update({
        channel: pending.channel,
        ts: pending.ts,
        text: label,
        blocks: resolvedBlocks(`*${label}*`),
      })
    } catch {
      // best-effort
    }
  }

  async function onEvent(event: { type: string; properties: unknown }): Promise<void> {
    switch (event.type) {
      case "session.created": {
        const info = (event.properties as { info: Session }).info
        if (info.parentID) {
          childSessions.add(info.id)
          return
        }
        await ensureThread(info.id)
        return
      }
      case "session.updated": {
        const info = (event.properties as { info: Session }).info
        if (info.parentID) childSessions.add(info.id)
        const ref = sessions.get(info.id)
        if (!ref) {
          if (info.parentID) return
          await ensureThread(info.id)
          return
        }
        if (info.title && info.title !== ref.title) {
          ref.title = info.title
          sessions.set(info.id, ref)
          const rootText = ref.parentID
            ? childSessionRootText(info.title, await resolveParentTitle(ref.parentID))
            : sessionRootText(info.title, info.directory)
          try {
            await web.chat.update({
              channel: ref.channel,
              ts: ref.ts,
              text: rootText,
            })
          } catch {
            // best-effort
          }
        }
        return
      }
      case "session.idle": {
        const { sessionID } = event.properties as { sessionID: string }
        if (childSessions.has(sessionID) && !sessions.has(sessionID)) return
        batch.flushNow(sessionID)
        const ref = await ensureThread(sessionID)
        if (!ref) return
        const summary = await lastAssistantText(sessionID)
        await postThread(ref, idleText(summary))
        await log("info", "posted completion", { sessionID })
        return
      }
      case "session.error": {
        const { sessionID, error } = event.properties as { sessionID?: string; error?: unknown }
        if (!sessionID) return
        if (childSessions.has(sessionID) && !sessions.has(sessionID)) return
        batch.flushNow(sessionID)
        const ref = await ensureThread(sessionID)
        if (!ref) return
        await postThread(ref, errorText(error))
        return
      }
      case "todo.updated": {
        const { sessionID, todos } = event.properties as { sessionID: string; todos: Parameters<typeof todoText>[0] }
        if (childSessions.has(sessionID) && !sessions.has(sessionID)) return
        batch.flushNow(sessionID)
        const ref = await ensureThread(sessionID)
        if (!ref) return
        await postThread(ref, todoText(todos))
        return
      }
      case "permission.asked":
      case "permission.updated": {
        await onPermission(normalizePermission(event.properties))
        return
      }
      case "permission.replied": {
        await onPermissionReplied(
          event.properties as { sessionID: string; requestID: string; reply: string },
        )
        return
      }
      case "question.asked":
      case "question.v2.asked": {
        await onQuestion(normalizeQuestion(event.properties))
        return
      }
      case "question.replied":
      case "question.v2.replied": {
        await onQuestionResolved(
          (event.properties as { requestID?: string }).requestID ?? "",
          "Answered elsewhere (_terminal_).",
        )
        return
      }
      case "question.rejected":
      case "question.v2.rejected": {
        await onQuestionResolved(
          (event.properties as { requestID?: string }).requestID ?? "",
          "Rejected elsewhere (_terminal_).",
        )
        return
      }
      case "session.deleted": {
        const info = event.properties as { info?: { id?: string } }
        if (info.info?.id) sessions.delete(info.info.id)
        return
      }
      default:
        return
    }
  }

  async function onTool(inputTool: ToolHookInput, output: ToolHookOutput): Promise<void> {
    if (childSessions.has(inputTool.sessionID) && !sessions.has(inputTool.sessionID)) return
    if (!sessions.has(inputTool.sessionID)) {
      const ref = await ensureThread(inputTool.sessionID)
      if (!ref) return
    }
    batch.push(inputTool.sessionID, toolProgressLine(inputTool.tool, output.title))
  }

  function authorized(userID: string | undefined): boolean {
    if (!userID) return false
    if (config.allowedUsers.length === 0) return true
    return config.allowedUsers.includes(userID)
  }

  async function onAction(body: {
    channel?: { id?: string }
    message?: { ts?: string }
    user?: { id?: string }
    actions?: Array<{ action_id?: string; value?: string }>
  }): Promise<void> {
    const action = body.actions?.[0]
    if (!action?.action_id || !action.action_id.startsWith(ACTION_PREFIX)) return
    const channelID = body.channel?.id
    const messageTs = body.message?.ts
    if (!channelID || !messageTs) return

    if (!authorized(body.user?.id)) {
      await log("warn", `ignored approval from unauthorized user ${body.user?.id ?? "unknown"}`)
      return
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(action.value ?? "{}") as Record<string, unknown>
    } catch {
      return
    }

    const kind = typeof payload.kind === "string" ? payload.kind : "permission"

    if (kind === "qopt") {
      const requestID = String(payload.requestID ?? "")
      const index = Number(payload.index)
      const label = String(payload.label ?? "")
      const multiple = payload.multiple === true
      const pending = pendingQuestions.get(requestID)
      if (!pending || !Number.isInteger(index) || !label) return
      const current = pending.selected[index] ?? []
      if (multiple) {
        pending.selected[index] = current.includes(label)
          ? current.filter((item) => item !== label)
          : [...current, label]
      } else {
        pending.selected[index] = [label]
      }
      const allSingleSelect = pending.info.questions.every((question) => !question.multiple)
      const complete = pending.info.questions.every(
        (_, i) => (pending.selected[i] ?? []).length > 0,
      )
      if (allSingleSelect && complete) {
        await submitQuestion(requestID)
      } else {
        await renderQuestion(requestID)
      }
      return
    }

    if (kind === "qsubmit") {
      await submitQuestion(String(payload.requestID ?? ""))
      return
    }

    if (kind === "qreject") {
      await rejectQuestion(String(payload.requestID ?? ""))
      return
    }

    const sessionID = String(payload.sessionID ?? "")
    const permissionID = String(payload.permissionID ?? "")
    const response = payload.response as PermissionAction
    if (!sessionID || !permissionID || !response) return

    // Only honour a button value the bridge itself registered for this
    // permissionID/sessionID pair — a stale or replayed click for an
    // already-resolved permission must never be submitted.
    const pendingPermission = pendingPermissions.get(permissionID)
    if (!pendingPermission || pendingPermission.sessionID !== sessionID) {
      await log("warn", "ignored stale approval", {
        permissionID,
        sessionID,
        user: body.user?.id,
      })
      return
    }

    try {
      await client.postSessionIdPermissionsPermissionId({
        path: { id: sessionID, permissionID },
        body: { response },
      })
    } catch (error) {
      // The session (e.g. a finished-but-persisted child) can no longer accept
      // the approval: discard it instead of leaving a live-looking card.
      pendingPermissions.delete(permissionID)
      await log("warn", "approval discarded: session inactive", {
        permissionID,
        sessionID,
        error: String(error),
      })
      try {
        await web.chat.update({
          channel: channelID,
          ts: messageTs,
          text: "Session no longer active — approval discarded.",
          blocks: resolvedBlocks("*Session no longer active — approval discarded.*"),
        })
      } catch {
        // best-effort
      }
      return
    }
    pendingPermissions.delete(permissionID)
    await log("info", "approval submitted from Slack", { permissionID, sessionID, response })

    const label =
      response === "reject"
        ? "Rejected from Slack."
        : response === "always"
          ? "Always allowed from Slack."
          : "Approved once from Slack."
    try {
      await web.chat.update({
        channel: channelID,
        ts: messageTs,
        text: label,
        blocks: resolvedBlocks(`*${label}*`),
      })
    } catch {
      // best-effort
    }
  }

  async function onSlackMessage(body: {
    event?: {
      type?: string
      subtype?: string
      bot_id?: string
      user?: string
      text?: string
      ts?: string
      thread_ts?: string
    }
  }): Promise<void> {
    const event = body.event
    if (!event || event.type !== "message") return
    if (event.bot_id || event.subtype) return
    if (!event.thread_ts || event.thread_ts === event.ts) return

    const sessionID = sessions.sessionForThread(event.thread_ts)
    if (!sessionID || !event.user) return

    if (!authorized(event.user)) {
      await log("warn", "ignored reply from unauthorized user", { user: event.user })
      return
    }

    const text = (event.text ?? "").trim()
    if (!text) return

    await log("info", "Slack reply received", { sessionID, user: event.user, chars: text.length })

    if (text === "!abort" || text === "abort") {
      try {
        await client.session.abort({ path: { id: sessionID } })
        await log("info", "abort requested from Slack", { sessionID })
      } catch (error) {
        await log("error", "failed to abort from Slack", { error: String(error) })
      }
      return
    }

    const pendingQuestion = [...pendingQuestions.values()].find(
      (question) => question.sessionID === sessionID,
    )
    if (pendingQuestion) {
      const index = pendingQuestion.info.questions.findIndex(
        (_, i) => (pendingQuestion.selected[i] ?? []).length === 0,
      )
      if (index >= 0) {
        pendingQuestion.selected[index] = [text]
        const allSingleSelect = pendingQuestion.info.questions.every((q) => !q.multiple)
        const complete = pendingQuestion.info.questions.every(
          (_, i) => (pendingQuestion.selected[i] ?? []).length > 0,
        )
        await log("info", "Slack reply answered a question", {
          sessionID,
          requestID: pendingQuestion.info.id,
        })
        if (allSingleSelect && complete) {
          await submitQuestion(pendingQuestion.info.id)
        } else {
          await renderQuestion(pendingQuestion.info.id)
        }
        return
      }
    }

    try {
      await client.session.promptAsync({
        path: { id: sessionID },
        body: { parts: [{ type: "text", text }] },
      })
      await log("info", "injected Slack reply", { sessionID })
    } catch (error) {
      await log("error", "failed to inject Slack reply", { error: String(error) })
    }
  }

  socket.on("slack_event", async (args: { ack?: () => Promise<void>; body: unknown }) => {
    try {
      await args.ack?.()
    } catch {
      // ack failures are non-fatal
    }
    const body = args.body as { type?: string } | undefined
    if (!body) return
    try {
      if (body.type === "block_actions") {
        await onAction(body as Parameters<typeof onAction>[0])
      } else if (body.type === "event_callback") {
        await onSlackMessage(body as Parameters<typeof onSlackMessage>[0])
      }
    } catch (error) {
      await log("error", "slack event handler failed", { error: String(error) })
    }
  })

  try {
    await web.auth.test()
  } catch (error) {
    await log("error", "Slack auth failed; bot token rejected", { error: String(error) })
    return null
  }

  socket.start().catch((error: unknown) => {
    void log("error", "Socket Mode connection failed", { error: String(error) })
  })
  await log("info", "Slack bridge connected", { channel: config.channel })

  return {
    onEvent,
    onTool,
    dispose: async () => {
      batch.dispose()
      try {
        await socket.disconnect()
      } catch {
        // ignore
      }
    },
  }
}
