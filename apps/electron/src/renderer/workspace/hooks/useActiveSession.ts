/**
 * Hooks for the active coding workspace session.
 */

import { useQuery } from '@xnetjs/react'
import { useCallback, useMemo } from 'react'
import { SessionSummarySchema, WorkspaceShellStateSchema } from '../schemas'
import {
  orderSessionSummaries,
  SESSION_SUMMARY_QUERY,
  WORKSPACE_SHELL_STATE_NODE_ID
} from '../state/active-session'

export function useActiveSessionId() {
  const query = useQuery(WorkspaceShellStateSchema, WORKSPACE_SHELL_STATE_NODE_ID)

  return {
    shellState: query.data,
    activeSessionId: query.data?.activeSession ?? null,
    loading: query.loading,
    error: query.error,
    reload: query.reload
  }
}

export function useActiveSession() {
  const shellStateQuery = useActiveSessionId()
  const sessionSummaryQuery = useQuery(SessionSummarySchema, SESSION_SUMMARY_QUERY)

  const activeSession = useMemo(() => {
    if (!shellStateQuery.activeSessionId) {
      return null
    }

    return (
      sessionSummaryQuery.data.find((session) => session.id === shellStateQuery.activeSessionId) ??
      null
    )
  }, [sessionSummaryQuery.data, shellStateQuery.activeSessionId])

  const orderedSessions = useMemo(
    () => orderSessionSummaries(sessionSummaryQuery.data, shellStateQuery.activeSessionId),
    [sessionSummaryQuery.data, shellStateQuery.activeSessionId]
  )

  const reload = useCallback(async () => {
    await Promise.all([shellStateQuery.reload(), sessionSummaryQuery.reload()])
  }, [sessionSummaryQuery, shellStateQuery])

  return {
    ...shellStateQuery,
    activeSession,
    summaries: orderedSessions,
    summariesLoading: sessionSummaryQuery.loading,
    summariesError: sessionSummaryQuery.error,
    reload
  }
}
