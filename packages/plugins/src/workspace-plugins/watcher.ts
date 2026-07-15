/**
 * Workspace-plugin source watcher + hot reloader (exploration 0331).
 *
 * The Patchwork loop-closer: a Yjs-backed store subscription fires on every
 * source-node change; the watcher debounces 250 ms (heads settling) and then
 * rebuilds + hot-swaps the running plugin. Crash on the new version →
 * auto-disable and keep the LAST GOOD hash pinned (the 0190 remediation rule),
 * so a broken edit can never brick the workbench.
 *
 * Store-agnostic: anything with `subscribeToNode(id, listener)` (NodeStore
 * has exactly this) drives it.
 */

import type { PluginSourceNode } from '../schemas/plugin-source'
import type { WorkspacePluginHandle, WorkspacePluginHostDeps } from './host'
import { activateWorkspacePlugin } from './host'

/** The store slice the watcher needs (structural over NodeStore). */
export interface PluginSourceSubscribable {
  subscribeToNode(nodeId: string, listener: () => void): () => void
}

export const SOURCE_SETTLE_DEBOUNCE_MS = 250

export interface PluginSourceWatcherOptions {
  store: PluginSourceSubscribable
  /** Debounce window after the last change before `onSettle` fires. */
  debounceMs?: number
}

export interface PluginSourceWatcher {
  /** Watch a source node; `onSettle` fires once per settled burst of changes. */
  watch(nodeId: string, onSettle: () => void): () => void
  dispose(): void
}

/** Debounced per-node change watcher. */
export function createPluginSourceWatcher(
  options: PluginSourceWatcherOptions
): PluginSourceWatcher {
  const { store, debounceMs = SOURCE_SETTLE_DEBOUNCE_MS } = options
  const unsubscribes = new Set<() => void>()
  let disposed = false

  return {
    watch(nodeId, onSettle) {
      let timer: ReturnType<typeof setTimeout> | null = null
      const unsubscribe = store.subscribeToNode(nodeId, () => {
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          onSettle()
        }, debounceMs)
      })
      const stop = (): void => {
        if (timer !== null) clearTimeout(timer)
        timer = null
        unsubscribe()
        unsubscribes.delete(stop)
      }
      unsubscribes.add(stop)
      return stop
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const stop of [...unsubscribes]) stop()
    }
  }
}

// ─── Hot reloader ──────────────────────────────────────────────────────────

export interface HotReloadEvent {
  kind: 'reloaded' | 'build-failed' | 'crashed' | 'blocked-on-consent'
  pluginId: string
  /** The hash now running (reloaded), or still running (failures keep it). */
  runningHash?: string
  error?: string
}

export interface WorkspacePluginHotReloaderOptions {
  watcher: PluginSourceWatcher
  /** Re-read the source node at swap time (the watcher only signals). */
  readSource: (nodeId: string) => Promise<PluginSourceNode | null>
  /** Host deps used for each (re)activation. */
  deps: WorkspacePluginHostDeps
  onEvent?: (event: HotReloadEvent) => void
}

export interface WorkspacePluginHotReloader {
  /** Activate `source` and hot-swap it on every settled source change. */
  start(source: PluginSourceNode): Promise<WorkspacePluginHandle>
  /** The currently running handle (null before start / after a crash-disable). */
  readonly current: WorkspacePluginHandle | null
  /** The last hash that activated cleanly (the rollback target). */
  readonly lastGoodHash: string | null
  stop(): void
}

/**
 * The rebuild→swap driver. A failed rebuild (build error, consent decline,
 * hash drift) leaves the OLD version running; a crash after swap disables the
 * plugin and pins the last good hash.
 */
export function createWorkspacePluginHotReloader(
  options: WorkspacePluginHotReloaderOptions
): WorkspacePluginHotReloader {
  const { watcher, readSource, onEvent } = options
  let current: WorkspacePluginHandle | null = null
  let lastGoodHash: string | null = null
  let stopWatching: (() => void) | null = null
  let swapping = false

  const deps: WorkspacePluginHostDeps = {
    ...options.deps,
    // The hot reloader IS the dev loop: swap on every settled source change,
    // never enforce (or write) the consent pin. Pinned activation is the
    // workbench path, not the preview path.
    hashPolicy: options.deps.hashPolicy ?? 'follow-source',
    onAutoDisable: (info) => {
      if (current?.pluginId === info.pluginId) current = null
      onEvent?.({
        kind: 'crashed',
        pluginId: info.pluginId,
        runningHash: lastGoodHash ?? info.lastGoodHash,
        error: info.error
      })
      options.deps.onAutoDisable?.(info)
    }
  }

  const activate = async (source: PluginSourceNode): Promise<WorkspacePluginHandle> => {
    const handle = await activateWorkspacePlugin(source, deps)
    lastGoodHash = handle.contentHash
    return handle
  }

  const swap = async (nodeId: string): Promise<void> => {
    if (swapping) return
    swapping = true
    try {
      const source = await readSource(nodeId)
      if (!source) return
      const previous = current
      let next: WorkspacePluginHandle
      try {
        next = await activate(source)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        onEvent?.({
          kind: message.includes('consent') ? 'blocked-on-consent' : 'build-failed',
          pluginId: source.manifest?.id ?? source.id,
          runningHash: lastGoodHash ?? undefined,
          error: message
        })
        return // old version keeps running
      }
      previous?.dispose()
      current = next
      onEvent?.({ kind: 'reloaded', pluginId: next.pluginId, runningHash: next.contentHash })
    } finally {
      swapping = false
    }
  }

  return {
    async start(source) {
      current = await activate(source)
      stopWatching = watcher.watch(source.id, () => {
        void swap(source.id)
      })
      return current
    },
    get current() {
      return current
    },
    get lastGoodHash() {
      return lastGoodHash
    },
    stop() {
      stopWatching?.()
      stopWatching = null
      current?.dispose()
      current = null
    }
  }
}
