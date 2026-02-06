/**
 * useAudit - React hook for querying the audit log
 *
 * Provides paginated, filterable access to change audit entries
 * and activity summaries for nodes.
 *
 * @example
 * ```tsx
 * const { entries, activity, loading } = useAudit(nodeId)
 * const { entries: filtered } = useAudit(nodeId, { operations: ['create', 'delete'] })
 * ```
 */

import type { NodeId, NodeStorageAdapter } from '@xnet/data'
import { AuditIndex, type AuditQuery, type AuditEntry, type ActivitySummary } from '@xnet/history'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNodeStore } from './useNodeStore'

// ─── Types ───────────────────────────────────────────────────

export interface UseAuditOptions {
  /** Filter by operations */
  operations?: ('create' | 'update' | 'delete' | 'restore')[]
  /** Filter by author DID */
  author?: string
  /** Time range filter [from, to] in wall clock ms */
  timeRange?: [number, number]
  /** Max entries to return */
  limit?: number
  /** Sort order */
  order?: 'asc' | 'desc'
}

export interface UseAuditResult {
  /** Audit entries matching the query */
  entries: AuditEntry[]
  /** Activity summary for the node */
  activity: ActivitySummary | null
  /** Whether loading */
  loading: boolean
  /** Any error */
  error: Error | null
  /** Reload audit data */
  reload: () => Promise<void>
}

// ─── Hook ────────────────────────────────────────────────────

export function useAudit(nodeId: NodeId | null, options?: UseAuditOptions): UseAuditResult {
  const { store, isReady } = useNodeStore()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [activity, setActivity] = useState<ActivitySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const auditRef = useRef<{ audit: AuditIndex; storage: NodeStorageAdapter } | null>(null)

  const getAudit = useCallback((): AuditIndex | null => {
    if (!store) return null
    const storage = store.getStorageAdapter()
    if (!storage) return null

    if (!auditRef.current || auditRef.current.storage !== storage) {
      auditRef.current = { audit: new AuditIndex(storage), storage }
    }
    return auditRef.current.audit
  }, [store])

  const load = useCallback(async () => {
    if (!nodeId || !isReady) return
    const audit = getAudit()
    if (!audit) return

    setLoading(true)
    setError(null)
    try {
      const query: AuditQuery = {
        nodeId,
        order: options?.order ?? 'desc',
        limit: options?.limit ?? 200
      }
      if (options?.operations) query.operations = options.operations
      if (options?.author) query.author = options.author as any
      if (options?.timeRange) {
        query.fromWallTime = options.timeRange[0]
        query.toWallTime = options.timeRange[1]
      }

      const [auditEntries, activitySummary] = await Promise.all([
        audit.query(query),
        audit.getNodeActivity(nodeId)
      ])
      setEntries(auditEntries)
      setActivity(activitySummary)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [
    nodeId,
    isReady,
    getAudit,
    options?.operations,
    options?.author,
    options?.timeRange,
    options?.limit,
    options?.order
  ])

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

  return { entries, activity, loading, error, reload: load }
}
