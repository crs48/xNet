/**
 * The enrichment fetch queue.
 *
 * Session-scoped and paced: each key is attempted at most once per session, so
 * a feed that scrolls back over the same rows does not re-ask, and the interval
 * keeps provider traffic at a trickle while the first screen still fills in
 * within a few seconds.
 */

import type { SocialEnrichmentTarget } from './targets'

export const DEFAULT_ENRICHMENT_INTERVAL_MS = 500

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class SocialEnrichmentQueue {
  private pending: SocialEnrichmentTarget[] = []
  private seen = new Set<string>()
  private running = false
  private disposed = false

  constructor(
    private readonly executor: (target: SocialEnrichmentTarget) => Promise<void>,
    private readonly intervalMs = DEFAULT_ENRICHMENT_INTERVAL_MS,
    private readonly delayFn: (ms: number) => Promise<void> = defaultDelay,
    private readonly random: () => number = Math.random
  ) {}

  /** Keys that already have enrichment nodes never enter the queue. */
  markKnown(keys: Iterable<string>): void {
    for (const key of keys) this.seen.add(key)
  }

  enqueue(targets: readonly SocialEnrichmentTarget[]): void {
    if (this.disposed) return

    for (const target of targets) {
      if (this.seen.has(target.key)) continue
      this.seen.add(target.key)
      this.pending.push(target)
    }

    void this.pump()
  }

  get pendingCount(): number {
    return this.pending.length
  }

  dispose(): void {
    this.disposed = true
    this.pending = []
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true

    try {
      while (!this.disposed && this.pending.length > 0) {
        const target = this.pending.shift()
        if (!target) break

        try {
          await this.executor(target)
        } catch {
          // The executor records failures on the enrichment node; a key
          // that threw stays in `seen` so this session will not retry it.
        }

        if (this.pending.length > 0) {
          await this.delayFn(this.intervalMs + Math.floor(this.random() * 200))
        }
      }
    } finally {
      this.running = false
    }
  }
}
