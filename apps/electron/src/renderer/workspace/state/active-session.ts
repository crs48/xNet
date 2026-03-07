/**
 * Shared state helpers for workspace session selection.
 */

import type { WorkspaceSessionSnapshot } from '../../../shared/workspace-session'
import type { InferCreateProps } from '@xnetjs/data'
import type { FlatNode } from '@xnetjs/react'
import { SessionSummarySchema, WorkspaceShellStateSchema } from '../schemas'

export const WORKSPACE_SHELL_STATE_NODE_ID = 'xnet:electron:workspace-shell-state'

export const SESSION_SUMMARY_QUERY = Object.freeze({
  limit: 200,
  orderBy: { updatedAt: 'desc' as const }
})

export type SessionSummaryNode = FlatNode<(typeof SessionSummarySchema)['_properties']>
export type WorkspaceShellStateNode = FlatNode<(typeof WorkspaceShellStateSchema)['_properties']>
export type SessionSummaryState = SessionSummaryNode['state']

export type SessionSummaryInput = {
  title: string
  branch: string
  worktreeName?: string
  worktreePath: string
  openCodeUrl: string
  previewUrl?: string | null
  lastMessagePreview?: string | null
  lastScreenshotPath?: string | null
  changedFilesCount?: number
  state?: SessionSummaryState
  modelId?: string | null
}

export function createWorkspaceShellStateInput(
  activeSessionId: string | null = null
): InferCreateProps<(typeof WorkspaceShellStateSchema)['_properties']> {
  return activeSessionId ? { activeSession: activeSessionId } : {}
}

export function createSessionSummaryInput(
  input: SessionSummaryInput
): InferCreateProps<(typeof SessionSummarySchema)['_properties']> {
  return {
    title: input.title.trim(),
    branch: input.branch.trim(),
    worktreeName: (input.worktreeName ?? input.title).trim(),
    worktreePath: input.worktreePath.trim(),
    openCodeUrl: input.openCodeUrl.trim(),
    previewUrl: input.previewUrl?.trim() || undefined,
    lastMessagePreview: input.lastMessagePreview?.trim() || undefined,
    lastScreenshotPath: input.lastScreenshotPath?.trim() || undefined,
    changedFilesCount: Math.max(0, Math.trunc(input.changedFilesCount ?? 0)),
    state: input.state ?? 'idle',
    modelId: input.modelId?.trim() || undefined
  }
}

export function createSessionSummaryPatch(
  patch: Partial<SessionSummaryInput>
): Partial<InferCreateProps<(typeof SessionSummarySchema)['_properties']>> {
  const next: Partial<InferCreateProps<(typeof SessionSummarySchema)['_properties']>> = {}

  if (patch.title !== undefined) {
    next.title = patch.title.trim()
  }

  if (patch.branch !== undefined) {
    next.branch = patch.branch.trim()
  }

  if (patch.worktreeName !== undefined) {
    next.worktreeName = patch.worktreeName.trim()
  }

  if (patch.worktreePath !== undefined) {
    next.worktreePath = patch.worktreePath.trim()
  }

  if (patch.openCodeUrl !== undefined) {
    next.openCodeUrl = patch.openCodeUrl.trim()
  }

  if (patch.previewUrl !== undefined) {
    next.previewUrl = patch.previewUrl?.trim() || undefined
  }

  if (patch.lastMessagePreview !== undefined) {
    next.lastMessagePreview = patch.lastMessagePreview?.trim() || undefined
  }

  if (patch.lastScreenshotPath !== undefined) {
    next.lastScreenshotPath = patch.lastScreenshotPath?.trim() || undefined
  }

  if (patch.changedFilesCount !== undefined) {
    next.changedFilesCount = Math.max(0, Math.trunc(patch.changedFilesCount))
  }

  if (patch.state !== undefined) {
    next.state = patch.state
  }

  if (patch.modelId !== undefined) {
    next.modelId = patch.modelId?.trim() || undefined
  }

  return next
}

export function createSessionSummaryInputFromWorkspaceSnapshot(
  snapshot: WorkspaceSessionSnapshot
): SessionSummaryInput {
  return {
    title: snapshot.title,
    branch: snapshot.branch,
    worktreeName: snapshot.worktreeName,
    worktreePath: snapshot.worktreePath,
    openCodeUrl: snapshot.openCodeUrl,
    previewUrl: snapshot.previewUrl,
    lastScreenshotPath: snapshot.lastScreenshotPath,
    changedFilesCount: snapshot.changedFilesCount,
    state: snapshot.state
  }
}

export function createSessionSummaryPatchFromWorkspaceSnapshot(
  snapshot: WorkspaceSessionSnapshot
): Partial<SessionSummaryInput> {
  return {
    title: snapshot.title,
    branch: snapshot.branch,
    worktreeName: snapshot.worktreeName,
    worktreePath: snapshot.worktreePath,
    openCodeUrl: snapshot.openCodeUrl,
    previewUrl: snapshot.previewUrl,
    lastScreenshotPath: snapshot.lastScreenshotPath,
    changedFilesCount: snapshot.changedFilesCount,
    state: snapshot.state
  }
}

export function getSessionActivityAt(session: SessionSummaryNode): number {
  return session.updatedAt || session.createdAt || 0
}

export function orderSessionSummaries<T extends SessionSummaryNode>(
  sessions: readonly T[],
  activeSessionId: string | null
): T[] {
  return [...sessions].sort((left, right) => {
    const leftActive = left.id === activeSessionId
    const rightActive = right.id === activeSessionId

    if (leftActive !== rightActive) {
      return leftActive ? -1 : 1
    }

    const activityDelta = getSessionActivityAt(right) - getSessionActivityAt(left)
    if (activityDelta !== 0) {
      return activityDelta
    }

    return (left.title ?? '').localeCompare(right.title ?? '')
  })
}
