/**
 * Fetches and refreshes git-backed review data for the active workspace session.
 */

import type { WorkspaceSessionReview } from '../../../shared/workspace-session'
import type { SessionSummaryNode } from '../state/active-session'
import { useTelemetry } from '@xnetjs/telemetry'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const telemetry = useTelemetry({ component: 'electron.workspace.review' })
  const [review, setReview] = useState<WorkspaceSessionReview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const activeSessionRef = useRef(activeSession)
  const reviewWorkspaceSessionRef = useRef(reviewWorkspaceSession)
  const telemetryRef = useRef(telemetry)
  const reviewKey = useMemo(
    () =>
      activeSession
        ? JSON.stringify([
            activeSession.id,
            activeSession.branch ?? '',
            activeSession.worktreePath ?? '',
            activeSession.changedFilesCount ?? 0,
            activeSession.lastScreenshotPath ?? '',
            activeSession.state ?? 'idle'
          ])
        : 'none',
    [
      activeSession?.branch,
      activeSession?.changedFilesCount,
      activeSession?.id,
      activeSession?.lastScreenshotPath,
      activeSession?.state,
      activeSession?.worktreePath
    ]
  )

  useEffect(() => {
    activeSessionRef.current = activeSession
  }, [activeSession])

  useEffect(() => {
    reviewWorkspaceSessionRef.current = reviewWorkspaceSession
  }, [reviewWorkspaceSession])

  useEffect(() => {
    telemetryRef.current = telemetry
  }, [telemetry])

  const refresh = useCallback(async (): Promise<void> => {
    const session = activeSessionRef.current
    const currentTelemetry = telemetryRef.current
    if (!session) {
      setReview(null)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    const start = performance.now()

    try {
      const nextReview = await reviewWorkspaceSessionRef.current(session)
      setReview(nextReview)
      currentTelemetry.reportPerformance(
        'workspace.review.generate',
        performance.now() - start,
        'electron.workspace'
      )
      currentTelemetry.reportUsage('workspace.review.generate.success', 1)
    } catch (nextError) {
      const normalized = nextError instanceof Error ? nextError : new Error(String(nextError))
      setError(normalized)
      currentTelemetry.reportUsage('workspace.review.generate.failure', 1)
      currentTelemetry.reportCrash(normalized, {
        codeNamespace: 'electron.workspace',
        codeFunction: 'workspace.review.generate',
        sessionId: session.id
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, reviewKey])

  return {
    review,
    loading,
    error,
    refresh
  }
}
