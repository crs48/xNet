/**
 * Fetches and refreshes git-backed review data for the active workspace session.
 */

import type { WorkspaceSessionReview } from '../../../shared/workspace-session'
import type { SessionSummaryNode } from '../state/active-session'
import { useCallback, useEffect, useState } from 'react'
import { useSessionCommands } from './useSessionCommands'

type UseWorkspaceReviewResult = {
  review: WorkspaceSessionReview | null
  loading: boolean
  error: Error | null
  refresh(): Promise<void>
}

export function useWorkspaceReview(
  activeSession: SessionSummaryNode | null
): UseWorkspaceReviewResult {
  const { reviewWorkspaceSession } = useSessionCommands()
  const [review, setReview] = useState<WorkspaceSessionReview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!activeSession) {
      setReview(null)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const nextReview = await reviewWorkspaceSession(activeSession)
      setReview(nextReview)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError : new Error(String(nextError)))
    } finally {
      setLoading(false)
    }
  }, [activeSession, reviewWorkspaceSession])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    review,
    loading,
    error,
    refresh
  }
}
