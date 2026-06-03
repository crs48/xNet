/**
 * useAuthTrace - Surface store.auth.explain traces for auth UX and debugging.
 */

import type { AuthAction, AuthTrace, AuthTraceStep } from '@xnetjs/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNodeStore } from './useNodeStore'

const GRANT_SCHEMA_ID = 'xnet://xnet.fyi/Grant'

export type AuthTraceSummary = {
  allowed: boolean
  action: AuthAction
  resource: string
  roles: string[]
  grants: string[]
  reasons: string[]
  evaluatedAt: number
  duration: number
  steps: AuthTraceStep[]
}

export type UseAuthTraceResult = {
  trace: AuthTrace | null
  summary: AuthTraceSummary | null
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
}

type UseAuthTraceOptions = {
  nodeId: string
  action: AuthAction
  enabled?: boolean
}

type ChangeEventLike = {
  change?: { payload?: { nodeId?: string } }
  node?: { schemaId?: string; properties?: Record<string, unknown> }
}

export function summarizeAuthTrace(trace: AuthTrace): AuthTraceSummary {
  return {
    allowed: trace.allowed,
    action: trace.action,
    resource: trace.resource,
    roles: trace.roles,
    grants: trace.grants,
    reasons: trace.reasons,
    evaluatedAt: trace.evaluatedAt,
    duration: trace.duration,
    steps: trace.steps
  }
}

export function useAuthTrace({
  nodeId,
  action,
  enabled = true
}: UseAuthTraceOptions): UseAuthTraceResult {
  const { store, isReady } = useNodeStore()
  const [trace, setTrace] = useState<AuthTrace | null>(null)
  const [summary, setSummary] = useState<AuthTraceSummary | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)
  const requestRef = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) {
      setLoading(false)
      return
    }

    if (!store || !isReady) {
      setLoading(true)
      return
    }

    if (!store.auth) {
      setTrace(null)
      setSummary(null)
      setLoading(false)
      setError(new Error('Authorization API is not configured on this NodeStore'))
      return
    }

    const requestId = ++requestRef.current
    setLoading(true)
    setError(null)

    try {
      const nextTrace = await store.auth.explain({ action, nodeId })
      if (requestRef.current !== requestId) return

      setTrace(nextTrace)
      setSummary(summarizeAuthTrace(nextTrace))
      setLoading(false)
    } catch (err) {
      if (requestRef.current !== requestId) return

      const normalized = err instanceof Error ? err : new Error(String(err))
      setTrace(null)
      setSummary(null)
      setLoading(false)
      setError(normalized)
    }
  }, [action, enabled, isReady, nodeId, store])

  useEffect(() => {
    void refresh()

    if (!store || !isReady || !enabled) {
      return
    }

    const unsubscribe = store.subscribe((event) => {
      const typedEvent = event as ChangeEventLike
      const eventNodeId = typedEvent.change?.payload?.nodeId
      if (eventNodeId === nodeId) {
        void refresh()
        return
      }

      const isGrantUpdate = typedEvent.node?.schemaId === GRANT_SCHEMA_ID
      const grantResource = typedEvent.node?.properties?.resource
      if (isGrantUpdate && grantResource === nodeId) {
        void refresh()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [enabled, isReady, nodeId, refresh, store])

  return {
    trace,
    summary,
    loading,
    error,
    refresh
  }
}
