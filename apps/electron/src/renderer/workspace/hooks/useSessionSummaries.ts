/**
 * Hook for reading denormalized session summaries for the workspace rail.
 */

import { useQuery } from '@xnetjs/react'
import { useCallback, useMemo } from 'react'
import { SessionSummarySchema } from '../schemas'
import { orderSessionSummaries, SESSION_SUMMARY_QUERY } from '../state/active-session'
import { useActiveSessionId } from './useActiveSession'

export function useSessionSummaries() {
  const shellStateQuery = useActiveSessionId()
  const sessionSummaryQuery = useQuery(SessionSummarySchema, SESSION_SUMMARY_QUERY)

  const data = useMemo(
    () => orderSessionSummaries(sessionSummaryQuery.data, shellStateQuery.activeSessionId),
    [sessionSummaryQuery.data, shellStateQuery.activeSessionId]
  )

  const reload = useCallback(async () => {
    await Promise.all([shellStateQuery.reload(), sessionSummaryQuery.reload()])
  }, [sessionSummaryQuery, shellStateQuery])

  return {
    data,
    activeSessionId: shellStateQuery.activeSessionId,
    shellState: shellStateQuery.shellState,
    loading: shellStateQuery.loading || sessionSummaryQuery.loading,
    error: shellStateQuery.error ?? sessionSummaryQuery.error,
    reload
  }
}
