/**
 * Renderer-side view of the Electron recording-capture bridge (exploration
 * 0414). The preload exposes `window.xnetRecordings`; this module owns the
 * renderer-facing types plus a safe accessor, so the shared recorder core runs
 * identically on web (bridge absent → the browser path) and desktop (bridge
 * present → the native helper).
 */

import type { CapturePathId } from '@xnetjs/data'

export interface RecordingCaptureStatus {
  path: CapturePathId
  /** `process.platform` in the main process, e.g. "darwin". */
  platform: string
  helperAvailable: boolean
  /**
   * False when the helper shipped as a bare executable. macOS 26 will not list
   * that layout in the Screen Recording pane, so the permission can never be
   * granted — the pre-flight says so instead of waiting for a prompt.
   */
  helperBundled: boolean
  recording: boolean
}

export type RecordingPermissionState =
  | 'granted'
  | 'denied'
  | 'not-determined'
  | 'restricted'
  | 'unknown'
  | 'not-required'

export interface RecordingPermissions {
  screen: RecordingPermissionState
  camera: RecordingPermissionState
}

export interface RecordingStartResult {
  width: number
  height: number
  fps: number
  screenPath: string
  cameraPath: string | null
  outputDir: string
  startedAt: number
}

export interface RecordingStopResult {
  durationMs: number
  droppedFrames: number
  screenPath: string
  cameraPath: string | null
  /** True when capture ended for any reason other than the user stopping it. */
  truncated: boolean
  truncationReason: string | null
}

/**
 * The preload contract (`window.xnetRecordings`). Mirrors
 * `apps/electron/src/preload/index.ts` — keep the two in sync.
 */
export interface RecordingsBridge {
  captureStatus(): Promise<RecordingCaptureStatus>
  permissions(): Promise<RecordingPermissions>
  start(request?: {
    displayId?: number
    camera?: boolean
    fps?: number
  }): Promise<RecordingStartResult>
  stop(): Promise<RecordingStopResult>
  onProgress(handler: (progress: { durationMs: number; droppedFrames: number }) => void): () => void
  onError(handler: (error: { message: string; fatal: boolean }) => void): () => void
}

declare global {
  interface Window {
    xnetRecordings?: RecordingsBridge
  }
}

/** The bridge, or null on web. Never throws — absence is a supported tier. */
export function getRecordingsBridge(): RecordingsBridge | null {
  if (typeof window === 'undefined') return null
  return window.xnetRecordings ?? null
}
