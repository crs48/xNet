/**
 * Meeting engine registry builder (exploration 0279).
 *
 * Populates an `EngineRegistry` with everything the current platform offers:
 * the main-process native engines mirrored over IPC (Electron only), and the
 * user's "bring your own" OpenAI-compatible endpoint when one is configured.
 * Engine preferences persist in localStorage — the same lightweight pattern
 * as the AI chat connector settings (0252) and the Tasks display options —
 * because the picker is a device-level capability, not workspace data.
 */

import {
  ByoEndpointEngine,
  EngineRegistry,
  type AudioInput,
  type DictationEngine,
  type ModelDownloadProgress,
  type TranscribeOptions,
  type TranscriptResult
} from '@xnetjs/dictation'
import { getMeetingsBridge, type MeetingsBridge } from './bridge.js'
import { IpcDictationEngine } from './ipc-engine.js'
import { encodeWavPcm16 } from './pcm.js'

/** localStorage keys for the dictation-engine preferences. */
export const MEETINGS_STORAGE_KEYS = {
  /** Preferred engine id (`selectEngine` still language-checks it). */
  engine: 'xnet:meetings:engine',
  /** Base URL of a BYO OpenAI-compatible transcription server. */
  byoEndpoint: 'xnet:meetings:byo-endpoint'
} as const

export interface MeetingEnginePrefs {
  preferredEngineId?: string
  byoEndpoint?: string
}

export function readMeetingEnginePrefs(): MeetingEnginePrefs {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  const engine = window.localStorage.getItem(MEETINGS_STORAGE_KEYS.engine) || undefined
  const byoEndpoint = window.localStorage.getItem(MEETINGS_STORAGE_KEYS.byoEndpoint) || undefined
  return {
    ...(engine ? { preferredEngineId: engine } : {}),
    ...(byoEndpoint ? { byoEndpoint } : {})
  }
}

export function writeMeetingEnginePref(
  key: keyof typeof MEETINGS_STORAGE_KEYS,
  value: string
): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  if (value) window.localStorage.setItem(MEETINGS_STORAGE_KEYS[key], value)
  else window.localStorage.removeItem(MEETINGS_STORAGE_KEYS[key])
}

/**
 * The capture session pushes PCM, but `ByoEndpointEngine` only accepts
 * encoded blobs — this adapter encodes PCM chunks to WAV on the way through
 * so the BYO endpoint slots into the same `DictationEngine` seam.
 */
export class PcmToWavEngine implements DictationEngine {
  readonly descriptor: DictationEngine['descriptor']

  private readonly inner: DictationEngine

  constructor(inner: DictationEngine) {
    this.inner = inner
    this.descriptor = inner.descriptor
  }

  isReady(): Promise<boolean> {
    return this.inner.isReady()
  }

  ensureModel(onProgress?: (progress: ModelDownloadProgress) => void): Promise<void> {
    return this.inner.ensureModel(onProgress)
  }

  transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult> {
    const encoded: AudioInput =
      audio.kind === 'pcm'
        ? {
            kind: 'encoded',
            bytes: encodeWavPcm16(audio.samples, audio.sampleRate),
            mimeType: 'audio/wav'
          }
        : audio
    return this.inner.transcribe(encoded, options)
  }
}

export interface BuildMeetingEngineRegistryOptions {
  /** Injected bridge for tests; defaults to `window.xnetMeetings`. */
  bridge?: MeetingsBridge | null
  /** Injected prefs for tests; defaults to localStorage. */
  prefs?: MeetingEnginePrefs
}

/**
 * Build the registry for this platform. Async because the Electron bridge is
 * asked which native engines the main process hosts. Preference order for the
 * default: the persisted preferred engine → first ready IPC engine → first
 * IPC engine → BYO endpoint.
 */
export async function buildMeetingEngineRegistry(
  options: BuildMeetingEngineRegistryOptions = {}
): Promise<EngineRegistry> {
  const bridge = options.bridge !== undefined ? options.bridge : getMeetingsBridge()
  const prefs = options.prefs ?? readMeetingEnginePrefs()
  const registry = new EngineRegistry()

  if (bridge) {
    try {
      const engines = await bridge.engines()
      const firstReady = engines.find((engine) => engine.ready)
      for (const engine of engines) {
        registry.register(new IpcDictationEngine(bridge, engine, engine.ready), {
          makeDefault: engine.id === (firstReady?.id ?? engines[0]?.id)
        })
      }
    } catch {
      // A broken bridge degrades to whatever else is registered below.
    }
  }

  if (prefs.byoEndpoint) {
    registry.register(new PcmToWavEngine(new ByoEndpointEngine({ baseUrl: prefs.byoEndpoint })))
  }

  if (prefs.preferredEngineId && registry.has(prefs.preferredEngineId)) {
    registry.setDefault(prefs.preferredEngineId)
  }

  return registry
}
