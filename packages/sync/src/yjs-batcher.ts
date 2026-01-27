/**
 * YjsBatcher - Batch Yjs updates for efficient hash chain integration
 *
 * Individual keystrokes generate ~5 updates/sec. Wrapping each in a full
 * Change<T> is wasteful. Instead, batch updates over a configurable window.
 *
 * With 2-second batching:
 * - Updates/sec: 5 → 0.5
 * - Overhead/sec: 1KB → 100B
 * - Signature ops/sec: 5 → 0.5
 *
 * See: docs/planStep03_4_1YjsSecurity/08-hash-chain-integration.md
 */

/**
 * Configuration for the YjsBatcher.
 */
export interface YjsBatcherConfig {
  /** Batch window in milliseconds (default: 2000) */
  batchWindowMs: number

  /** Max updates per batch before flush (default: 50) */
  maxBatchSize: number

  /** Flush on paragraph break / Enter key (default: true) */
  flushOnParagraph: boolean
}

/**
 * Default configuration for YjsBatcher.
 */
export const DEFAULT_BATCHER_CONFIG: YjsBatcherConfig = {
  batchWindowMs: 2000,
  maxBatchSize: 50,
  flushOnParagraph: true
}

/**
 * Callback invoked when a batch is flushed.
 *
 * @param mergedUpdate - The merged Yjs update bytes (from Y.mergeUpdates)
 * @param updateCount - Number of individual updates in this batch
 */
export type BatchFlushCallback = (mergedUpdate: Uint8Array, updateCount: number) => void

/**
 * Function that merges multiple Yjs updates into one.
 * This is typically Y.mergeUpdates from the 'yjs' package.
 */
export type MergeUpdatesFn = (updates: Uint8Array[]) => Uint8Array

/**
 * Simple concatenation fallback if no merge function is provided.
 * Note: This produces less efficient results than Y.mergeUpdates.
 */
function defaultMergeUpdates(updates: Uint8Array[]): Uint8Array {
  // Calculate total length
  let totalLength = 0
  for (const update of updates) {
    totalLength += update.length
  }

  // Concatenate all updates
  const merged = new Uint8Array(totalLength)
  let offset = 0
  for (const update of updates) {
    merged.set(update, offset)
    offset += update.length
  }

  return merged
}

/**
 * YjsBatcher collects Yjs updates and flushes them in batches.
 *
 * This reduces the overhead of wrapping each update in a signed Change<T>
 * while still maintaining a full audit trail.
 *
 * @example
 * ```typescript
 * import * as Y from 'yjs'
 *
 * const batcher = new YjsBatcher(
 *   (mergedUpdate, count) => {
 *     // Create a YjsChange from the merged update
 *     const change = createYjsChange({
 *       nodeId,
 *       update: mergedUpdate,
 *       updateCount: count,
 *       ...
 *     })
 *     // Append to hash chain
 *     store.appendChange(change)
 *   },
 *   { batchWindowMs: 2000 },
 *   Y.mergeUpdates // Pass the merge function
 * )
 *
 * // On each local Yjs update:
 * doc.on('update', (update, origin) => {
 *   if (origin !== 'remote') {
 *     batcher.add(update)
 *   }
 * })
 *
 * // On component unmount:
 * batcher.destroy()
 * ```
 */
export class YjsBatcher {
  private pendingUpdates: Uint8Array[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private config: YjsBatcherConfig
  private onFlush: BatchFlushCallback
  private mergeUpdates: MergeUpdatesFn
  private destroyed = false

  /**
   * Create a new YjsBatcher.
   *
   * @param onFlush - Callback invoked when a batch is flushed
   * @param config - Optional configuration overrides
   * @param mergeUpdates - Function to merge updates (defaults to simple concatenation)
   */
  constructor(
    onFlush: BatchFlushCallback,
    config?: Partial<YjsBatcherConfig>,
    mergeUpdates?: MergeUpdatesFn
  ) {
    this.onFlush = onFlush
    this.config = {
      ...DEFAULT_BATCHER_CONFIG,
      ...config
    }
    this.mergeUpdates = mergeUpdates ?? defaultMergeUpdates
  }

  /**
   * Add an update to the current batch.
   *
   * @param update - The Yjs update bytes
   * @param isParagraphBreak - Whether this update is a paragraph break (Enter key)
   */
  add(update: Uint8Array, isParagraphBreak = false): void {
    if (this.destroyed) {
      console.warn('[YjsBatcher] Attempted to add update after destroy')
      return
    }

    this.pendingUpdates.push(update)

    // Flush if batch is full
    if (this.pendingUpdates.length >= this.config.maxBatchSize) {
      this.flush()
      return
    }

    // Flush on paragraph break
    if (isParagraphBreak && this.config.flushOnParagraph) {
      this.flush()
      return
    }

    // Start/reset timer
    this.resetTimer()
  }

  /**
   * Force flush the current batch.
   * Safe to call even if there are no pending updates.
   */
  flush(): void {
    // Clear timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    // Nothing to flush
    if (this.pendingUpdates.length === 0) {
      return
    }

    // Merge all pending updates into one
    const merged = this.mergeUpdates(this.pendingUpdates)
    const updateCount = this.pendingUpdates.length

    // Clear pending
    this.pendingUpdates = []

    // Invoke callback
    try {
      this.onFlush(merged, updateCount)
    } catch (err) {
      console.error('[YjsBatcher] Error in flush callback:', err)
    }
  }

  /**
   * Check if there are pending updates.
   */
  hasPending(): boolean {
    return this.pendingUpdates.length > 0
  }

  /**
   * Get the number of pending updates.
   */
  pendingCount(): number {
    return this.pendingUpdates.length
  }

  /**
   * Destroy the batcher. Flushes any remaining updates.
   * After destroy, add() calls will be ignored.
   */
  destroy(): void {
    if (this.destroyed) return

    this.destroyed = true
    this.flush()
  }

  /**
   * Check if the batcher has been destroyed.
   */
  isDestroyed(): boolean {
    return this.destroyed
  }

  /**
   * Reset or start the flush timer.
   */
  private resetTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, this.config.batchWindowMs)
  }
}
