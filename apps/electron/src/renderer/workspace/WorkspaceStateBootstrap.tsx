/**
 * Ensures the workspace shell state exists before the coding UI mounts.
 */

import React, { useEffect } from 'react'
import { useActiveSessionId } from './hooks/useActiveSession'
import { useSessionCommands } from './hooks/useSessionCommands'

export function WorkspaceStateBootstrap(): React.ReactElement | null {
  const { shellState, loading } = useActiveSessionId()
  const { ensureWorkspaceShellState } = useSessionCommands()

  useEffect(() => {
    if (loading || shellState) {
      return
    }

    void ensureWorkspaceShellState()
  }, [ensureWorkspaceShellState, loading, shellState])

  return null
}
