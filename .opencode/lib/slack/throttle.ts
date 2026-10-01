/**
 * Coalesces many short progress lines into a single flush per key.
 * The first push for a key starts a timer; every push within the
 * window accumulates. This keeps a burst of tool runs from producing
 * one Slack message per tool.
 */
export class LineBatch {
  private buffers = new Map<string, string[]>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private flush: (key: string, lines: string[]) => void | Promise<void>
  private delayMs: number

  constructor(
    flush: (key: string, lines: string[]) => void | Promise<void>,
    delayMs = 1200,
  ) {
    this.flush = flush
    this.delayMs = delayMs
  }

  push(key: string, line: string): void {
    const buffer = this.buffers.get(key) ?? []
    buffer.push(line)
    this.buffers.set(key, buffer)
    if (this.timers.has(key)) return
    const timer = setTimeout(() => {
      void this.run(key)
    }, this.delayMs)
    // Do not keep the process alive just for a pending flush.
    if (typeof timer === "object" && "unref" in timer) timer.unref()
    this.timers.set(key, timer)
  }

  /** Flush immediately, cancelling any pending timer (e.g. before a "done" message). */
  flushNow(key: string): void {
    const timer = this.timers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(key)
    }
    void this.run(key)
  }

  private async run(key: string): Promise<void> {
    this.timers.delete(key)
    const buffer = this.buffers.get(key)
    if (!buffer || buffer.length === 0) {
      this.buffers.delete(key)
      return
    }
    this.buffers.delete(key)
    try {
      await this.flush(key, buffer)
    } catch {
      // Progress is best-effort; never let a Slack failure break the agent.
    }
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    this.buffers.clear()
  }
}
