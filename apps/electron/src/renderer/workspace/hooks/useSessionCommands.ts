/**
 * Mutations for workspace session summaries and active-session state.
 */

import type {
  SessionSummaryNode,
  WorkspaceShellStateNode,
  createSessionSummaryInput,
  createSessionSummaryPatch,
  createWorkspaceShellStateInput,
  type SessionSummaryInput,
  WORKSPACE_SHELL_STATE_NODE_ID
} from '../state/active-session'
import { useMutate, useQuery } from '@xnetjs/react'
import { useCallback } from 'react'
import { SessionSummarySchema, WorkspaceShellStateSchema } from '../schemas'

type CreateSessionOptions = {
  id?: string
  select?: boolean
}

let pendingShellStateCreation: Promise<WorkspaceShellStateNode | null> | null = null

export function useSessionCommands() {
  const { create, update, remove } = useMutate()
  const shellStateQuery = useQuery(WorkspaceShellStateSchema, WORKSPACE_SHELL_STATE_NODE_ID)

  const ensureWorkspaceShellState =
    useCallback(async (): Promise<WorkspaceShellStateNode | null> => {
      if (shellStateQuery.data) {
        return shellStateQuery.data
      }

      if (pendingShellStateCreation) {
        return pendingShellStateCreation
      }

      pendingShellStateCreation = create(
        WorkspaceShellStateSchema,
        createWorkspaceShellStateInput(),
        WORKSPACE_SHELL_STATE_NODE_ID
      ).finally(() => {
        pendingShellStateCreation = null
      })

      return pendingShellStateCreation
    }, [create, shellStateQuery.data])

  const selectSession = useCallback(
    async (sessionId: string | null): Promise<WorkspaceShellStateNode | null> => {
      const shellState = await ensureWorkspaceShellState()
      if (!shellState) {
        return null
      }

      return update(WorkspaceShellStateSchema, shellState.id, {
        activeSession: sessionId ?? undefined
      })
    },
    [ensureWorkspaceShellState, update]
  )

  const createSessionSummary = useCallback(
    async (
      input: SessionSummaryInput,
      options: CreateSessionOptions = {}
    ): Promise<SessionSummaryNode | null> => {
      const session = await create(
        SessionSummarySchema,
        createSessionSummaryInput(input),
        options.id
      )

      if (!session) {
        return null
      }

      if (options.select ?? true) {
        await selectSession(session.id)
      }

      return session
    },
    [create, selectSession]
  )

  const updateSessionSummary = useCallback(
    async (
      sessionId: string,
      patch: Partial<SessionSummaryInput>
    ): Promise<SessionSummaryNode | null> => {
      return update(SessionSummarySchema, sessionId, createSessionSummaryPatch(patch))
    },
    [update]
  )

  const removeSessionSummary = useCallback(
    async (sessionId: string): Promise<void> => {
      if (shellStateQuery.data?.activeSession === sessionId) {
        await selectSession(null)
      }

      await remove(sessionId)
    },
    [remove, selectSession, shellStateQuery.data?.activeSession]
  )

  return {
    ensureWorkspaceShellState,
    createSessionSummary,
    updateSessionSummary,
    removeSessionSummary,
    selectSession
  }
}
