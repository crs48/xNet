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
import { useTelemetry } from '@xnetjs/telemetry'
import { useCallback, useEffect, useRef } from 'react'
import {
  clearWorkspacePerformanceMarks,
  clearWorkspacePreviewRestoreMark,
  markWorkspacePreviewRestore,
  markWorkspaceSessionSelection
} from '../performance'
import { SessionSummarySchema, WorkspaceShellStateSchema } from '../schemas'
import {
  createSessionSummaryInputFromWorkspaceSnapshot,
  createSessionSummaryPatchFromWorkspaceSnapshot,
  createSessionSummaryInput,
  createSessionSummaryPatch,
  createWorkspaceShellStateInput,
  matchesWorkspaceSessionSnapshot,
  SESSION_SUMMARY_QUERY,
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

function isMissingNodeError(error: unknown, nodeId: string): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return error.message.includes(`Node not found: ${nodeId}`)
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
  const sessionSummaryQuery = useQuery(SessionSummarySchema, SESSION_SUMMARY_QUERY)
  const telemetry = useTelemetry({ component: 'electron.workspace.commands' })
  const createRef = useRef(create)
  const updateRef = useRef(update)
  const removeRef = useRef(remove)
  const shellStateRef = useRef(shellStateQuery.data)
  const sessionSummariesRef = useRef(sessionSummaryQuery.data)

  useEffect(() => {
    createRef.current = create
  }, [create])

  useEffect(() => {
    updateRef.current = update
  }, [update])

  useEffect(() => {
    removeRef.current = remove
  }, [remove])

  useEffect(() => {
    shellStateRef.current = shellStateQuery.data
  }, [shellStateQuery.data])

  useEffect(() => {
    sessionSummariesRef.current = sessionSummaryQuery.data
  }, [sessionSummaryQuery.data])

  const measureCommand = useCallback(
    async <T>(
      metricName: string,
      task: () => Promise<T>,
      context: Record<string, unknown> = {}
    ): Promise<T> => {
      const start = performance.now()

      try {
        const result = await task()
        telemetry.reportPerformance(metricName, performance.now() - start, 'electron.workspace')
        telemetry.reportUsage(`${metricName}.success`, 1)
        return result
      } catch (error) {
        telemetry.reportUsage(`${metricName}.failure`, 1)
        telemetry.reportCrash(error instanceof Error ? error : new Error(String(error)), {
          codeNamespace: 'electron.workspace',
          codeFunction: metricName,
          ...context
        })
        throw error
      }
    },
    [telemetry]
  )

  const ensureWorkspaceShellState =
    useCallback(async (): Promise<WorkspaceShellStateNode | null> => {
      const existingShellState = shellStateRef.current
      if (existingShellState) {
        return existingShellState
      }

      if (pendingShellStateCreation) {
        return pendingShellStateCreation
      }

      pendingShellStateCreation = createRef
        .current(
          WorkspaceShellStateSchema,
          createWorkspaceShellStateInput(),
          WORKSPACE_SHELL_STATE_NODE_ID
        )
        .finally(() => {
          pendingShellStateCreation = null
        })

      return pendingShellStateCreation
    }, [])

  const selectSession = useCallback(
    async (sessionId: string | null): Promise<WorkspaceShellStateNode | null> => {
      const shellState = await ensureWorkspaceShellState()
      if (!shellState) {
        return null
      }

      if (sessionId) {
        markWorkspaceSessionSelection(sessionId)
      } else {
        clearWorkspacePerformanceMarks()
      }

      try {
        return await measureCommand(
          'workspace.session.select',
          async () =>
            updateRef.current(WorkspaceShellStateSchema, shellState.id, {
              activeSession: sessionId ?? undefined
            }),
          {
            sessionId: sessionId ?? 'none'
          }
        )
      } catch (error) {
        clearWorkspacePerformanceMarks()
        throw error
      }
    },
    [ensureWorkspaceShellState, measureCommand, update]
  )

  const createSessionSummary = useCallback(
    async (
      input: SessionSummaryInput,
      options: CreateSessionOptions = {}
    ): Promise<SessionSummaryNode | null> => {
      const session = await createRef.current(
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
    [selectSession]
  )

  const updateSessionSummary = useCallback(
    async (
      sessionId: string,
      patch: Partial<SessionSummaryInput>
    ): Promise<SessionSummaryNode | null> => {
      return measureCommand(
        'workspace.session.summary.update',
        async () =>
          updateRef.current(SessionSummarySchema, sessionId, createSessionSummaryPatch(patch)),
        { sessionId }
      )
    },
    [measureCommand]
  )

  const applyWorkspaceSessionSnapshot = useCallback(
    async (snapshot: WorkspaceSessionSnapshot): Promise<SessionSummaryNode | null> => {
      const existingSession =
        sessionSummariesRef.current.find((session) => session.id === snapshot.sessionId) ?? null
      if (existingSession && matchesWorkspaceSessionSnapshot(existingSession, snapshot)) {
        return existingSession
      }

      try {
        return await updateSessionSummary(
          snapshot.sessionId,
          createSessionSummaryPatchFromWorkspaceSnapshot(snapshot)
        )
      } catch (error) {
        if (!isMissingNodeError(error, snapshot.sessionId)) {
          throw error
        }

        return createSessionSummary(createSessionSummaryInputFromWorkspaceSnapshot(snapshot), {
          id: snapshot.sessionId,
          select: false
        })
      }
    },
    [createSessionSummary, updateSessionSummary]
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
      const snapshot = await measureCommand(
        'workspace.session.create',
        async () => window.xnetWorkspaceSessions.create(request),
        {
          sessionId,
          title: options.title
        }
      )

      const session = await applyWorkspaceSessionSnapshot(snapshot)

      if ((createOptions.select ?? true) && session) {
        await selectSession(session.id)
      }

      return session
    },
    [applyWorkspaceSessionSnapshot, measureCommand, selectSession]
  )

  const syncWorkspaceSessions = useCallback(
    async (
      summaries: readonly SessionSummaryNode[],
      activeSessionId: string | null
    ): Promise<WorkspaceSessionSnapshot[]> => {
      const input = toWorkspaceSyncInput(summaries, activeSessionId)
      const snapshots = await measureCommand(
        'workspace.session.sync',
        async () => window.xnetWorkspaceSessions.sync(input),
        {
          activeSessionId: activeSessionId ?? 'none',
          sessionCount: summaries.length
        }
      )

      await Promise.all(snapshots.map((snapshot) => applyWorkspaceSessionSnapshot(snapshot)))

      return snapshots
    },
    [applyWorkspaceSessionSnapshot, measureCommand]
  )

  const refreshWorkspaceSession = useCallback(
    async (session: SessionSummaryNode): Promise<SessionSummaryNode | null> => {
      markWorkspacePreviewRestore(session.id)

      try {
        const snapshot = await measureCommand(
          'workspace.session.refresh',
          async () => window.xnetWorkspaceSessions.refresh(toWorkspaceRefreshInput(session)),
          {
            sessionId: session.id,
            branch: session.branch ?? 'unknown'
          }
        )
        return applyWorkspaceSessionSnapshot(snapshot)
      } catch (error) {
        clearWorkspacePreviewRestoreMark()
        throw error
      }
    },
    [applyWorkspaceSessionSnapshot, measureCommand]
  )

  const restartWorkspacePreview = useCallback(
    async (session: SessionSummaryNode): Promise<SessionSummaryNode | null> => {
      markWorkspacePreviewRestore(session.id)

      try {
        const snapshot = await measureCommand(
          'workspace.preview.restart',
          async () => window.xnetWorkspaceSessions.restartPreview(toWorkspaceRefreshInput(session)),
          {
            sessionId: session.id,
            branch: session.branch ?? 'unknown'
          }
        )
        return applyWorkspaceSessionSnapshot(snapshot)
      } catch (error) {
        clearWorkspacePreviewRestoreMark()
        throw error
      }
    },
    [applyWorkspaceSessionSnapshot, measureCommand]
  )

  const removeSessionSummary = useCallback(
    async (sessionId: string): Promise<void> => {
      if (shellStateRef.current?.activeSession === sessionId) {
        await selectSession(null)
      }

      await removeRef.current(sessionId)
    },
    [selectSession]
  )

  const removeWorkspaceSession = useCallback(
    async (session: SessionSummaryNode): Promise<RemoveWorkspaceSessionResult> => {
      const result = await measureCommand(
        'workspace.session.remove',
        async () =>
          window.xnetWorkspaceSessions.remove({
            sessionId: session.id,
            worktreePath: session.worktreePath ?? ''
          }),
        { sessionId: session.id }
      )

      if (result.removed) {
        await removeSessionSummary(session.id)
      }

      return result
    },
    [measureCommand, removeSessionSummary]
  )

  const reviewWorkspaceSession = useCallback(
    async (session: SessionSummaryNode): Promise<WorkspaceSessionReview> => {
      return measureCommand(
        'workspace.review.request',
        async () => window.xnetWorkspaceSessions.review(toWorkspaceRefreshInput(session)),
        { sessionId: session.id }
      )
    },
    [measureCommand]
  )

  const storeWorkspaceSelectedContext = useCallback(
    async (
      session: SessionSummaryNode,
      context: SelectedContext
    ): Promise<StoreSelectedContextResult> => {
      return measureCommand(
        'workspace.context.store',
        async () =>
          window.xnetWorkspaceSessions.storeSelectedContext({
            worktreePath: session.worktreePath ?? '',
            context
          }),
        { sessionId: session.id, targetId: context.targetId ?? 'unknown' }
      )
    },
    [measureCommand]
  )

  const captureWorkspaceScreenshot = useCallback(
    async (session: SessionSummaryNode): Promise<CaptureWorkspaceSessionScreenshotResult> => {
      const result = await measureCommand(
        'workspace.screenshot.capture',
        async () =>
          window.xnetWorkspaceSessions.captureScreenshot({
            sessionId: session.id,
            worktreePath: session.worktreePath ?? ''
          }),
        { sessionId: session.id }
      )
      await refreshWorkspaceSession(session)
      return result
    },
    [measureCommand, refreshWorkspaceSession]
  )

  const createWorkspacePullRequest = useCallback(
    async (
      session: SessionSummaryNode,
      draft: { title: string; body: string }
    ): Promise<CreateWorkspaceSessionPullRequestResult> => {
      return measureCommand(
        'workspace.pr.create',
        async () =>
          window.xnetWorkspaceSessions.createPullRequest({
            sessionId: session.id,
            worktreePath: session.worktreePath ?? '',
            title: draft.title,
            body: draft.body
          }),
        { sessionId: session.id }
      )
    },
    [measureCommand]
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
