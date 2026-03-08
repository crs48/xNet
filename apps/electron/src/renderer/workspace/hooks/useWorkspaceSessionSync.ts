/**
 * Sync workspace session runtime state from Electron main into xNet session summaries.
 */

import type { SessionSummaryNode } from '../state/active-session'
import { startTransition, useEffect, useMemo, useRef } from 'react'
import { useSessionCommands } from './useSessionCommands'

type UseWorkspaceSessionSyncOptions = {
  summaries: readonly SessionSummaryNode[]
  activeSessionId: string | null
}

export function useWorkspaceSessionSync({
  summaries,
  activeSessionId
}: UseWorkspaceSessionSyncOptions): void {
  const { applyWorkspaceSessionSnapshot, syncWorkspaceSessions } = useSessionCommands()

  const structuralSummariesRef = useRef(summaries)
  const syncWorkspaceSessionsRef = useRef(syncWorkspaceSessions)
  const applyWorkspaceSessionSnapshotRef = useRef(applyWorkspaceSessionSnapshot)
  const syncKey = useMemo(
    () =>
      JSON.stringify(
        summaries.map((session) => [
          session.id,
          session.title ?? '',
          session.branch ?? '',
          session.worktreeName ?? '',
          session.worktreePath ?? ''
        ])
      ),
    [summaries]
  )

  useEffect(() => {
    structuralSummariesRef.current = summaries
  }, [summaries, syncKey])

  useEffect(() => {
    syncWorkspaceSessionsRef.current = syncWorkspaceSessions
  }, [syncWorkspaceSessions])

  useEffect(() => {
    applyWorkspaceSessionSnapshotRef.current = applyWorkspaceSessionSnapshot
  }, [applyWorkspaceSessionSnapshot])

  useEffect(() => {
    let active = true

    void syncWorkspaceSessionsRef
      .current(structuralSummariesRef.current, activeSessionId)
      .catch((error) => {
        if (!active) {
          return
        }

        console.error('[WorkspaceSessionSync] Failed to sync session resources', error)
      })

    return () => {
      active = false
    }
  }, [activeSessionId, syncKey])

  useEffect(() => {
    return window.xnetWorkspaceSessions.onStatusChange((event) => {
      startTransition(() => {
        void applyWorkspaceSessionSnapshotRef.current(event.session)
      })
    })
  }, [])
}
