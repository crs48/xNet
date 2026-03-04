/**
 * useHistory - React hook for node history / time travel
 *
 * Provides point-in-time reconstruction, timeline browsing,
 * and state materialization for a node.
 *
 * @example
 * ```tsx
 * const { timeline, materializeAt, diff, changeCount, loading } = useHistory(nodeId)
 *
 * // Get timeline
 * const entries = timeline
 *
 * // Materialize at a specific point
 * const historical = await materializeAt({ type: 'index', index: 5 })
 *
 * // Diff two points
 * const diffs = await diff({ type: 'index', index: 0 }, { type: 'latest' })
 * ```
 */

import type { NodeId, NodeStorageAdapter } from '@xnetjs/data'
import {
  HistoryEngine,
  SnapshotCache,
  MemorySnapshotStorage,
  type HistoryTarget,
  type HistoricalState,
  type TimelineEntry,
  type PropertyDiff
} from '@xnetjs/history'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNodeStore } from './useNodeStore'

// ─── Types ───────────────────────────────────────────────────

export interface UseHistoryResult {
  /** Full timeline of changes for the node */
  timeline: TimelineEntry[]
  /** Total number of changes */
  changeCount: number
  /** Reconstruct node state at a target point */
  materializeAt: (target: HistoryTarget) => Promise<HistoricalState | null>
  /** Diff between two points */
  diff: (from: HistoryTarget, to: HistoryTarget) => Promise<PropertyDiff[]>
  /** Create a revert payload to restore to a historical point */
  createRevertPayload: (target: HistoryTarget) => Promise<Record<string, unknown> | null>
  /** Whether the timeline is loading */
  loading: boolean
  /** Any error */
  error: Error | null
  /** Reload the timeline */
  reload: () => Promise<void>
}

// ─── Hook ────────────────────────────────────────────────────

export function useHistory(nodeId: NodeId | null): UseHistoryResult {
  const { store, isReady } = useNodeStore()
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Create engine lazily (stable across renders)
  const engineRef = useRef<{ engine: HistoryEngine; storage: NodeStorageAdapter } | null>(null)

  const getEngine = useCallback((): HistoryEngine | null => {
    if (!store) return null
    // Access the storage adapter via public API
    const storage = store.getStorageAdapter()
    if (!storage) return null

    if (!engineRef.current || engineRef.current.storage !== storage) {
      const snapshotStorage = new MemorySnapshotStorage()
      const snapshots = new SnapshotCache(snapshotStorage, { interval: 50 })
      engineRef.current = { engine: new HistoryEngine(storage, snapshots), storage }
    }
    return engineRef.current.engine
  }, [store])

  const loadTimeline = useCallback(async () => {
    if (!nodeId || !isReady) return
    const engine = getEngine()
    if (!engine) return

    setLoading(true)
    setError(null)
    try {
      const entries = await engine.getTimeline(nodeId)
      setTimeline(entries)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [nodeId, isReady, getEngine])

  // Load on mount and when nodeId changes
  useEffect(() => {
    loadTimeline()
  }, [loadTimeline])

  // Subscribe to changes to auto-reload timeline
  useEffect(() => {
    if (!store || !nodeId) return
    const unsub = store.subscribe((event) => {
      if (event.change.payload.nodeId === nodeId) {
        loadTimeline()
      }
    })
    return unsub
  }, [store, nodeId, loadTimeline])

  const materializeAt = useCallback(
    async (target: HistoryTarget): Promise<HistoricalState | null> => {
      if (!nodeId) return null
      const engine = getEngine()
      if (!engine) return null
      try {
        return await engine.materializeAt(nodeId, target)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      }
    },
    [nodeId, getEngine]
  )

  const diff = useCallback(
    async (from: HistoryTarget, to: HistoryTarget): Promise<PropertyDiff[]> => {
      if (!nodeId) return []
      const engine = getEngine()
      if (!engine) return []
      try {
        return await engine.diff(nodeId, from, to)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return []
      }
    },
    [nodeId, getEngine]
  )

  const createRevertPayload = useCallback(
    async (target: HistoryTarget): Promise<Record<string, unknown> | null> => {
      if (!nodeId || !store) return null
      const engine = getEngine()
      if (!engine) return null
      try {
        const current = await store.get(nodeId)
        if (!current) return null
        return await engine.createRevertPayload(nodeId, target, current)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      }
    },
    [nodeId, store, getEngine]
  )

  return {
    timeline,
    changeCount: timeline.length,
    materializeAt,
    diff,
    createRevertPayload,
    loading,
    error,
    reload: loadTimeline
  }
}
