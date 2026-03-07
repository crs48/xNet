/**
 * IPC handlers for coding-workspace sessions.
 */

import type {
  RefreshWorkspaceSessionInput,
  RemoveWorkspaceSessionInput,
  RemoveWorkspaceSessionResult,
  WorkspaceSessionDescriptor,
  WorkspaceSessionSnapshot,
  WorkspaceSessionStatusEvent,
  WORKSPACE_SESSION_IPC_CHANNELS,
  type CreateWorkspaceSessionInput,
  type SyncWorkspaceSessionsInput
} from '../shared/workspace-session'
import { access, constants } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import { createOpenCodeHostConfig } from '../shared/opencode-host'
import { createGitService } from './git-service'
import {
  createPreviewManager,
  previewRuntimeToWorkspaceState,
  type PreviewRuntimeStatus
} from './preview-manager'

const gitService = createGitService({
  repoRootOverride: process.env.XNET_WORKSPACE_REPO_ROOT ?? null
})
const previewManager = createPreviewManager()
const sessionRegistry = new Map<string, WorkspaceSessionDescriptor>()

let ipcRegistered = false
let previewEventsRegistered = false

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

const getOpenCodeUrl = (): string => createOpenCodeHostConfig(process.env).baseUrl

const publishWorkspaceSession = (session: WorkspaceSessionSnapshot): void => {
  const event: WorkspaceSessionStatusEvent = { session }
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(WORKSPACE_SESSION_IPC_CHANNELS.STATUS_CHANGE, event)
  })
}

async function buildSessionSnapshot(
  session: WorkspaceSessionDescriptor,
  previewStatus: PreviewRuntimeStatus
): Promise<WorkspaceSessionSnapshot> {
  const gitStatus = await gitService.getStatus(session.worktreePath)
  const screenshotPath = join(session.worktreePath, 'tmp', 'playwright', `${session.sessionId}.png`)
  const hasScreenshot = await fileExists(screenshotPath)

  return {
    sessionId: session.sessionId,
    title: session.title,
    branch: session.branch,
    worktreeName: session.worktreeName,
    worktreePath: session.worktreePath,
    openCodeUrl: getOpenCodeUrl(),
    ...(previewStatus.url && previewStatus.state === 'ready'
      ? { previewUrl: previewStatus.url }
      : {}),
    ...(hasScreenshot ? { lastScreenshotPath: screenshotPath } : {}),
    changedFilesCount: gitStatus.changedFilesCount,
    state: previewRuntimeToWorkspaceState(previewStatus),
    isDirty: gitStatus.isDirty
  }
}

async function refreshSessionSnapshot(
  session: WorkspaceSessionDescriptor
): Promise<WorkspaceSessionSnapshot> {
  const previewStatus = await previewManager.refreshSession(session)
  const snapshot = await buildSessionSnapshot(session, previewStatus)
  publishWorkspaceSession(snapshot)
  return snapshot
}

const registerPreviewEventForwarding = (): void => {
  if (previewEventsRegistered) {
    return
  }

  previewManager.onStatus((status) => {
    const descriptor = sessionRegistry.get(status.sessionId)
    if (!descriptor) {
      return
    }

    void buildSessionSnapshot(descriptor, status).then((snapshot) => {
      publishWorkspaceSession(snapshot)
    })
  })

  previewEventsRegistered = true
}

export function setupWorkspaceSessionIPC(): void {
  if (ipcRegistered) {
    return
  }

  registerPreviewEventForwarding()

  ipcMain.handle(
    WORKSPACE_SESSION_IPC_CHANNELS.CREATE,
    async (_event, input: CreateWorkspaceSessionInput): Promise<WorkspaceSessionSnapshot> => {
      const created = await gitService.createWorktree({
        sessionId: input.sessionId,
        title: input.title,
        branchSlug: input.branchSlug ?? undefined,
        baseRef: input.baseRef ?? undefined
      })

      const session: WorkspaceSessionDescriptor = {
        sessionId: input.sessionId,
        title: input.title,
        branch: created.branch,
        worktreeName: created.worktreeName,
        worktreePath: created.worktreePath
      }

      sessionRegistry.set(session.sessionId, session)
      const previewStatus = await previewManager.ensureSession(session)
      const snapshot = await buildSessionSnapshot(session, previewStatus)
      publishWorkspaceSession(snapshot)
      return snapshot
    }
  )

  ipcMain.handle(
    WORKSPACE_SESSION_IPC_CHANNELS.SYNC,
    async (_event, input: SyncWorkspaceSessionsInput): Promise<WorkspaceSessionSnapshot[]> => {
      input.sessions.forEach((session) => {
        sessionRegistry.set(session.sessionId, session)
      })

      const knownIds = new Set(input.sessions.map((session) => session.sessionId))
      ;[...sessionRegistry.keys()]
        .filter((sessionId) => !knownIds.has(sessionId))
        .forEach((sessionId) => {
          sessionRegistry.delete(sessionId)
        })

      await previewManager.syncSessions(input.sessions)

      return Promise.all(
        input.sessions.map(async (session) => {
          const previewStatus = previewManager.getStatus(session.sessionId)
          return buildSessionSnapshot(session, previewStatus)
        })
      )
    }
  )

  ipcMain.handle(
    WORKSPACE_SESSION_IPC_CHANNELS.REFRESH,
    async (_event, input: RefreshWorkspaceSessionInput): Promise<WorkspaceSessionSnapshot> => {
      const session: WorkspaceSessionDescriptor = {
        sessionId: input.sessionId,
        title: input.title,
        branch: input.branch,
        worktreeName: input.worktreeName,
        worktreePath: input.worktreePath
      }

      sessionRegistry.set(session.sessionId, session)
      return refreshSessionSnapshot(session)
    }
  )

  ipcMain.handle(
    WORKSPACE_SESSION_IPC_CHANNELS.RESTART_PREVIEW,
    async (_event, input: RefreshWorkspaceSessionInput): Promise<WorkspaceSessionSnapshot> => {
      const session: WorkspaceSessionDescriptor = {
        sessionId: input.sessionId,
        title: input.title,
        branch: input.branch,
        worktreeName: input.worktreeName,
        worktreePath: input.worktreePath
      }

      sessionRegistry.set(session.sessionId, session)
      const previewStatus = await previewManager.restartSession(session)
      const snapshot = await buildSessionSnapshot(session, previewStatus)
      publishWorkspaceSession(snapshot)
      return snapshot
    }
  )

  ipcMain.handle(
    WORKSPACE_SESSION_IPC_CHANNELS.REMOVE,
    async (_event, input: RemoveWorkspaceSessionInput): Promise<RemoveWorkspaceSessionResult> => {
      const gitStatus = await gitService.getStatus(input.worktreePath)
      if (gitStatus.isDirty) {
        return {
          removed: false,
          dirty: true,
          message: 'Worktree has uncommitted changes. Commit or revert them before removing it.'
        }
      }

      sessionRegistry.delete(input.sessionId)
      await previewManager.stopSession(input.sessionId)
      await gitService.removeWorktree(input.worktreePath)

      return {
        removed: true,
        dirty: false,
        message: 'Removed worktree and stopped the preview runtime.'
      }
    }
  )

  ipcRegistered = true
}

export async function stopWorkspaceSessions(): Promise<void> {
  await previewManager.stopAll()
  sessionRegistry.clear()
}
