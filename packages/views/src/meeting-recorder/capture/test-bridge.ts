/**
 * Shared fake `window.xnetMeetings` bridge for meeting-recorder tests
 * (exploration 0279). Kept out of the sub-barrel — tests only.
 */

import type { MeetingsBridge, MeetingsBridgeEngine } from './bridge'
import type { TranscriptResult } from '@xnetjs/dictation'
import { vi } from 'vitest'

export const FAKE_PARAKEET: MeetingsBridgeEngine = {
  id: 'parakeet-sherpa',
  name: 'NVIDIA Parakeet',
  languages: ['en'],
  approxDownloadBytes: 600_000_000,
  onDevice: true,
  attribution: 'NVIDIA Parakeet — CC-BY-4.0',
  ready: false
}

export const FAKE_WHISPER: MeetingsBridgeEngine = {
  id: 'whisper-cpp',
  name: 'Whisper',
  languages: ['*'],
  approxDownloadBytes: 150_000_000,
  onDevice: true,
  ready: true
}

export function fakeMeetingsBridge(overrides: Partial<MeetingsBridge> = {}): MeetingsBridge {
  return {
    captureStatus: vi.fn(async () => ({
      systemAudioAvailable: true,
      platform: 'darwin',
      loopbackArmed: false,
      systemAudioPath: 'core-audio-tap' as const
    })),
    permissions: vi.fn(async () => ({
      microphone: 'granted' as const,
      systemAudio: 'audio-capture-tcc' as const
    })),
    armLoopback: vi.fn(async () => undefined),
    disarmLoopback: vi.fn(async () => undefined),
    startTap: vi.fn(async () => ({ started: true })),
    stopTap: vi.fn(async () => undefined),
    onTapPcm: vi.fn(() => () => undefined),
    onTapError: vi.fn(() => () => undefined),
    engines: vi.fn(async () => [FAKE_PARAKEET, FAKE_WHISPER]),
    ensureEngine: vi.fn(async () => undefined),
    onEngineProgress: vi.fn(() => () => undefined),
    transcribe: vi.fn(
      async (): Promise<TranscriptResult> => ({
        text: 'hello world',
        durationMs: 1200,
        engineId: 'parakeet-sherpa',
        modelId: 'parakeet-tdt-0.6b-v2'
      })
    ),
    ...overrides
  }
}
