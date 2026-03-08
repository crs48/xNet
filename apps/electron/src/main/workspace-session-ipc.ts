/**
 * IPC handlers for coding-workspace sessions.
 */

import type {
  CaptureWorkspaceSessionScreenshotInput,
  CaptureWorkspaceSessionScreenshotResult,
  CreateWorkspaceSessionInput,
  CreateWorkspaceSessionPullRequestInput,
  CreateWorkspaceSessionPullRequestResult,
  RefreshWorkspaceSessionInput,
  RemoveWorkspaceSessionInput,
  RemoveWorkspaceSessionResult,
  StoreSelectedContextInput,
  StoreSelectedContextResult,
  SyncWorkspaceSessionsInput,
  WorkspaceSessionDescriptor,
  WorkspaceSessionReview,
  WorkspaceSessionSnapshot,
  WorkspaceSessionStatusEvent
} from '../shared/workspace-session'
import { access, constants, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import { createOpenCodeHostConfig } from '../shared/opencode-host'
import {
  areWorkspaceSessionSnapshotsEqual,
  WORKSPACE_SESSION_IPC_CHANNELS
} from '../shared/workspace-session'
import { createGitService, isManagedWorktreePath, type GitFileChange } from './git-service'
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
const lastPublishedSnapshots = new Map<string, WorkspaceSessionSnapshot>()

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
const getScreenshotPath = (sessionId: string, worktreePath: string): string =>
  join(worktreePath, 'tmp', 'playwright', `${sessionId}.png`)
const getSelectedContextPath = (worktreePath: string): string =>
  join(worktreePath, '.xnet', 'selected-context.json')
const getPullRequestBodyPath = (sessionId: string, worktreePath: string): string =>
  join(worktreePath, '.xnet', 'pr', `${sessionId}.md`)

async function assertManagedWorktreePath(worktreePath: string): Promise<string> {
  const candidatePath = resolve(worktreePath.trim())
  const repoContext = await gitService.resolveRepoContext()

  if (!isManagedWorktreePath(repoContext.repoRoot, candidatePath)) {
    throw new Error(`Refusing to access unmanaged worktree path: ${candidatePath}`)
  }

  return candidatePath
}

async function normalizeSessionDescriptor(
  session: WorkspaceSessionDescriptor
): Promise<WorkspaceSessionDescriptor> {
  return {
    ...session,
    worktreePath: await assertManagedWorktreePath(session.worktreePath)
  }
}

const publishWorkspaceSession = (session: WorkspaceSessionSnapshot): void => {
  const previousSnapshot = lastPublishedSnapshots.get(session.sessionId)
  if (previousSnapshot && areWorkspaceSessionSnapshotsEqual(previousSnapshot, session)) {
    return
  }

  lastPublishedSnapshots.set(session.sessionId, session)
  const event: WorkspaceSessionStatusEvent = { session }
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(WORKSPACE_SESSION_IPC_CHANNELS.STATUS_CHANGE, event)
  })
}

async function buildSessionSnapshot(
  session: WorkspaceSessionDescriptor,
  previewStatus: PreviewRuntimeStatus
): Promise<WorkspaceSessionSnapshot> {
  const worktreePath = await assertManagedWorktreePath(session.worktreePath)
  const screenshotPath = getScreenshotPath(session.sessionId, worktreePath)
  const hasScreenshot = await fileExists(screenshotPath)

  try {
    const gitStatus = await gitService.getStatus(worktreePath)

    return {
      sessionId: session.sessionId,
      title: session.title,
      branch: session.branch,
      worktreeName: session.worktreeName,
      worktreePath,
      openCodeUrl: getOpenCodeUrl(),
      ...(previewStatus.url && previewStatus.state === 'ready'
        ? { previewUrl: previewStatus.url }
        : {}),
      ...(hasScreenshot ? { lastScreenshotPath: screenshotPath } : {}),
      changedFilesCount: gitStatus.changedFilesCount,
      state: previewRuntimeToWorkspaceState(previewStatus),
      isDirty: gitStatus.isDirty,
      ...(previewStatus.lastError ? { lastError: previewStatus.lastError } : {})
    }
  } catch (error) {
    return {
      sessionId: session.sessionId,
      title: session.title,
      branch: session.branch,
      worktreeName: session.worktreeName,
      worktreePath,
      openCodeUrl: getOpenCodeUrl(),
      ...(hasScreenshot ? { lastScreenshotPath: screenshotPath } : {}),
      changedFilesCount: 0,
      state: 'error',
      isDirty: false,
      lastError: error instanceof Error ? error.message : String(error)
    }
  }
}

function buildPullRequestDraft(
  session: WorkspaceSessionDescriptor,
  changedFiles: readonly GitFileChange[],
  diffStat: string,
  screenshotPath: string | null
): { title: string; body: string } {
  const bulletFiles = changedFiles.slice(0, 10).map((file) => `- ${file.path}`)

  return {
    title: `feat(workspace): update ${session.title.toLowerCase()}`,
    body: [
      '## Summary',
      '',
      `- update ${session.title}`,
      `- review worktree-backed shell changes on ${session.branch}`,
      '',
      '## Changed Files',
      '',
      ...(bulletFiles.length > 0 ? bulletFiles : ['- No changed files detected']),
      '',
      '## Diff Summary',
      '',
      diffStat || '_No diff summary available._',
      '',
      '## Screenshot',
      '',
      screenshotPath ? `- ${screenshotPath}` : '- No screenshot captured yet'
    ].join('\n')
  }
}

async function buildWorkspaceReview(
  session: WorkspaceSessionDescriptor
): Promise<WorkspaceSessionReview> {
  const worktreePath = await assertManagedWorktreePath(session.worktreePath)
  const changedFiles = await gitService.listChangedFiles(worktreePath)
  const diffStat = await gitService.getDiffStat(worktreePath)
  const diffPatch = await gitService.getDiffPatch(worktreePath)
  const screenshotPath = getScreenshotPath(session.sessionId, worktreePath)
  const hasScreenshot = await fileExists(screenshotPath)
  const markdownFile = changedFiles.find(
    (entry) => entry.path.endsWith('.md') || entry.path.endsWith('.mdx')
  )
  const markdownPreview = markdownFile
    ? await gitService
        .readRelativeFile(worktreePath, markdownFile.path)
        .then((content) => ({
          path: markdownFile.path,
          content
        }))
        .catch(() => null)
    : null
  const prDraft = buildPullRequestDraft(
    session,
    changedFiles,
    diffStat,
    hasScreenshot ? screenshotPath : null
  )

  return {
    sessionId: session.sessionId,
    changedFiles,
    diffStat,
    diffPatch,
    markdownPreview,
    prDraft: {
      ...prDraft,
      screenshotPath: hasScreenshot ? screenshotPath : null
    }
  }
}

async function refreshSessionSnapshot(
  session: WorkspaceSessionDescriptor
): Promise<WorkspaceSessionSnapshot> {
  const normalizedSession = await normalizeSessionDescriptor(session)
  const previewStatus = await previewManager.refreshSession(normalizedSession)
  const snapshot = await buildSessionSnapshot(normalizedSession, previewStatus)
  publishWorkspaceSession(snapshot)
  return snapshot
}

async function storeSelectedContext(
  input: StoreSelectedContextInput
): Promise<StoreSelectedContextResult> {
  const worktreePath = await assertManagedWorktreePath(input.worktreePath)
  const outputPath = getSelectedContextPath(worktreePath)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(input.context, null, 2), 'utf8')
  return { path: outputPath }
}

async function captureWorkspaceSessionScreenshot(
  browserWindow: BrowserWindow | null,
  input: CaptureWorkspaceSessionScreenshotInput
): Promise<CaptureWorkspaceSessionScreenshotResult> {
  if (!browserWindow) {
    throw new Error('Unable to capture screenshot without an active window')
  }

  const image = await browserWindow.webContents.capturePage()
  const worktreePath = await assertManagedWorktreePath(input.worktreePath)
  const outputPath = getScreenshotPath(input.sessionId, worktreePath)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, image.toPNG())
  return { path: outputPath }
}

async function createWorkspaceSessionPullRequest(
  input: CreateWorkspaceSessionPullRequestInput
): Promise<CreateWorkspaceSessionPullRequestResult> {
  const worktreePath = await assertManagedWorktreePath(input.worktreePath)
  const bodyFilePath = getPullRequestBodyPath(input.sessionId, worktreePath)
  await mkdir(dirname(bodyFilePath), { recursive: true })
  await writeFile(bodyFilePath, input.body, 'utf8')

  try {
    const output = await gitService.createPullRequest(worktreePath, [
      '--title',
      input.title,
      '--body-file',
      bodyFilePath
    ])
    const urlMatch = output.match(/https:\/\/\S+/)

    return {
      created: true,
      url: urlMatch ? urlMatch[0] : null,
      bodyFilePath,
      error: null
    }
  } catch (error) {
    return {
      created: false,
      url: null,
      bodyFilePath,
      error: error instanceof Error ? error.message : String(error)
    }
  }
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
      const sessions = await Promise.all(
        input.sessions.map((session) => normalizeSessionDescriptor(session))
      )

      sessions.forEach((session) => {
        sessionRegistry.set(session.sessionId, session)
      })

      const knownIds = new Set(sessions.map((session) => session.sessionId))
      ;[...sessionRegistry.keys()]
        .filter((sessionId) => !knownIds.has(sessionId))
        .forEach((sessionId) => {
          sessionRegistry.delete(sessionId)
        })

      await previewManager.syncSessions(sessions)

      return Promise.all(
        sessions.map(async (session) => {
          const previewStatus = previewManager.getStatus(session.sessionId)
          return buildSessionSnapshot(session, previewStatus)
        })
      )
    }
  )

  ipcMain.handle(
    WORKSPACE_SESSION_IPC_CHANNELS.REFRESH,
    async (_event, input: RefreshWorkspaceSessionInput): Promise<WorkspaceSessionSnapshot> => {
      const session = await normalizeSessionDescriptor({
        sessionId: input.sessionId,
        title: input.title,
        branch: input.branch,
        worktreeName: input.worktreeName,
        worktreePath: input.worktreePath
      })

      sessionRegistry.set(session.sessionId, session)
      return refreshSessionSnapshot(session)
    }
  )

  ipcMain.handle(
    WORKSPACE_SESSION_IPC_CHANNELS.RESTART_PREVIEW,
    async (_event, input: RefreshWorkspaceSessionInput): Promise<WorkspaceSessionSnapshot> => {
      const session = await normalizeSessionDescriptor({
        sessionId: input.sessionId,
        title: input.title,
        branch: input.branch,
        worktreeName: input.worktreeName,
        worktreePath: input.worktreePath
      })

      sessionRegistry.set(session.sessionId, session)
      const previewStatus = await previewManager.restartSession(session)
      const snapshot = await buildSessionSnapshot(session, previewStatus)
      publishWorkspaceSession(snapshot)
      return snapshot
    }
  )

  ipcMain.handle(
    WORKSPACE_SESSION_IPC_CHANNELS.REVIEW,
    async (_event, input: RefreshWorkspaceSessionInput): Promise<WorkspaceSessionReview> => {
      const session = await normalizeSessionDescriptor({
        sessionId: input.sessionId,
        title: input.title,
        branch: input.branch,
        worktreeName: input.worktreeName,
        worktreePath: input.worktreePath
      })

      sessionRegistry.set(session.sessionId, session)
      return buildWorkspaceReview(session)
    }
  )

  ipcMain.handle(
    WORKSPACE_SESSION_IPC_CHANNELS.STORE_SELECTED_CONTEXT,
    async (_event, input: StoreSelectedContextInput): Promise<StoreSelectedContextResult> => {
      return storeSelectedContext(input)
    }
  )

  ipcMain.handle(
    WORKSPACE_SESSION_IPC_CHANNELS.CAPTURE_SCREENSHOT,
    async (
      event,
      input: CaptureWorkspaceSessionScreenshotInput
    ): Promise<CaptureWorkspaceSessionScreenshotResult> => {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      const result = await captureWorkspaceSessionScreenshot(browserWindow, input)
      const descriptor = sessionRegistry.get(input.sessionId)
      if (descriptor) {
        const snapshot = await buildSessionSnapshot(
          descriptor,
          previewManager.getStatus(input.sessionId)
        )
        publishWorkspaceSession(snapshot)
      }
      return result
    }
  )

  ipcMain.handle(
    WORKSPACE_SESSION_IPC_CHANNELS.CREATE_PULL_REQUEST,
    async (
      _event,
      input: CreateWorkspaceSessionPullRequestInput
    ): Promise<CreateWorkspaceSessionPullRequestResult> => {
      return createWorkspaceSessionPullRequest(input)
    }
  )

  ipcMain.handle(
    WORKSPACE_SESSION_IPC_CHANNELS.REMOVE,
    async (_event, input: RemoveWorkspaceSessionInput): Promise<RemoveWorkspaceSessionResult> => {
      try {
        const worktreePath = await assertManagedWorktreePath(input.worktreePath)
        const gitStatus = await gitService.getStatus(worktreePath)
        if (gitStatus.isDirty) {
          return {
            removed: false,
            dirty: true,
            message:
              'Worktree has uncommitted changes. Review the diff, commit, or revert before removing it.'
          }
        }

        sessionRegistry.delete(input.sessionId)
        lastPublishedSnapshots.delete(input.sessionId)
        await previewManager.stopSession(input.sessionId)
        await gitService.removeWorktree(worktreePath)

        return {
          removed: true,
          dirty: false,
          message: 'Removed worktree and stopped the preview runtime.'
        }
      } catch (error) {
        return {
          removed: false,
          dirty: false,
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  ipcRegistered = true
}

export async function stopWorkspaceSessions(): Promise<void> {
  await previewManager.stopAll()
  sessionRegistry.clear()
  lastPublishedSnapshots.clear()
}
