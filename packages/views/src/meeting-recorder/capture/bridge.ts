/**
 * Renderer-side view of the Electron meeting-capture bridge (exploration
 * 0279). The preload exposes `window.xnetMeetings`; this module owns the
 * renderer-facing types plus a safe accessor so the shared recorder core can
 * run identically on web (bridge absent → tab-audio/mic-only tiers) and
 * desktop (bridge present → system-audio tier + native STT engines).
 */

import type { EngineDescriptor, ModelDownloadProgress, TranscriptResult } from '@xnetjs/dictation'

/** `captureStatus()` payload from the main process. */
export interface MeetingsCaptureStatus {
  /** Loopback/helper capture is available on this machine. */
  systemAudioAvailable: boolean
  /** `process.platform` in the main process, e.g. "darwin". */
  platform: string
  /** The NEXT `getDisplayMedia({ audio: true })` returns a loopback stream. */
  loopbackArmed: boolean
}

/** An engine descriptor as reported over IPC, plus its current readiness. */
export type MeetingsBridgeEngine = EngineDescriptor & { ready: boolean }

/**
 * The preload contract (`window.xnetMeetings`). Mirrors
 * `apps/electron/src/preload/index.ts` — keep the two in sync.
 */
export interface MeetingsBridge {
  captureStatus(): Promise<MeetingsCaptureStatus>
  armLoopback(): Promise<void>
  disarmLoopback(): Promise<void>
  engines(): Promise<MeetingsBridgeEngine[]>
  ensureEngine(engineId: string): Promise<void>
  onEngineProgress(engineId: string, handler: (progress: ModelDownloadProgress) => void): () => void
  transcribe(request: {
    engineId: string
    samples: Float32Array
    sampleRate: number
    language?: string
  }): Promise<TranscriptResult>
}

/** The bridge, when running under the Electron shell; null on web/mobile. */
export function getMeetingsBridge(): MeetingsBridge | null {
  if (typeof globalThis === 'undefined') return null
  const candidate = (globalThis as { xnetMeetings?: MeetingsBridge }).xnetMeetings
  return candidate ?? null
}
