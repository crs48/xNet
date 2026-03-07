/**
 * Mutations for workspace session summaries and active-session state.
 */

import type {
  CaptureWorkspaceSessionScreenshotResult,
  CreateWorkspaceSessionInput,
  CreateWorkspaceSessionPullRequestResult,
  RefreshWorkspaceSessionInput,
  RemoveWorkspaceSessionResult,
  SelectedContext,
  StoreSelectedContextResult,
  SyncWorkspaceSessionsInput,
  WorkspaceSessionReview,
  WorkspaceSessionSnapshot
} from '../../../shared/workspace-session'
import type {
  SessionSummaryNode,
  WorkspaceShellStateNode,
  SessionSummaryInput
} from '../state/active-session'
import { useMutate, useQuery } from '@xnetjs/react'
import { useCallback } from 'react'
import { SessionSummarySchema, WorkspaceShellStateSchema } from '../schemas'
import {
  createSessionSummaryInputFromWorkspaceSnapshot,
  createSessionSummaryPatchFromWorkspaceSnapshot,
  createSessionSummaryInput,
  createSessionSummaryPatch,
  createWorkspaceShellStateInput,
  WORKSPACE_SHELL_STATE_NODE_ID
} from '../state/active-session'

type CreateSessionOptions = {
  id?: string
  select?: boolean
}

type CreateWorkspaceSessionOptions = {
  title: string
  branchSlug?: string | null
  baseRef?: string | null
}

let pendingShellStateCreation: Promise<WorkspaceShellStateNode | null> | null = null

function createRendererSessionId(): string {
  return `xnet:workspace-session:${crypto.randomUUID()}`
}

function toWorkspaceRefreshInput(session: SessionSummaryNode): RefreshWorkspaceSessionInput {
  return {
    sessionId: session.id,
    title: session.title ?? 'Untitled session',
    branch: session.branch ?? 'unknown',
    worktreeName: session.worktreeName ?? session.title ?? 'workspace-session',
    worktreePath: session.worktreePath ?? ''
  }
}

function toWorkspaceSyncInput(
  summaries: readonly SessionSummaryNode[],
  activeSessionId: string | null
): SyncWorkspaceSessionsInput {
  return {
    activeSessionId,
    sessions: summaries.map((session) => ({
      sessionId: session.id,
      title: session.title ?? 'Untitled session',
      branch: session.branch ?? 'unknown',
      worktreeName: session.worktreeName ?? session.title ?? 'workspace-session',
      worktreePath: session.worktreePath ?? ''
    }))
  }
}

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

  const applyWorkspaceSessionSnapshot = useCallback(
    async (snapshot: WorkspaceSessionSnapshot): Promise<SessionSummaryNode | null> => {
      return updateSessionSummary(
        snapshot.sessionId,
        createSessionSummaryPatchFromWorkspaceSnapshot(snapshot)
      )
    },
    [updateSessionSummary]
  )

  const createWorkspaceSession = useCallback(
    async (
      options: CreateWorkspaceSessionOptions,
      createOptions: CreateSessionOptions = {}
    ): Promise<SessionSummaryNode | null> => {
      const sessionId = createOptions.id ?? createRendererSessionId()
      const request: CreateWorkspaceSessionInput = {
        sessionId,
        title: options.title,
        branchSlug: options.branchSlug ?? undefined,
        baseRef: options.baseRef ?? undefined
      }
      const snapshot = await window.xnetWorkspaceSessions.create(request)

      return createSessionSummary(createSessionSummaryInputFromWorkspaceSnapshot(snapshot), {
        id: sessionId,
        select: createOptions.select
      })
    },
    [createSessionSummary]
  )

  const syncWorkspaceSessions = useCallback(
    async (
      summaries: readonly SessionSummaryNode[],
      activeSessionId: string | null
    ): Promise<WorkspaceSessionSnapshot[]> => {
      const input = toWorkspaceSyncInput(summaries, activeSessionId)
      const snapshots = await window.xnetWorkspaceSessions.sync(input)

      await Promise.all(
        snapshots.map((snapshot) =>
          updateSessionSummary(
            snapshot.sessionId,
            createSessionSummaryPatchFromWorkspaceSnapshot(snapshot)
          )
        )
      )

      return snapshots
    },
    [updateSessionSummary]
  )

  const refreshWorkspaceSession = useCallback(
    async (session: SessionSummaryNode): Promise<SessionSummaryNode | null> => {
      const snapshot = await window.xnetWorkspaceSessions.refresh(toWorkspaceRefreshInput(session))
      return applyWorkspaceSessionSnapshot(snapshot)
    },
    [applyWorkspaceSessionSnapshot]
  )

  const restartWorkspacePreview = useCallback(
    async (session: SessionSummaryNode): Promise<SessionSummaryNode | null> => {
      const snapshot = await window.xnetWorkspaceSessions.restartPreview(
        toWorkspaceRefreshInput(session)
      )
      return applyWorkspaceSessionSnapshot(snapshot)
    },
    [applyWorkspaceSessionSnapshot]
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

  const removeWorkspaceSession = useCallback(
    async (session: SessionSummaryNode): Promise<RemoveWorkspaceSessionResult> => {
      const result = await window.xnetWorkspaceSessions.remove({
        sessionId: session.id,
        worktreePath: session.worktreePath ?? ''
      })

      if (result.removed) {
        await removeSessionSummary(session.id)
      }

      return result
    },
    [removeSessionSummary]
  )

  const reviewWorkspaceSession = useCallback(
    async (session: SessionSummaryNode): Promise<WorkspaceSessionReview> => {
      return window.xnetWorkspaceSessions.review(toWorkspaceRefreshInput(session))
    },
    []
  )

  const storeWorkspaceSelectedContext = useCallback(
    async (
      session: SessionSummaryNode,
      context: SelectedContext
    ): Promise<StoreSelectedContextResult> => {
      return window.xnetWorkspaceSessions.storeSelectedContext({
        worktreePath: session.worktreePath ?? '',
        context
      })
    },
    []
  )

  const captureWorkspaceScreenshot = useCallback(
    async (session: SessionSummaryNode): Promise<CaptureWorkspaceSessionScreenshotResult> => {
      const result = await window.xnetWorkspaceSessions.captureScreenshot({
        sessionId: session.id,
        worktreePath: session.worktreePath ?? ''
      })
      await refreshWorkspaceSession(session)
      return result
    },
    [refreshWorkspaceSession]
  )

  const createWorkspacePullRequest = useCallback(
    async (
      session: SessionSummaryNode,
      draft: { title: string; body: string }
    ): Promise<CreateWorkspaceSessionPullRequestResult> => {
      return window.xnetWorkspaceSessions.createPullRequest({
        sessionId: session.id,
        worktreePath: session.worktreePath ?? '',
        title: draft.title,
        body: draft.body
      })
    },
    []
  )

  return {
    ensureWorkspaceShellState,
    createSessionSummary,
    createWorkspaceSession,
    updateSessionSummary,
    applyWorkspaceSessionSnapshot,
    syncWorkspaceSessions,
    refreshWorkspaceSession,
    restartWorkspacePreview,
    removeSessionSummary,
    removeWorkspaceSession,
    reviewWorkspaceSession,
    storeWorkspaceSelectedContext,
    captureWorkspaceScreenshot,
    createWorkspacePullRequest,
    selectSession
  }
}
