/**
 * Lightweight renderer-side timing marks for the coding workspace shell.
 */

type PendingTiming = {
  sessionId: string
  startedAt: number
}

let pendingSessionSelection: PendingTiming | null = null
let pendingPreviewRestore: PendingTiming | null = null

export function markWorkspaceSessionSelection(
  sessionId: string,
  now: number = performance.now()
): void {
  pendingSessionSelection = {
    sessionId,
    startedAt: now
  }
  pendingPreviewRestore = {
    sessionId,
    startedAt: now
  }
}

export function markWorkspacePreviewRestore(
  sessionId: string,
  now: number = performance.now()
): void {
  pendingPreviewRestore = {
    sessionId,
    startedAt: now
  }
}

export function clearWorkspaceSessionSelectionMark(): void {
  pendingSessionSelection = null
}

export function clearWorkspacePreviewRestoreMark(): void {
  pendingPreviewRestore = null
}

export function clearWorkspacePerformanceMarks(): void {
  clearWorkspaceSessionSelectionMark()
  clearWorkspacePreviewRestoreMark()
}

export function consumeWorkspaceSessionSelectionDuration(
  sessionId: string,
  now: number = performance.now()
): number | null {
  if (!pendingSessionSelection || pendingSessionSelection.sessionId !== sessionId) {
    return null
  }

  const duration = Math.max(0, now - pendingSessionSelection.startedAt)
  pendingSessionSelection = null
  return duration
}

export function consumeWorkspacePreviewRestoreDuration(
  sessionId: string,
  now: number = performance.now()
): number | null {
  if (!pendingPreviewRestore || pendingPreviewRestore.sessionId !== sessionId) {
    return null
  }

  const duration = Math.max(0, now - pendingPreviewRestore.startedAt)
  pendingPreviewRestore = null
  return duration
}
