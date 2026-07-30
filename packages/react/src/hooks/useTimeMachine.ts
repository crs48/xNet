/**
 * useTimeMachine — React binding for the Time Machine (exploration 0329 P1).
 *
 * Wraps the history engine's scrub stack (`ScopeTimeline` merged Lamport line,
 * hash-anchored `Frontier` positions, named `Checkpoint` nodes, the prune
 * horizon) into one hook a scrubber UI can bind to:
 *
 * - `timeline` is the merged, Lamport-ordered change line for the scope (the
 *   node itself by default; pass `memberIds` to widen to a database's rows…).
 * - `position` glides along that line (`setPosition`/`stepBack`/`stepForward`);
 *   `preview` + `diffs` materialize the primary node there and compare it to
 *   current state (before = at position, after = now).
 * - `checkpoints` are named versions scoped to the node; `createNamedVersion`
 *   captures-and-pins the current frontier (Google Docs' named versions).
 * - `restore` applies one compensating transaction back to the scrubbed
 *   frontier (new changes, no log rewriting — the restore is itself undoable).
 * - `horizon` is non-null when older history was compacted on this device.
 *
 * @example
 * ```tsx
 * const tm = useTimeMachine(nodeId)
 * <input type="range" max={tm.changeCount - 1} value={tm.position}
 *        onChange={(e) => tm.setPosition(Number(e.target.value))} />
 * ```
 */

import type { ContentId } from '@xnetjs/core'
import type { NodeId, NodeState, NodeStorageAdapter } from '@xnetjs/data'
import { CHECKPOINT_SCHEMA_IRI } from '@xnetjs/data'
import {
  HistoryEngine,
  HistoryHorizonError,
  MemorySnapshotStorage,
  ScopeTimeline,
  SnapshotCache,
  createCheckpoint,
  listCheckpoints,
  restoreToFrontier,
  type Frontier,
  type HistoryHorizon,
  type PropertyDiff,
  type RestoreResult,
  type ScopeTimelineEntry,
  type YjsSnapshotStorageAdapter
} from '@xnetjs/history'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNodeStore } from './useNodeStore'

// ─── Types ───────────────────────────────────────────────────

export interface UseTimeMachineOptions {
  /**
   * Scope membership beyond the node itself (e.g. a database's row ids).
   * The primary node is always included.
   */
  memberIds?: readonly NodeId[]
}

export interface UseTimeMachineResult {
  /** Merged, Lamport-ordered change line for the scope. */
  timeline: ScopeTimelineEntry[]
  /** Total changes on the line. */
  changeCount: number
  /** Current scrub index on the line (latest = changeCount - 1). */
  position: number
  /** True when scrubbed to (following) the latest change. */
  atLatest: boolean
  setPosition: (index: number) => void
  /** Step one change back / forward along the line. */
  stepBack: () => void
  stepForward: () => void
  /** Jump back to (and follow) the latest change. */
  goToLatest: () => void

  /** The primary node materialized at the scrub position. */
  preview: NodeState | null
  /** Property diff position → current (what restore would change back). */
  diffs: PropertyDiff[]
  /** Non-null when older history was compacted on this device. */
  horizon: HistoryHorizon | null
  /** Yjs document snapshots stored for the node; null when storage can't say. */
  docSnapshotCount: number | null

  /** Named versions (Checkpoint nodes) scoped to this node, newest first. */
  checkpoints: NodeState[]
  /** Capture-and-pin the current frontier under a name. */
  createNamedVersion: (name: string, note?: string) => Promise<NodeState | null>
  /** Timeline index a checkpoint pins the scope at, or null (below horizon). */
  positionOfCheckpoint: (checkpoint: NodeState) => number | null

  /** The hash-anchored frontier at a timeline index. */
  frontierAt: (index: number) => Frontier
  /** Restore the scope to the scrubbed frontier (one compensating batch). */
  restore: () => Promise<RestoreResult | null>

  loading: boolean
  error: Error | null
  reload: () => Promise<void>
}

// ─── Hook ────────────────────────────────────────────────────

export function useTimeMachine(
  nodeId: NodeId | null,
  options?: UseTimeMachineOptions
): UseTimeMachineResult {
  const { store, isReady } = useNodeStore()

  // Stable member list: the node itself plus any extra scope members.
  const memberKey = options?.memberIds?.join(',') ?? ''
  const members = useMemo<NodeId[]>(() => {
    if (!nodeId) return []
    const extra = options?.memberIds ?? []
    return [nodeId, ...extra.filter((id) => id !== nodeId)]
    // eslint-disable-next-line react-hooks/exhaustive-deps -- memberKey folds the array
  }, [nodeId, memberKey])

  const [timeline, setTimeline] = useState<ScopeTimelineEntry[]>([])
  const [checkpoints, setCheckpoints] = useState<NodeState[]>([])
  const [horizon, setHorizon] = useState<HistoryHorizon | null>(null)
  const [docSnapshotCount, setDocSnapshotCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // null = follow latest (new changes keep the scrubber at the right edge).
  const [rawPosition, setRawPosition] = useState<number | null>(null)
  const position =
    rawPosition === null
      ? Math.max(0, timeline.length - 1)
      : Math.max(0, Math.min(rawPosition, timeline.length - 1))
  const atLatest = timeline.length === 0 || position === timeline.length - 1

  const [preview, setPreview] = useState<NodeState | null>(null)
  const [diffs, setDiffs] = useState<PropertyDiff[]>([])

  // Engine + scope timeline, stable per storage adapter (same shape as useHistory).
  const engineRef = useRef<{
    engine: HistoryEngine
    scope: ScopeTimeline
    storage: NodeStorageAdapter
  } | null>(null)

  const getEngines = useCallback(() => {
    if (!store) return null
    const storage = store.getStorageAdapter()
    if (!storage) return null
    if (!engineRef.current || engineRef.current.storage !== storage) {
      const snapshots = new SnapshotCache(new MemorySnapshotStorage(), { interval: 50 })
      engineRef.current = {
        engine: new HistoryEngine(storage, snapshots),
        scope: new ScopeTimeline(storage),
        storage
      }
    }
    return engineRef.current
  }, [store])

  // ─── Loading ───────────────────────────────────────────────

  const reload = useCallback(async () => {
    if (!nodeId || !isReady || !store) return
    const engines = getEngines()
    if (!engines) return

    setLoading(true)
    setError(null)
    try {
      const [line, nodeHorizon, named] = await Promise.all([
        engines.scope.getMergedTimeline(members),
        engines.engine.getHorizon(nodeId),
        listCheckpoints(store, nodeId)
      ])
      setTimeline(line)
      setHorizon(nodeHorizon)
      setCheckpoints(named)

      // Optional Yjs document lane: snapshot count when storage supports it.
      const snapshotStorage = engines.storage as Partial<YjsSnapshotStorageAdapter>
      if (typeof snapshotStorage.getYjsSnapshots === 'function') {
        const snapshots = await snapshotStorage.getYjsSnapshots(nodeId)
        setDocSnapshotCount(snapshots.length)
      } else {
        setDocSnapshotCount(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [nodeId, isReady, store, members, getEngines])

  useEffect(() => {
    setRawPosition(null)
    void reload()
  }, [reload])

  // Live: member changes reload the line; checkpoint writes reload the list.
  useEffect(() => {
    if (!store || !nodeId) return
    const memberSet = new Set(members)
    const unsub = store.subscribe((event) => {
      if (
        memberSet.has(event.change.payload.nodeId) ||
        event.change.payload.schemaId === CHECKPOINT_SCHEMA_IRI
      ) {
        void reload()
      }
    })
    return unsub
  }, [store, nodeId, members, reload])

  // ─── Preview + diff at the scrub position ──────────────────

  useEffect(() => {
    let cancelled = false
    const engines = getEngines()
    if (!nodeId || !engines || timeline.length === 0) {
      setPreview(null)
      setDiffs([])
      return
    }

    // The primary node's latest change at or before the position.
    let hash: ContentId | null = null
    for (let i = position; i >= 0; i--) {
      if (timeline[i].nodeId === nodeId) {
        hash = timeline[i].change.hash
        break
      }
    }
    if (!hash) {
      // The node did not exist at this moment (multi-member scopes).
      setPreview(null)
      setDiffs([])
      return
    }

    const target = { type: 'hash', hash } as const
    Promise.all([
      engines.engine.materializeAt(nodeId, target),
      engines.engine.diff(nodeId, target, { type: 'latest' })
    ])
      .then(([state, propertyDiffs]) => {
        if (cancelled) return
        setPreview(state.node)
        setDiffs(propertyDiffs)
      })
      .catch((err) => {
        if (cancelled) return
        setPreview(null)
        setDiffs([])
        if (err instanceof HistoryHorizonError) {
          setHorizon(err.horizon)
        } else {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      })

    return () => {
      cancelled = true
    }
  }, [nodeId, timeline, position, getEngines])

  // ─── Navigation ────────────────────────────────────────────

  const setPosition = useCallback(
    (index: number) => {
      const max = timeline.length - 1
      const clamped = Math.max(0, Math.min(index, max))
      // Landing on the right edge resumes following the latest change.
      setRawPosition(clamped >= max ? null : clamped)
    },
    [timeline.length]
  )

  const stepBack = useCallback(() => setPosition(position - 1), [setPosition, position])
  const stepForward = useCallback(() => setPosition(position + 1), [setPosition, position])
  const goToLatest = useCallback(() => setRawPosition(null), [])

  // ─── Checkpoints (named versions) ──────────────────────────

  const createNamedVersion = useCallback(
    async (name: string, note?: string): Promise<NodeState | null> => {
      if (!nodeId || !store) return null
      const engines = getEngines()
      if (!engines) return null
      try {
        const checkpoint = await createCheckpoint(store, engines.storage, {
          name,
          ...(note !== undefined ? { note } : {}),
          nodeIds: members,
          scopeId: nodeId
        })
        await reload()
        return checkpoint
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      }
    },
    [nodeId, store, members, getEngines, reload]
  )

  const positionOfCheckpoint = useCallback(
    (checkpoint: NodeState): number | null => {
      const frontier = checkpoint.properties.frontier as Frontier | undefined
      if (!frontier) return null
      let best = -1
      for (let i = 0; i < timeline.length; i++) {
        const pinned = frontier[timeline[i].nodeId]
        if (pinned && pinned.hash === timeline[i].change.hash) {
          best = Math.max(best, i)
        }
      }
      return best >= 0 ? best : null
    },
    [timeline]
  )

  // ─── Frontier + restore ────────────────────────────────────

  const frontierAt = useCallback(
    (index: number): Frontier => {
      const scope = getEngines()?.scope
      if (!scope) return {}
      return scope.frontierAtPosition(timeline, index)
    },
    [getEngines, timeline]
  )

  const restore = useCallback(async (): Promise<RestoreResult | null> => {
    if (!nodeId || !store || timeline.length === 0) return null
    const engines = getEngines()
    if (!engines) return null
    try {
      const frontier = engines.scope.frontierAtPosition(timeline, position)
      const result = await restoreToFrontier(store, engines.engine, frontier, members)
      setRawPosition(null)
      await reload()
      return result
    } catch (err) {
      if (err instanceof HistoryHorizonError) setHorizon(err.horizon)
      setError(err instanceof Error ? err : new Error(String(err)))
      return null
    }
  }, [nodeId, store, timeline, position, members, getEngines, reload])

  return {
    timeline,
    changeCount: timeline.length,
    position,
    atLatest,
    setPosition,
    stepBack,
    stepForward,
    goToLatest,
    preview,
    diffs,
    horizon,
    docSnapshotCount,
    checkpoints,
    createNamedVersion,
    positionOfCheckpoint,
    frontierAt,
    restore,
    loading,
    error,
    reload
  }
}
