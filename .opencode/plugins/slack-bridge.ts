import type { Plugin } from "@opencode-ai/plugin"
import {
  createBridge,
  type ToolHookInput,
  type ToolHookOutput,
} from "../lib/slack/bridge.ts"

/**
 * Bridges opencode agent sessions to Slack.
 *
 * - Posts session progress (tools, plans, completions, errors) into a
 *   per-session Slack thread.
 * - Posts permission/approval requests as interactive messages and lets you
 *   answer them with buttons.
 * - Injects thread replies back into the running session as prompts.
 *
 * Configuration is read from the project `.env` (or process env):
 *   SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_CHANNEL,
 *   SLACK_ALLOWED_USERS, SLACK_BRIDGE=on|off
 *
 * When the config is incomplete the plugin logs once and stays inert, so
 * opencode always starts.
 */
export const SlackBridge: Plugin = async (input) => {
  let bridge: Awaited<ReturnType<typeof createBridge>>
  try {
    bridge = await createBridge(input)
  } catch {
    return {}
  }
  if (!bridge) return {}

  return {
    event: async ({ event }) => {
      await bridge.onEvent(event as { type: string; properties: unknown })
    },
    "tool.execute.after": async (toolInput, output) => {
      await bridge.onTool(toolInput as ToolHookInput, output as ToolHookOutput)
    },
    dispose: async () => {
      await bridge.dispose()
    },
  }
}
