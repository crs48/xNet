/**
 * Renderer-side view of the Electron meeting-capture bridge (exploration
 * 0279). The preload exposes `window.xnetMeetings`; this module owns the
 * renderer-facing types plus a safe accessor so the shared recorder core can
 * run identically on web (bridge absent → tab-audio/mic-only tiers) and
 * desktop (bridge present → system-audio tier + native STT engines).
 */

import type { EngineDescriptor, ModelDownloadProgress, TranscriptResult } from '@xnetjs/dictation'

/** Which system-audio rung of the 0279 fallback ladder this machine resolves to. */
export type MeetingsSystemAudioPath = 'core-audio-tap' | 'chromium-loopback' | 'none'

/** `captureStatus()` payload from the main process. */
export interface MeetingsCaptureStatus {
  /** Loopback/helper capture is available on this machine. */
  systemAudioAvailable: boolean
  /** `process.platform` in the main process, e.g. "darwin". */
  platform: string
  /** The NEXT `getDisplayMedia({ audio: true })` returns a loopback stream. */
  loopbackArmed: boolean
  /** How system audio will be captured on this machine. */
  systemAudioPath: MeetingsSystemAudioPath
}

/** A TCC media-access status as reported by `systemPreferences` on macOS. */
export type MeetingsPermissionState =
  | 'granted'
  | 'denied'
  | 'not-determined'
  | 'restricted'
  | 'unknown'

/**
 * `permissions()` payload — the pre-flight state so the recorder can explain
 * the exact prompt(s) the user is about to see (0279 permissions UX).
 *
 * `systemAudio` is `'audio-capture-tcc'` on the Core Audio tap path (the
 * audio-capture TCC category cannot be queried before its first prompt),
 * `'not-required'` off macOS, and the Screen Recording TCC status when the
 * Chromium-loopback path will be used.
 */
export interface MeetingsPermissions {
  microphone: MeetingsPermissionState
  systemAudio: MeetingsPermissionState | 'audio-capture-tcc' | 'not-required'
}

/** An engine descriptor as reported over IPC, plus its current readiness. */
export type MeetingsBridgeEngine = EngineDescriptor & { ready: boolean }

/**
 * The preload contract (`window.xnetMeetings`). Mirrors
 * `apps/electron/src/preload/index.ts` — keep the two in sync.
 */
export interface MeetingsBridge {
  captureStatus(): Promise<MeetingsCaptureStatus>
  /** Pre-flight TCC state, so the recorder explains prompts before they fire. */
  permissions(): Promise<MeetingsPermissions>
  armLoopback(): Promise<void>
  disarmLoopback(): Promise<void>
  /** Core Audio tap streaming (macOS 14.4+ production path). */
  startTap(): Promise<{ started: boolean }>
  stopTap(): Promise<void>
  onTapPcm(handler: (chunk: { samples: Float32Array; sampleRate: number }) => void): () => void
  onTapError(handler: (error: { message: string }) => void): () => void
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
