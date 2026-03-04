/**
 * useBlame - React hook for per-property attribution
 *
 * Shows who last changed each property, how many times,
 * and the full edit history.
 *
 * @example
 * ```tsx
 * const { blame, loading, reload } = useBlame(nodeId)
 *
 * blame.forEach(b => {
 *   console.log(`${b.property}: last changed by ${b.lastChangedBy}, ${b.totalEdits} edits`)
 * })
 * ```
 */

import type { NodeId, NodeStorageAdapter } from '@xnetjs/data'
import { BlameEngine, type BlameInfo } from '@xnetjs/history'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNodeStore } from './useNodeStore'

// ─── Types ───────────────────────────────────────────────────

export interface UseBlameResult {
  /** Blame info for all properties */
  blame: BlameInfo[]
  /** Whether loading */
  loading: boolean
  /** Any error */
  error: Error | null
  /** Reload blame data */
  reload: () => Promise<void>
}

// ─── Hook ────────────────────────────────────────────────────

export function useBlame(nodeId: NodeId | null): UseBlameResult {
  const { store, isReady } = useNodeStore()
  const [blame, setBlame] = useState<BlameInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const engineRef = useRef<{ engine: BlameEngine; storage: NodeStorageAdapter } | null>(null)

  const getEngine = useCallback((): BlameEngine | null => {
    if (!store) return null
    const storage = store.getStorageAdapter()
    if (!storage) return null

    if (!engineRef.current || engineRef.current.storage !== storage) {
      engineRef.current = { engine: new BlameEngine(storage), storage }
    }
    return engineRef.current.engine
  }, [store])

  const load = useCallback(async () => {
    if (!nodeId || !isReady) return
    const engine = getEngine()
    if (!engine) return

    setLoading(true)
    setError(null)
    try {
      const info = await engine.getBlame(nodeId)
      setBlame(info)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [nodeId, isReady, getEngine])

  useEffect(() => {
    load()
  }, [load])

  // Auto-reload on changes
  useEffect(() => {
    if (!store || !nodeId) return
    const unsub = store.subscribe((event) => {
      if (event.change.payload.nodeId === nodeId) {
        load()
      }
    })
    return unsub
  }, [store, nodeId, load])

  return { blame, loading, error, reload: load }
}
