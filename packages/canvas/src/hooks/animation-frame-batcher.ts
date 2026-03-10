/**
 * Animation frame batcher utilities for viewport and canvas work.
 */

export interface AnimationFrameBatcherScheduler {
  requestFrame: (callback: FrameRequestCallback) => number
  cancelFrame: (frameId: number) => void
}

export interface AnimationFrameBatcher {
  schedule: () => void
  flush: () => void
  cancel: () => void
  setCommit: (commit: () => void) => void
  isScheduled: () => boolean
}

function getDefaultScheduler(): AnimationFrameBatcherScheduler | null {
  if (typeof window === 'undefined') {
    return null
  }

  if (
    typeof window.requestAnimationFrame !== 'function' ||
    typeof window.cancelAnimationFrame !== 'function'
  ) {
    return null
  }

  return {
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (frameId) => window.cancelAnimationFrame(frameId)
  }
}

export function createAnimationFrameBatcher(
  commit: () => void,
  scheduler: AnimationFrameBatcherScheduler | null = getDefaultScheduler()
): AnimationFrameBatcher {
  let currentCommit = commit
  let frameId: number | null = null

  const flush = (): void => {
    frameId = null
    currentCommit()
  }

  return {
    schedule: () => {
      if (frameId !== null) {
        return
      }

      if (scheduler === null) {
        flush()
        return
      }

      frameId = scheduler.requestFrame(() => {
        flush()
      })
    },
    flush,
    cancel: () => {
      if (frameId === null) {
        return
      }

      if (scheduler !== null) {
        scheduler.cancelFrame(frameId)
      }
      frameId = null
    },
    setCommit: (nextCommit) => {
      currentCommit = nextCommit
    },
    isScheduled: () => frameId !== null
  }
}
