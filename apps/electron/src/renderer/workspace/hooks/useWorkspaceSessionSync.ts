/**
 * Sync workspace session runtime state from Electron main into xNet session summaries.
 */

import type { SessionSummaryNode } from '../state/active-session'
import { startTransition, useEffect, useMemo, useRef } from 'react'
import { logWorkspaceDebug } from '../debug'
import { useSessionCommands } from './useSessionCommands'

type UseWorkspaceSessionSyncOptions = {
  summaries: readonly SessionSummaryNode[]
  activeSessionId: string | null
}

function orderSyncSummaries(
  summaries: readonly SessionSummaryNode[],
  activeSessionId: string | null
): SessionSummaryNode[] {
  return [...summaries].sort((left, right) => {
    const leftActive = left.id === activeSessionId
    const rightActive = right.id === activeSessionId

    if (leftActive !== rightActive) {
      return leftActive ? -1 : 1
    }

    const leftKey = [
      left.id,
      left.title ?? '',
      left.branch ?? '',
      left.worktreeName ?? '',
      left.worktreePath ?? ''
    ].join('\u0000')
    const rightKey = [
      right.id,
      right.title ?? '',
      right.branch ?? '',
      right.worktreeName ?? '',
      right.worktreePath ?? ''
    ].join('\u0000')

    return leftKey.localeCompare(rightKey)
  })
}

export function useWorkspaceSessionSync({
  summaries,
  activeSessionId
}: UseWorkspaceSessionSyncOptions): void {
  const { applyWorkspaceSessionSnapshot, syncWorkspaceSessions } = useSessionCommands()

  const structuralSummariesRef = useRef(summaries)
  const syncWorkspaceSessionsRef = useRef(syncWorkspaceSessions)
  const applyWorkspaceSessionSnapshotRef = useRef(applyWorkspaceSessionSnapshot)
  const stableSummaries = useMemo(
    () => orderSyncSummaries(summaries, activeSessionId),
    [activeSessionId, summaries]
  )
  const syncKey = useMemo(
    () =>
      JSON.stringify(
        stableSummaries.map((session) => [
          session.id,
          session.title ?? '',
          session.branch ?? '',
          session.worktreeName ?? '',
          session.worktreePath ?? ''
        ])
      ),
    [stableSummaries]
  )

  useEffect(() => {
    structuralSummariesRef.current = stableSummaries
  }, [stableSummaries, syncKey])

  useEffect(() => {
    syncWorkspaceSessionsRef.current = syncWorkspaceSessions
  }, [syncWorkspaceSessions])

  useEffect(() => {
    applyWorkspaceSessionSnapshotRef.current = applyWorkspaceSessionSnapshot
  }, [applyWorkspaceSessionSnapshot])

  useEffect(() => {
    let active = true
    logWorkspaceDebug('sync.effect', 'run', {
      activeSessionId,
      summaryIds: structuralSummariesRef.current.map((session) => session.id),
      syncKey
    })

    void syncWorkspaceSessionsRef
      .current(structuralSummariesRef.current, activeSessionId)
      .catch((error) => {
        if (!active) {
          return
        }

        logWorkspaceDebug('sync.effect', 'failed', {
          activeSessionId,
          error: error instanceof Error ? error.message : String(error)
        })
        console.error('[WorkspaceSessionSync] Failed to sync session resources', error)
      })

    return () => {
      active = false
    }
  }, [activeSessionId, syncKey])

  useEffect(() => {
    return window.xnetWorkspaceSessions.onStatusChange((event) => {
      logWorkspaceDebug('sync.status', 'received', {
        sessionId: event.session.sessionId,
        state: event.session.state,
        changedFilesCount: event.session.changedFilesCount,
        previewUrl: event.session.previewUrl ?? null,
        isDirty: event.session.isDirty
      })
      startTransition(() => {
        void applyWorkspaceSessionSnapshotRef.current(event.session)
      })
    })
  }, [])
}
