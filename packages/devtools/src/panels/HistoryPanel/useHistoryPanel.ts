/**
 * useHistoryPanel - Hook for the History DevTools panel
 *
 * Manages node selection, sub-tab state, and creates history engines
 * to provide timeline, diff, blame, audit, verification, and storage data.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { NodeId, NodeStorageAdapter, NodeState } from '@xnet/data'
import {
  HistoryEngine,
  SnapshotCache,
  MemorySnapshotStorage,
  AuditIndex,
  BlameEngine,
  DiffEngine,
  VerificationEngine,
  PruningEngine,
  DEFAULT_POLICY,
  type TimelineEntry,
  type HistoryTarget,
  type HistoricalState,
  type PropertyDiff,
  type DiffResult,
  type BlameInfo,
  type AuditEntry,
  type AuditQuery,
  type ActivitySummary,
  type VerificationResult,
  type PruneCandidate
} from '@xnet/history'
import { useDevTools } from '../../provider/useDevTools'

// ─── Types ───────────────────────────────────────────────────

export type HistorySubTab = 'timeline' | 'diff' | 'blame' | 'audit' | 'verification' | 'storage'

export interface NodeOption {
  id: NodeId
  schemaIRI: string
  label: string
}

export interface StorageMetrics {
  totalChanges: number
  prunableChanges: number
  estimatedSize: number
  oldestChange: number
  newestChange: number
  hasSnapshot: boolean
}

export interface UseHistoryPanelResult {
  // Node selection
  nodes: NodeOption[]
  selectedNodeId: NodeId | null
  setSelectedNodeId: (id: NodeId | null) => void

  // Sub-tab
  activeTab: HistorySubTab
  setActiveTab: (tab: HistorySubTab) => void

  // Timeline
  timeline: TimelineEntry[]
  timelineLoading: boolean
  selectedTimelineIndex: number | null
  setSelectedTimelineIndex: (index: number | null) => void
  materializedState: HistoricalState | null
  materializeAt: (target: HistoryTarget) => Promise<void>

  // Diff
  diffFrom: number
  diffTo: number
  setDiffFrom: (index: number) => void
  setDiffTo: (index: number) => void
  diffResult: DiffResult | null
  diffLoading: boolean
  computeDiff: () => Promise<void>

  // Blame
  blameInfo: BlameInfo[]
  blameLoading: boolean
  loadBlame: () => Promise<void>

  // Audit
  auditEntries: AuditEntry[]
  auditLoading: boolean
  activitySummary: ActivitySummary | null
  auditOperationFilter: string | null
  setAuditOperationFilter: (op: string | null) => void
  loadAudit: () => Promise<void>

  // Verification
  verificationResult: VerificationResult | null
  verificationLoading: boolean
  runVerification: () => Promise<void>

  // Storage
  storageMetrics: StorageMetrics | null
  pruneCandidates: PruneCandidate[]
  storageLoading: boolean
  loadStorageMetrics: () => Promise<void>

  // General
  error: string | null
}

// ─── Hook ────────────────────────────────────────────────────

export function useHistoryPanel(): UseHistoryPanelResult {
  const { store } = useDevTools()

  // ─── Node Selection ──────────────────────────────────────
  const [nodes, setNodes] = useState<NodeOption[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null)
  const [activeTab, setActiveTab] = useState<HistorySubTab>('timeline')
  const [error, setError] = useState<string | null>(null)

  // ─── Timeline State ──────────────────────────────────────
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [selectedTimelineIndex, setSelectedTimelineIndex] = useState<number | null>(null)
  const [materializedState, setMaterializedState] = useState<HistoricalState | null>(null)

  // ─── Diff State ──────────────────────────────────────────
  const [diffFrom, setDiffFrom] = useState(0)
  const [diffTo, setDiffTo] = useState(0)
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  // ─── Blame State ─────────────────────────────────────────
  const [blameInfo, setBlameInfo] = useState<BlameInfo[]>([])
  const [blameLoading, setBlameLoading] = useState(false)

  // ─── Audit State ─────────────────────────────────────────
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null)
  const [auditOperationFilter, setAuditOperationFilter] = useState<string | null>(null)

  // ─── Verification State ──────────────────────────────────
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)
  const [verificationLoading, setVerificationLoading] = useState(false)

  // ─── Storage State ───────────────────────────────────────
  const [storageMetrics, setStorageMetrics] = useState<StorageMetrics | null>(null)
  const [pruneCandidates, setPruneCandidates] = useState<PruneCandidate[]>([])
  const [storageLoading, setStorageLoading] = useState(false)

  // ─── Engine Refs ─────────────────────────────────────────
  const enginesRef = useRef<{
    storage: NodeStorageAdapter
    history: HistoryEngine
    snapshots: SnapshotCache
    audit: AuditIndex
    blame: BlameEngine
    diff: DiffEngine
    verification: VerificationEngine
    pruning: PruningEngine
  } | null>(null)

  const getStorage = useCallback((): NodeStorageAdapter | null => {
    if (!store) return null
    return ((store as any).storage as NodeStorageAdapter | undefined) ?? null
  }, [store])

  const getEngines = useCallback(() => {
    const storage = getStorage()
    if (!storage) return null

    if (!enginesRef.current || enginesRef.current.storage !== storage) {
      const snapshotStorage = new MemorySnapshotStorage()
      const snapshots = new SnapshotCache(snapshotStorage, { interval: 50 })
      const history = new HistoryEngine(storage, snapshots)
      const audit = new AuditIndex(storage)
      const blame = new BlameEngine(storage)
      const diff = new DiffEngine(history)
      const verification = new VerificationEngine(storage)
      const pruning = new PruningEngine(storage as any, snapshots, verification, DEFAULT_POLICY)
      enginesRef.current = {
        storage,
        history,
        snapshots,
        audit,
        blame,
        diff,
        verification,
        pruning
      }
    }
    return enginesRef.current
  }, [getStorage])

  // ─── Load Node List ──────────────────────────────────────
  useEffect(() => {
    if (!store) return
    let cancelled = false

    const load = async () => {
      try {
        const allNodes = await store.list()
        if (cancelled) return
        const options: NodeOption[] = allNodes.map((n: NodeState) => ({
          id: n.id as NodeId,
          schemaIRI: n.schemaId ?? 'unknown',
          label:
            (n.properties?.title as string) || (n.properties?.name as string) || n.id.slice(0, 12)
        }))
        setNodes(options)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }

    load()
    const unsub = store.subscribe(() => load())
    return () => {
      cancelled = true
      unsub()
    }
  }, [store])

  // ─── Load Timeline ───────────────────────────────────────
  const loadTimeline = useCallback(async () => {
    if (!selectedNodeId) {
      setTimeline([])
      return
    }
    const engines = getEngines()
    if (!engines) return

    setTimelineLoading(true)
    setError(null)
    try {
      const entries = await engines.history.getTimeline(selectedNodeId)
      setTimeline(entries)
      if (entries.length > 0) {
        setDiffTo(entries.length - 1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTimelineLoading(false)
    }
  }, [selectedNodeId, getEngines])

  useEffect(() => {
    loadTimeline()
    // Reset state when node changes
    setSelectedTimelineIndex(null)
    setMaterializedState(null)
    setDiffResult(null)
    setBlameInfo([])
    setAuditEntries([])
    setActivitySummary(null)
    setVerificationResult(null)
    setStorageMetrics(null)
  }, [loadTimeline])

  // ─── Materialize At ──────────────────────────────────────
  const materializeAt = useCallback(
    async (target: HistoryTarget) => {
      if (!selectedNodeId) return
      const engines = getEngines()
      if (!engines) return

      try {
        const state = await engines.history.materializeAt(selectedNodeId, target)
        setMaterializedState(state)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [selectedNodeId, getEngines]
  )

  // ─── Compute Diff ────────────────────────────────────────
  const computeDiff = useCallback(async () => {
    if (!selectedNodeId) return
    const engines = getEngines()
    if (!engines) return

    setDiffLoading(true)
    try {
      const result = await engines.diff.diffNode(
        selectedNodeId,
        { type: 'index', index: diffFrom },
        { type: 'index', index: diffTo }
      )
      setDiffResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDiffLoading(false)
    }
  }, [selectedNodeId, diffFrom, diffTo, getEngines])

  // ─── Load Blame ──────────────────────────────────────────
  const loadBlame = useCallback(async () => {
    if (!selectedNodeId) return
    const engines = getEngines()
    if (!engines) return

    setBlameLoading(true)
    try {
      const info = await engines.blame.getBlame(selectedNodeId)
      setBlameInfo(info)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBlameLoading(false)
    }
  }, [selectedNodeId, getEngines])

  // ─── Load Audit ──────────────────────────────────────────
  const loadAudit = useCallback(async () => {
    if (!selectedNodeId) return
    const engines = getEngines()
    if (!engines) return

    setAuditLoading(true)
    try {
      const query: AuditQuery = { nodeId: selectedNodeId, order: 'desc', limit: 200 }
      if (auditOperationFilter) {
        query.operations = [auditOperationFilter as 'create' | 'update' | 'delete' | 'restore']
      }
      const entries = await engines.audit.query(query)
      setAuditEntries(entries)

      const summary = await engines.audit.getNodeActivity(selectedNodeId)
      setActivitySummary(summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAuditLoading(false)
    }
  }, [selectedNodeId, auditOperationFilter, getEngines])

  // ─── Run Verification ────────────────────────────────────
  const runVerification = useCallback(async () => {
    if (!selectedNodeId) return
    const engines = getEngines()
    if (!engines) return

    setVerificationLoading(true)
    try {
      const result = await engines.verification.verifyNodeHistory(selectedNodeId)
      setVerificationResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setVerificationLoading(false)
    }
  }, [selectedNodeId, getEngines])

  // ─── Load Storage Metrics ────────────────────────────────
  const loadStorageMetrics = useCallback(async () => {
    if (!selectedNodeId) return
    const engines = getEngines()
    if (!engines) return

    setStorageLoading(true)
    try {
      const metrics = await engines.pruning.getStorageMetrics(selectedNodeId)
      setStorageMetrics(metrics)

      const candidates = await engines.pruning.findCandidates()
      setPruneCandidates(candidates)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStorageLoading(false)
    }
  }, [selectedNodeId, getEngines])

  return {
    nodes,
    selectedNodeId,
    setSelectedNodeId,
    activeTab,
    setActiveTab,
    timeline,
    timelineLoading,
    selectedTimelineIndex,
    setSelectedTimelineIndex,
    materializedState,
    materializeAt,
    diffFrom,
    diffTo,
    setDiffFrom,
    setDiffTo,
    diffResult,
    diffLoading,
    computeDiff,
    blameInfo,
    blameLoading,
    loadBlame,
    auditEntries,
    auditLoading,
    activitySummary,
    auditOperationFilter,
    setAuditOperationFilter,
    loadAudit,
    verificationResult,
    verificationLoading,
    runVerification,
    storageMetrics,
    pruneCandidates,
    storageLoading,
    loadStorageMetrics,
    error
  }
}
