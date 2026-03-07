/**
 * Shared workspace-session IPC contracts and helpers.
 */

export const WORKSPACE_SESSION_BRANCH_PREFIX = 'codex/' as const

export const WORKSPACE_SESSION_IPC_CHANNELS = {
  CREATE: 'xnet:workspace-session:create',
  SYNC: 'xnet:workspace-session:sync',
  REMOVE: 'xnet:workspace-session:remove',
  REFRESH: 'xnet:workspace-session:refresh',
  RESTART_PREVIEW: 'xnet:workspace-session:restart-preview',
  REVIEW: 'xnet:workspace-session:review',
  STORE_SELECTED_CONTEXT: 'xnet:workspace-session:store-selected-context',
  CAPTURE_SCREENSHOT: 'xnet:workspace-session:capture-screenshot',
  CREATE_PULL_REQUEST: 'xnet:workspace-session:create-pull-request',
  STATUS_CHANGE: 'xnet:workspace-session:status-change'
} as const

export type WorkspaceSessionState = 'idle' | 'running' | 'previewing' | 'error'
export const PREVIEW_SELECTED_CONTEXT_MESSAGE_TYPE = 'xnet:preview:selected-context' as const

export type WorkspaceSessionDescriptor = {
  sessionId: string
  title: string
  branch: string
  worktreeName: string
  worktreePath: string
}

export type CreateWorkspaceSessionInput = {
  sessionId: string
  title: string
  branchSlug?: string | null
  baseRef?: string | null
}

export type SyncWorkspaceSessionsInput = {
  sessions: WorkspaceSessionDescriptor[]
  activeSessionId: string | null
}

export type RefreshWorkspaceSessionInput = {
  sessionId: string
  title: string
  branch: string
  worktreeName: string
  worktreePath: string
}

export type RemoveWorkspaceSessionInput = {
  sessionId: string
  worktreePath: string
}

export type RemoveWorkspaceSessionResult = {
  removed: boolean
  dirty: boolean
  message: string
}

export type WorkspaceFileChange = {
  path: string
  status: string
}

export type WorkspaceSessionSnapshot = {
  sessionId: string
  title: string
  branch: string
  worktreeName: string
  worktreePath: string
  openCodeUrl: string
  previewUrl?: string
  lastScreenshotPath?: string
  changedFilesCount: number
  state: WorkspaceSessionState
  isDirty: boolean
}

export type WorkspaceSessionStatusEvent = {
  session: WorkspaceSessionSnapshot
}

export type WorkspaceSessionReview = {
  sessionId: string
  changedFiles: WorkspaceFileChange[]
  diffStat: string
  diffPatch: string
  markdownPreview: {
    path: string
    content: string
  } | null
  prDraft: {
    title: string
    body: string
    screenshotPath: string | null
  }
}

export type SelectedContextBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type SelectedContext = {
  sessionId: string
  routeId: string | null
  targetId: string | null
  targetLabel: string | null
  fileHint: string | null
  documentId: string | null
  bounds: SelectedContextBounds | null
  nearbyText: string | null
  screenshotPath: string | null
  capturedAt: number
}

export type PreviewSelectedContextMessage = {
  type: typeof PREVIEW_SELECTED_CONTEXT_MESSAGE_TYPE
  routeId: string | null
  targetId: string | null
  targetLabel: string | null
  fileHint: string | null
  documentId: string | null
  bounds: SelectedContextBounds | null
  nearbyText: string | null
}

export type StoreSelectedContextInput = {
  worktreePath: string
  context: SelectedContext
}

export type StoreSelectedContextResult = {
  path: string
}

export type CaptureWorkspaceSessionScreenshotInput = {
  sessionId: string
  worktreePath: string
}

export type CaptureWorkspaceSessionScreenshotResult = {
  path: string
}

export type CreateWorkspaceSessionPullRequestInput = {
  sessionId: string
  worktreePath: string
  title: string
  body: string
}

export type CreateWorkspaceSessionPullRequestResult = {
  created: boolean
  url: string | null
  bodyFilePath: string
  error: string | null
}

export function sanitizeWorkspaceBranchSegment(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .split('')
    .filter((char) => char.charCodeAt(0) <= 0x7f)
    .join('')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '')
    .replace(/-{2,}/g, '-')

  return normalized || 'workspace-session'
}

export function normalizeWorkspaceBranchSlug(value: string): string {
  const trimmed = value.trim()
  const withoutPrefix = trimmed.startsWith(WORKSPACE_SESSION_BRANCH_PREFIX)
    ? trimmed.slice(WORKSPACE_SESSION_BRANCH_PREFIX.length)
    : trimmed

  return `${WORKSPACE_SESSION_BRANCH_PREFIX}${sanitizeWorkspaceBranchSegment(withoutPrefix)}`
}
