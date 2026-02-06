/**
 * Debounce utilities for DataBridge
 *
 * These utilities help reduce message frequency between main thread and worker,
 * particularly useful for high-frequency Y.Doc updates during rapid typing.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DebounceOptions {
  /** Time in ms to wait before executing */
  wait: number
  /** Maximum time in ms to wait before forcing execution */
  maxWait?: number
  /** If true, execute on leading edge instead of trailing */
  leading?: boolean
}

export interface DebouncedFunction<T extends (...args: unknown[]) => void> {
  (...args: Parameters<T>): void
  /** Cancel any pending execution */
  cancel(): void
  /** Execute immediately if there's a pending call */
  flush(): void
  /** Check if there's a pending execution */
  pending(): boolean
}

// ─── Debounce Implementation ──────────────────────────────────────────────────

/**
 * Creates a debounced function that delays invoking func until after `wait`
 * milliseconds have elapsed since the last time the debounced function was invoked.
 *
 * Optionally supports a maxWait to ensure execution even during continuous calls.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  options: DebounceOptions
): DebouncedFunction<T> {
  const { wait, maxWait, leading = false } = options

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let maxTimeoutId: ReturnType<typeof setTimeout> | null = null
  let lastArgs: Parameters<T> | null = null

  function invokeFunc(): void {
    if (lastArgs === null) return

    const args = lastArgs
    lastArgs = null
    func(...args)
  }

  function cancelTimers(): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (maxTimeoutId !== null) {
      clearTimeout(maxTimeoutId)
      maxTimeoutId = null
    }
  }

  function startTimer(): void {
    // Always clear and restart the wait timer
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      cancelTimers()
      invokeFunc()
    }, wait)
  }

  function startMaxTimer(): void {
    // Only start maxWait timer once per debounce cycle
    if (maxWait === undefined || maxTimeoutId !== null) return

    maxTimeoutId = setTimeout(() => {
      cancelTimers()
      invokeFunc()
    }, maxWait)
  }

  function debounced(...args: Parameters<T>): void {
    const isFirstCall = timeoutId === null

    if (leading) {
      if (isFirstCall) {
        // Leading edge - invoke immediately
        func(...args)
        // Start timer to track the debounce period
        // Don't store args, so trailing edge won't invoke again
        timeoutId = setTimeout(() => {
          timeoutId = null
        }, wait)
        return
      } else {
        // During debounce period after leading edge - restart timer but don't store args
        if (timeoutId !== null) {
          clearTimeout(timeoutId)
        }
        timeoutId = setTimeout(() => {
          timeoutId = null
        }, wait)
        return
      }
    }

    // Trailing edge behavior (default)
    // Store args for trailing edge invocation
    lastArgs = args

    // Start or restart the wait timer
    startTimer()

    // Only start maxWait timer on first call of the cycle
    if (isFirstCall && maxWait !== undefined) {
      startMaxTimer()
    }
  }

  debounced.cancel = function (): void {
    cancelTimers()
    lastArgs = null
  }

  debounced.flush = function (): void {
    cancelTimers()
    invokeFunc()
  }

  debounced.pending = function (): boolean {
    return timeoutId !== null
  }

  return debounced
}

// ─── Batch Update Accumulator ─────────────────────────────────────────────────

/**
 * Accumulates Y.Doc updates and batches them into a single merged update.
 * This is more efficient than debouncing individual updates because Yjs
 * can merge multiple updates into one.
 */
export interface UpdateBatcher {
  /** Add an update to the batch */
  add(update: Uint8Array): void
  /** Cancel pending batch */
  cancel(): void
  /** Flush pending updates immediately */
  flush(): void
  /** Check if there are pending updates */
  pending(): boolean
}

export interface UpdateBatcherOptions {
  /** Time in ms to wait before flushing the batch */
  wait: number
  /** Maximum time in ms before forcing a flush */
  maxWait: number
  /** Callback to receive the batched update */
  onFlush: (mergedUpdate: Uint8Array) => void
}

/**
 * Creates an update batcher that accumulates Y.Doc updates and merges them.
 *
 * Uses Yjs mergeUpdates to combine multiple updates into one, reducing
 * message count and improving network efficiency.
 */
export function createUpdateBatcher(options: UpdateBatcherOptions): UpdateBatcher {
  const { wait, maxWait, onFlush } = options

  let pendingUpdates: Uint8Array[] = []
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let maxTimeoutId: ReturnType<typeof setTimeout> | null = null
  // Cache the Y module after first import
  let yjsModule: typeof import('yjs') | null = null

  // Pre-load Yjs module (ignore errors - we'll retry when needed)
  import('yjs')
    .then((Y) => {
      yjsModule = Y
    })
    .catch(() => {
      // Silent fail on preload - will retry on actual merge
    })

  function flush(): void {
    if (pendingUpdates.length === 0) return

    // Yjs mergeUpdates combines multiple updates into one
    // This is more efficient than applying them one by one
    const updates = pendingUpdates
    pendingUpdates = []

    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (maxTimeoutId !== null) {
      clearTimeout(maxTimeoutId)
      maxTimeoutId = null
    }

    // Merge updates using Yjs
    if (updates.length === 1) {
      onFlush(updates[0])
    } else if (yjsModule) {
      // Use cached module if available
      const merged = yjsModule.mergeUpdates(updates)
      onFlush(merged)
    } else {
      // Fallback: dynamic import if module not loaded yet
      import('yjs').then((Y) => {
        yjsModule = Y
        const merged = Y.mergeUpdates(updates)
        onFlush(merged)
      })
    }
  }

  function startTimer(): void {
    if (timeoutId !== null) return

    timeoutId = setTimeout(() => {
      timeoutId = null
      flush()
    }, wait)
  }

  function startMaxTimer(): void {
    if (maxTimeoutId !== null) return

    maxTimeoutId = setTimeout(() => {
      maxTimeoutId = null
      flush()
    }, maxWait)
  }

  return {
    add(update: Uint8Array): void {
      pendingUpdates.push(update)
      startTimer()
      startMaxTimer()
    },

    cancel(): void {
      pendingUpdates = []
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      if (maxTimeoutId !== null) {
        clearTimeout(maxTimeoutId)
        maxTimeoutId = null
      }
    },

    flush,

    pending(): boolean {
      return pendingUpdates.length > 0
    }
  }
}

// ─── Delta Batcher ────────────────────────────────────────────────────────────

/**
 * Delta types for query result changes
 */
export type QueryDelta =
  | { type: 'add'; node: unknown; index: number }
  | { type: 'remove'; nodeId: string }
  | { type: 'update'; nodeId: string; node: unknown }

/**
 * Options for creating a delta batcher
 */
export interface DeltaBatcherOptions {
  /** Time in ms to wait before flushing deltas */
  wait: number
  /** Maximum time in ms before forcing a flush */
  maxWait: number
  /** Callback to receive batched deltas */
  onFlush: (deltas: QueryDelta[]) => void
}

/**
 * Batcher for query deltas that coalesces rapid changes.
 *
 * Merging rules:
 * - Multiple updates to same node → keep only latest update
 * - Add then remove same node → both cancel out (no delta)
 * - Remove then add same node → becomes update
 * - Add then update same node → keep add with updated data
 */
export interface DeltaBatcher {
  /** Add a delta to the batch */
  add(delta: QueryDelta): void
  /** Cancel pending batch */
  cancel(): void
  /** Flush pending deltas immediately */
  flush(): void
  /** Check if there are pending deltas */
  pending(): boolean
}

/**
 * Creates a delta batcher that coalesces rapid query result changes.
 */
export function createDeltaBatcher(options: DeltaBatcherOptions): DeltaBatcher {
  const { wait, maxWait, onFlush } = options

  // Track pending deltas by nodeId for efficient coalescing
  // Map from nodeId → delta (or null if cancelled out)
  const pendingDeltas = new Map<string, QueryDelta | null>()
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let maxTimeoutId: ReturnType<typeof setTimeout> | null = null

  function flush(): void {
    if (pendingDeltas.size === 0) return

    // Collect non-null deltas in order
    const deltas: QueryDelta[] = []
    for (const delta of pendingDeltas.values()) {
      if (delta !== null) {
        deltas.push(delta)
      }
    }
    pendingDeltas.clear()

    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (maxTimeoutId !== null) {
      clearTimeout(maxTimeoutId)
      maxTimeoutId = null
    }

    if (deltas.length > 0) {
      onFlush(deltas)
    }
  }

  function startTimer(): void {
    if (timeoutId !== null) return

    timeoutId = setTimeout(() => {
      timeoutId = null
      flush()
    }, wait)
  }

  function startMaxTimer(): void {
    if (maxTimeoutId !== null) return

    maxTimeoutId = setTimeout(() => {
      maxTimeoutId = null
      flush()
    }, maxWait)
  }

  function getNodeId(delta: QueryDelta): string {
    return delta.type === 'add' ? (delta.node as { id: string }).id : delta.nodeId
  }

  return {
    add(delta: QueryDelta): void {
      const nodeId = getNodeId(delta)
      const existing = pendingDeltas.get(nodeId)

      if (existing === undefined) {
        // First delta for this node
        pendingDeltas.set(nodeId, delta)
      } else if (existing === null) {
        // Previous delta was cancelled, this one takes effect
        pendingDeltas.set(nodeId, delta)
      } else {
        // Coalesce with existing delta
        const coalesced = coalesceDeltas(existing, delta)
        pendingDeltas.set(nodeId, coalesced)
      }

      startTimer()
      startMaxTimer()
    },

    cancel(): void {
      pendingDeltas.clear()
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      if (maxTimeoutId !== null) {
        clearTimeout(maxTimeoutId)
        maxTimeoutId = null
      }
    },

    flush,

    pending(): boolean {
      return pendingDeltas.size > 0
    }
  }
}

/**
 * Coalesce two deltas for the same node.
 * Returns null if they cancel out.
 */
function coalesceDeltas(existing: QueryDelta, incoming: QueryDelta): QueryDelta | null {
  // add + remove = cancel
  if (existing.type === 'add' && incoming.type === 'remove') {
    return null
  }

  // add + update = add with new data
  if (existing.type === 'add' && incoming.type === 'update') {
    return { type: 'add', node: incoming.node, index: existing.index }
  }

  // remove + add = update
  if (existing.type === 'remove' && incoming.type === 'add') {
    return { type: 'update', nodeId: existing.nodeId, node: incoming.node }
  }

  // update + update = keep latest update
  if (existing.type === 'update' && incoming.type === 'update') {
    return incoming
  }

  // update + remove = remove
  if (existing.type === 'update' && incoming.type === 'remove') {
    return incoming
  }

  // For any other cases, take the incoming delta
  return incoming
}
