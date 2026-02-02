/**
 * useDiff - React hook for comparing node state between two points
 *
 * Wraps DiffEngine to provide on-demand diffs between any two
 * HistoryTarget points.
 *
 * @example
 * ```tsx
 * const { diff, result, loading } = useDiff(nodeId)
 *
 * // Compare creation to latest
 * await diff({ type: 'index', index: 0 }, { type: 'latest' })
 *
 * // Show result
 * result?.diffs.forEach(d => console.log(d.property, d.type))
 * ```
 */

import { useState, useCallback, useRef } from 'react'
import type { NodeId, NodeStorageAdapter } from '@xnet/data'
import {
  HistoryEngine,
  SnapshotCache,
  MemorySnapshotStorage,
  DiffEngine,
  type HistoryTarget,
  type DiffResult
} from '@xnet/history'
import { useNodeStore } from './useNodeStore'

// ─── Types ───────────────────────────────────────────────────

export interface UseDiffResult {
  /** Compute diff between two points */
  diff: (from: HistoryTarget, to: HistoryTarget) => Promise<void>
  /** Diff N changes back from current */
  diffFromCurrent: (changesAgo: number) => Promise<void>
  /** Latest diff result */
  result: DiffResult | null
  /** Whether diffing */
  loading: boolean
  /** Any error */
  error: Error | null
}

// ─── Hook ────────────────────────────────────────────────────

export function useDiff(nodeId: NodeId | null): UseDiffResult {
  const { store } = useNodeStore()
  const [result, setResult] = useState<DiffResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const engineRef = useRef<{ diff: DiffEngine; storage: NodeStorageAdapter } | null>(null)

  const getEngine = useCallback((): DiffEngine | null => {
    if (!store) return null
    const storage = (store as any).storage as NodeStorageAdapter | undefined
    if (!storage) return null

    if (!engineRef.current || engineRef.current.storage !== storage) {
      const snapshotStorage = new MemorySnapshotStorage()
      const snapshots = new SnapshotCache(snapshotStorage, { interval: 50 })
      const history = new HistoryEngine(storage, snapshots)
      engineRef.current = { diff: new DiffEngine(history), storage }
    }
    return engineRef.current.diff
  }, [store])

  const diff = useCallback(
    async (from: HistoryTarget, to: HistoryTarget) => {
      if (!nodeId) return
      const engine = getEngine()
      if (!engine) return

      setLoading(true)
      setError(null)
      try {
        const diffResult = await engine.diffNode(nodeId, from, to)
        setResult(diffResult)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        setLoading(false)
      }
    },
    [nodeId, getEngine]
  )

  const diffFromCurrent = useCallback(
    async (changesAgo: number) => {
      if (!nodeId) return
      const engine = getEngine()
      if (!engine) return

      setLoading(true)
      setError(null)
      try {
        const diffResult = await engine.diffFromCurrent(nodeId, changesAgo)
        setResult(diffResult)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        setLoading(false)
      }
    },
    [nodeId, getEngine]
  )

  return { diff, diffFromCurrent, result, loading, error }
}
