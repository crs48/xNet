/**
 * @xnetjs/hub — webhook delivery idempotency (exploration 0213).
 *
 * Providers redeliver webhooks (GitHub, Stripe, and the Standard Webhooks spec
 * all retry on non-2xx, and networks duplicate). Before an `apply` mutates
 * nodes, the delivery's event id must be deduplicated or a single logical event
 * applies twice. {@link DeliveryDeduper} is a bounded, in-memory LRU of recently
 * seen ids — `seen(id)` records and reports whether the id was already present.
 *
 * It is deliberately process-local and bounded (no unbounded growth, no
 * storage dependency): webhook retries arrive within minutes, so a modest
 * window covers the realistic duplicate horizon. A durable store can replace it
 * behind the same interface if cross-restart dedup is ever needed.
 */

/** Default number of recent delivery ids retained. */
export const DEFAULT_DEDUPE_CAPACITY = 2048

export class DeliveryDeduper {
  private readonly capacity: number
  // Insertion-ordered: Map preserves insertion order, so the first key is oldest.
  private readonly ids = new Set<string>()

  constructor(capacity: number = DEFAULT_DEDUPE_CAPACITY) {
    this.capacity = Math.max(1, capacity)
  }

  /**
   * Record `id` and return whether it had already been seen. A falsy id is
   * treated as never-seen (un-deduplicable) and not retained — callers should
   * fall back to applying when the provider supplied no id.
   */
  seen(id: string | undefined | null): boolean {
    if (!id) return false
    if (this.ids.has(id)) {
      // Refresh recency: delete + re-add moves it to the newest slot.
      this.ids.delete(id)
      this.ids.add(id)
      return true
    }
    this.ids.add(id)
    if (this.ids.size > this.capacity) {
      const oldest = this.ids.values().next().value
      if (oldest !== undefined) this.ids.delete(oldest)
    }
    return false
  }

  /** Current number of retained ids (for tests/metrics). */
  get size(): number {
    return this.ids.size
  }
}
