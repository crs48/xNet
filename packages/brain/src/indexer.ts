/**
 * Incremental embedding pipeline (exploration 0211, Phase 1) — wakes the dormant
 * `@xnetjs/vectors` engine by keeping a semantic index in step with the graph.
 *
 * It subscribes to `NodeStore` change events and, debounced per node, (re)embeds
 * a node's text into the injected document index, or removes it on delete. The
 * embedding model itself is injected (local `@xenova` by default via
 * `SemanticSearch`, or a managed tier later), so this module stays pure and
 * testable with a mock model.
 */

/** A node, as seen by the indexer (structurally a `NodeState`). */
export interface IndexableNode {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  deleted?: boolean
}

/** The change-event shape emitted by `NodeStore.subscribe`. */
export interface IndexChangeEvent {
  node: IndexableNode | null
  previousNode?: IndexableNode | null
}

/** The subset of `NodeStore` the indexer needs. */
export interface IndexableStore {
  subscribe(listener: (event: IndexChangeEvent) => void): () => void
}

/**
 * The document index the embeddings go into. `SemanticSearch` satisfies this, but
 * so does any structurally-equivalent store (handy for tests and for a managed
 * embedding tier).
 */
export interface DocumentIndex {
  indexDocument(id: string, content: string): Promise<unknown>
  removeDocument(id: string): boolean | Promise<boolean>
}

/** Default text-bearing property keys, in priority order for the title. */
const TEXT_KEYS = [
  'title',
  'name',
  'displayName',
  'label',
  'subject',
  'summary',
  'description',
  'text',
  'body',
  'content',
  'bio',
  'caption'
] as const

/**
 * Default text extractor: joins the string values of well-known text-bearing
 * property keys. Returns '' for nodes with no indexable text (those are skipped).
 */
export function defaultTextOf(node: IndexableNode): string {
  const parts: string[] = []
  for (const key of TEXT_KEYS) {
    const value = node.properties[key]
    if (typeof value === 'string' && value.trim().length > 0) parts.push(value.trim())
  }
  return parts.join('\n')
}

export interface BrainIndexerOptions {
  store: IndexableStore
  index: DocumentIndex
  /** Extract indexable text from a node. Defaults to `defaultTextOf`. */
  textOf?: (node: IndexableNode) => string
  /** Only index nodes whose schema passes this predicate. Defaults to all. */
  shouldIndex?: (node: IndexableNode) => boolean
  /** Debounce window per node in ms (coalesces edit bursts). Defaults to 250. */
  debounceMs?: number
  /** Scheduler hook (injectable for deterministic tests). Defaults to setTimeout. */
  schedule?: (fn: () => void, ms: number) => unknown
  cancel?: (handle: unknown) => void
  onError?: (error: unknown, nodeId: string) => void
}

type PendingOp = 'index' | 'delete'

export interface BrainIndexer {
  /** Begin listening to store changes. Idempotent. */
  start(): void
  /** Stop listening and cancel any pending work. */
  stop(): void
  /** Process all pending operations now (bypasses the debounce). */
  flush(): Promise<void>
  /** Number of nodes with pending operations. */
  pending(): number
  /** (Re)index an explicit set of nodes — used for a cold-start backfill. */
  reindexAll(nodes: Iterable<IndexableNode>): Promise<void>
}

/**
 * Create an incremental brain indexer. Call `start()` to attach it to the store;
 * call `reindexAll()` once on boot to backfill the existing graph.
 */
export function createBrainIndexer(options: BrainIndexerOptions): BrainIndexer {
  const {
    store,
    index,
    textOf = defaultTextOf,
    shouldIndex = () => true,
    debounceMs = 250,
    schedule = (fn, ms) => setTimeout(fn, ms),
    cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    onError
  } = options

  const pending = new Map<string, PendingOp>()
  // Text captured at enqueue time, so a later delete/empty is handled correctly.
  const pendingText = new Map<string, string>()
  const lastText = new Map<string, string>()
  let unsubscribe: (() => void) | null = null
  let timer: unknown = null

  const reportError = (error: unknown, nodeId: string): void => {
    if (onError) onError(error, nodeId)
    else console.error(`[brain] indexer failed for ${nodeId}:`, error)
  }

  async function applyOne(nodeId: string, op: PendingOp): Promise<void> {
    try {
      if (op === 'delete') {
        await index.removeDocument(nodeId)
        lastText.delete(nodeId)
        return
      }
      const text = pendingText.get(nodeId) ?? ''
      if (text.length === 0) {
        // Became empty — make sure any stale vector is removed.
        if (lastText.has(nodeId)) {
          await index.removeDocument(nodeId)
          lastText.delete(nodeId)
        }
        return
      }
      // Skip re-embedding identical text (the expensive part is the model call).
      if (lastText.get(nodeId) === text) return
      await index.indexDocument(nodeId, text)
      lastText.set(nodeId, text)
    } catch (error) {
      reportError(error, nodeId)
    }
  }

  async function flush(): Promise<void> {
    if (timer !== null) {
      cancel(timer)
      timer = null
    }
    const ops = Array.from(pending.entries())
    pending.clear()
    for (const [nodeId, op] of ops) {
      await applyOne(nodeId, op)
      pendingText.delete(nodeId)
    }
  }

  function scheduleFlush(): void {
    if (timer !== null) return
    timer = schedule(() => {
      timer = null
      void flush()
    }, debounceMs)
  }

  function enqueue(node: IndexableNode): void {
    if (node.deleted) {
      pending.set(node.id, 'delete')
      pendingText.delete(node.id)
    } else if (shouldIndex(node)) {
      pending.set(node.id, 'index')
      pendingText.set(node.id, textOf(node).replace(/\s+/g, ' ').trim())
    } else {
      return
    }
    scheduleFlush()
  }

  return {
    start(): void {
      if (unsubscribe) return
      unsubscribe = store.subscribe((event) => {
        const node = event.node
        if (!node) return
        enqueue(node)
      })
    },
    stop(): void {
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
      if (timer !== null) {
        cancel(timer)
        timer = null
      }
      pending.clear()
      pendingText.clear()
    },
    flush,
    pending(): number {
      return pending.size
    },
    async reindexAll(nodes: Iterable<IndexableNode>): Promise<void> {
      for (const node of nodes) {
        if (node.deleted || !shouldIndex(node)) continue
        const text = textOf(node).replace(/\s+/g, ' ').trim()
        try {
          if (text.length === 0) {
            await index.removeDocument(node.id)
            lastText.delete(node.id)
          } else {
            await index.indexDocument(node.id, text)
            lastText.set(node.id, text)
          }
        } catch (error) {
          reportError(error, node.id)
        }
      }
    }
  }
}
