/**
 * Node Pool - LRU cache of Y.Doc instances with acquire/release semantics
 *
 * Components acquire a Y.Doc when they need it and release it when they unmount.
 * Released Y.Docs stay in the pool (warm state) and continue receiving sync
 * updates via the Connection Manager.
 *
 * States:
 * - Active: refCount > 0, never evicted
 * - Warm: refCount = 0, evictable (LRU)
 * - Cold: evicted, serialized to storage (load on demand)
 */

import type { MetaBridge } from './meta-bridge'
import type { NodeStorageAdapter } from '@xnetjs/data'
import * as Y from 'yjs'

export type PoolEntryState = 'active' | 'warm' | 'cold'

interface PoolEntry {
  doc: Y.Doc
  state: PoolEntryState
  refCount: number
  lastAccess: number
  dirty: boolean
  unobserveMeta: (() => void) | null
}

export interface NodePoolConfig {
  /** Storage adapter for persisting Y.Doc state */
  storage: NodeStorageAdapter
  /** Meta bridge for syncing properties to NodeStore */
  metaBridge: MetaBridge
  /** Max warm entries before LRU eviction (default: 50) */
  maxWarm?: number
  /** Debounce delay for persisting dirty docs (default: 2000ms) */
  persistDelay?: number
  /** Optional callback when a doc is updated */
  onDocUpdate?: (nodeId: string, doc: Y.Doc) => void
  /** Optional callback before a doc is evicted */
  onDocEvict?: (nodeId: string, doc: Y.Doc) => void
  /**
   * Fired after a doc's state was successfully persisted to `yjs_state`
   * (exploration 0329: the production Yjs history capture hook). `context`
   * distinguishes the steady-state debounce from session boundaries
   * (evict/flush/destroy) so capture policies can throttle the former and
   * force the latter. Must never throw — persist correctness wins.
   */
  onDocPersist?: (
    nodeId: string,
    doc: Y.Doc,
    context: 'debounce' | 'evict' | 'flush' | 'destroy'
  ) => void
  /**
   * Predicate marking a node's Y.Doc as **ephemeral** — never persisted to
   * `yjs_state` and never cold-loaded from it. Workspace presence is the
   * canonical case: it is republished continuously and has no value across
   * reloads, yet (as a `gc:false` doc, written on every awareness tick) its
   * persisted blob grows unboundedly and its cold read at boot head-of-line
   * blocked every landing query on the single SQLite worker (exploration 0227).
   * Defaults to the `presence-` id prefix.
   */
  isEphemeral?: (nodeId: string) => boolean
  /**
   * Warn (once per load) when a `yjs_state` blob read or persisted exceeds this
   * many bytes — a tripwire for unbounded `gc:false` growth. Default 5 MiB.
   */
  largeDocWarnBytes?: number
}

export interface NodePool {
  /** Acquire a Y.Doc for a Node (load from storage or create new) */
  acquire(nodeId: string): Promise<Y.Doc>
  /** Release a Y.Doc (component unmounted, doc stays warm) */
  release(nodeId: string): void
  /** Check if a Node is in the pool */
  has(nodeId: string): boolean
  /** Get pool entry state */
  getState(nodeId: string): PoolEntryState | null
  /** Number of entries currently in memory */
  readonly size: number
  /** Force-persist all dirty docs */
  flushAll(): Promise<void>
  /** Destroy pool, persist all docs, cleanup */
  destroy(): Promise<void>
}

const DEFAULT_LARGE_DOC_WARN_BYTES = 5 * 1024 * 1024 // 5 MiB

/** Ephemeral-by-default: the workspace presence rooms (`presence-<workspace>`). */
function defaultIsEphemeral(nodeId: string): boolean {
  return nodeId.startsWith('presence-')
}

/** Monotonic clock, falling back to `Date.now` where `performance` is absent. */
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/** Boot-debug gate shared with the read-path probe / boot timeline (0212/0227). */
function bootDebugEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('xnet:boot:debug') === 'true'
  } catch {
    return false
  }
}

export function createNodePool(config: NodePoolConfig): NodePool {
  const entries = new Map<string, PoolEntry>()
  const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const maxWarm = config.maxWarm ?? 50
  const persistDelay = config.persistDelay ?? 2000
  const isEphemeral = config.isEphemeral ?? defaultIsEphemeral
  const largeDocWarnBytes = config.largeDocWarnBytes ?? DEFAULT_LARGE_DOC_WARN_BYTES
  let firstAcquireMarked = false

  /** Notify a persist listener; capture hooks must never break persistence. */
  function notifyPersist(
    nodeId: string,
    doc: Y.Doc,
    context: 'debounce' | 'evict' | 'flush' | 'destroy'
  ): void {
    try {
      config.onDocPersist?.(nodeId, doc, context)
    } catch (err) {
      console.warn(`[NodePool] onDocPersist hook failed for ${nodeId}:`, err)
    }
  }

  /**
   * One-shot performance mark when the first doc-acquire completes. That first
   * doc-warm is what contends with the landing read queries on the single
   * SQLite worker at boot; the web boot timeline observes this mark to attribute
   * the `store:ready → hub:connected` window correctly (exploration 0227).
   * Platform-agnostic and defensive — a missing `performance` is a no-op.
   */
  function markFirstAcquire(): void {
    if (firstAcquireMarked) return
    firstAcquireMarked = true
    try {
      performance?.mark?.('xnet:docpool:first-acquire')
    } catch {
      // no-op: instrumentation must never break acquire
    }
  }

  async function loadDoc(nodeId: string): Promise<Y.Doc> {
    const doc = new Y.Doc({ guid: nodeId, gc: false })

    // Ephemeral docs (workspace presence) are in-memory only: skip the cold
    // `yjs_state` read entirely so presence-doc acquisition never sits at the
    // head of the boot queue on the single SQLite worker (exploration 0227).
    if (isEphemeral(nodeId)) return doc

    // Load stored content
    const t0 = nowMs()
    const content = await config.storage.getDocumentContent(nodeId)
    const tRead = nowMs()
    if (content && content.length > 0) {
      Y.applyUpdate(doc, content)
      const tApply = nowMs()
      if (content.length >= largeDocWarnBytes) {
        console.warn(
          `[NodePool] large yjs_state blob for ${nodeId}: ${content.length} bytes — ` +
            'consider compacting (gc:false retains tombstones)'
        )
      }
      if (bootDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.info('[xNet] loadDoc', nodeId, {
          bytes: content.length,
          readMs: Math.round(tRead - t0),
          applyMs: Math.round(tApply - tRead)
        })
      }
    }

    return doc
  }

  function schedulePersist(nodeId: string): void {
    // Ephemeral docs are never written back — nothing to persist or cold-load.
    if (isEphemeral(nodeId)) return
    const existing = persistTimers.get(nodeId)
    if (existing) clearTimeout(existing)

    persistTimers.set(
      nodeId,
      setTimeout(async () => {
        persistTimers.delete(nodeId)
        const entry = entries.get(nodeId)
        if (entry && entry.dirty) {
          const content = Y.encodeStateAsUpdate(entry.doc)
          await config.storage.setDocumentContent(nodeId, content)
          entry.dirty = false
          notifyPersist(nodeId, entry.doc, 'debounce')
        }
      }, persistDelay)
    )
  }

  /**
   * Evict warm entries if pool exceeds maxWarm limit.
   * Persists documents to storage before destroying them.
   */
  async function evictIfNeeded(): Promise<void> {
    let warmCount = 0
    const warmEntries: [string, PoolEntry][] = []

    for (const [id, entry] of entries) {
      if (entry.state === 'warm') {
        warmCount++
        warmEntries.push([id, entry])
      }
    }

    if (warmCount <= maxWarm) return

    // Sort by lastAccess (oldest first) and evict
    warmEntries.sort((a, b) => a[1].lastAccess - b[1].lastAccess)
    const toEvict = warmEntries.slice(0, warmCount - maxWarm)

    // Persist all documents in parallel, then destroy
    await Promise.all(
      toEvict.map(async ([id, entry]) => {
        try {
          // Persist before evicting - await to ensure data is saved.
          // Ephemeral docs (presence) are intentionally not persisted.
          if (!isEphemeral(id)) {
            const content = Y.encodeStateAsUpdate(entry.doc)
            if (content.length >= largeDocWarnBytes) {
              console.warn(
                `[NodePool] large yjs_state blob for ${id}: ${content.length} bytes — ` +
                  'consider compacting (gc:false retains tombstones)'
              )
            }
            await config.storage.setDocumentContent(id, content)
            notifyPersist(id, entry.doc, 'evict')
          }
        } catch (err) {
          // Log error but continue eviction to prevent memory leak
          console.error(`[NodePool] Failed to persist document ${id} during eviction:`, err)
        }

        // Cleanup meta observer
        if (entry.unobserveMeta) {
          entry.unobserveMeta()
        }

        config.onDocEvict?.(id, entry.doc)

        // Destroy Y.Doc
        entry.doc.destroy()
        entries.delete(id)
      })
    )
  }

  return {
    async acquire(nodeId: string): Promise<Y.Doc> {
      let entry = entries.get(nodeId)

      if (entry) {
        // Already in pool — promote to active
        entry.refCount++
        entry.state = 'active'
        entry.lastAccess = Date.now()
        markFirstAcquire()
        return entry.doc
      }

      // Load from storage
      const doc = await loadDoc(nodeId)
      markFirstAcquire()

      // Listen for updates to schedule persistence
      doc.on('update', () => {
        const e = entries.get(nodeId)
        if (e) {
          e.dirty = true
          schedulePersist(nodeId)
          config.onDocUpdate?.(nodeId, doc)
        }
      })

      // Set up meta bridge observer
      const unobserveMeta = config.metaBridge.observe(nodeId, doc)

      entry = {
        doc,
        state: 'active',
        refCount: 1,
        lastAccess: Date.now(),
        dirty: false,
        unobserveMeta
      }

      entries.set(nodeId, entry)
      return doc
    },

    release(nodeId: string): void {
      const entry = entries.get(nodeId)
      if (!entry) return

      entry.refCount = Math.max(0, entry.refCount - 1)

      if (entry.refCount === 0) {
        entry.state = 'warm'
        entry.lastAccess = Date.now()
        // Eviction is async but release() must remain sync for API compatibility.
        // Errors are logged inside evictIfNeeded, and eviction ensures persistence
        // completes before destroying the Y.Doc.
        void evictIfNeeded()
      }
    },

    has(nodeId: string): boolean {
      return entries.has(nodeId)
    },

    getState(nodeId: string): PoolEntryState | null {
      return entries.get(nodeId)?.state ?? null
    },

    get size(): number {
      return entries.size
    },

    async flushAll(): Promise<void> {
      // Clear all pending timers
      for (const timer of persistTimers.values()) {
        clearTimeout(timer)
      }
      persistTimers.clear()

      // Persist all dirty docs (ephemeral docs are never persisted)
      const promises: Promise<void>[] = []
      for (const [id, entry] of entries) {
        if (entry.dirty && !isEphemeral(id)) {
          const content = Y.encodeStateAsUpdate(entry.doc)
          promises.push(
            config.storage.setDocumentContent(id, content).then(() => {
              entry.dirty = false
              notifyPersist(id, entry.doc, 'flush')
            })
          )
        }
      }
      await Promise.all(promises)
    },

    async destroy(): Promise<void> {
      await this.flushAll()

      for (const [, entry] of entries) {
        if (entry.unobserveMeta) entry.unobserveMeta()
        entry.doc.destroy()
      }
      entries.clear()
    }
  }
}
