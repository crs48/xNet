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
  STATUS_CHANGE: 'xnet:workspace-session:status-change'
} as const

export type WorkspaceSessionState = 'idle' | 'running' | 'previewing' | 'error'

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
