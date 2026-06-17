/**
 * "Bring your own" engine — talks to any local (or remote) server that exposes
 * the OpenAI `/v1/audio/transcriptions` API. This is how a user who *already*
 * runs a Whisper/Parakeet server (e.g. the achetronic/parakeet sidecar, or an
 * existing local STT tool) reuses it from xNet without us shelling into another
 * app. Pure `fetch` + `FormData`; no native code.
 */

import type {
  AudioInput,
  DictationEngine,
  EngineDescriptor,
  TranscribeOptions,
  TranscriptResult
} from '../types'
import { audioDurationMs } from '../types'

export interface ByoEndpointConfig {
  /** Base URL of an OpenAI-compatible server, e.g. "http://127.0.0.1:5092". */
  baseUrl: string
  /** Model name to request. Defaults to "whisper-1". */
  model?: string
  /** Optional bearer token. */
  apiKey?: string
  /** Override the engine id/name shown in Settings. */
  id?: string
  name?: string
  /** Injected fetch (defaults to global `fetch`). */
  fetchImpl?: typeof fetch
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

/** True when a URL points at the local machine (engine still runs on-device). */
export function isLoopbackUrl(raw: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(raw).hostname)
  } catch {
    return false
  }
}

export class ByoEndpointEngine implements DictationEngine {
  readonly descriptor: EngineDescriptor

  private readonly baseUrl: string
  private readonly model: string
  private readonly apiKey?: string
  private readonly fetchImpl: typeof fetch

  constructor(config: ByoEndpointConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.model = config.model ?? 'whisper-1'
    this.apiKey = config.apiKey
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch
    this.descriptor = {
      id: config.id ?? 'byo',
      name: config.name ?? 'Custom endpoint',
      languages: ['*'],
      approxDownloadBytes: 0,
      onDevice: isLoopbackUrl(this.baseUrl)
    }
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra }
    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`
    }
    return headers
  }

  async isReady(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: this.headers()
      })
      return res.ok
    } catch {
      return false
    }
  }

  async ensureModel(): Promise<void> {
    // The server owns its model; nothing to download client-side.
  }

  async transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult> {
    if (audio.kind !== 'encoded') {
      throw new Error(
        'ByoEndpointEngine needs encoded audio (a wav/webm blob); encode PCM before calling transcribe()'
      )
    }

    // Copy into a fresh ArrayBuffer so the Blob part is a plain (non-shared)
    // buffer — keeps TS's BlobPart typing happy across Node/DOM lib versions.
    const buffer = new ArrayBuffer(audio.bytes.byteLength)
    new Uint8Array(buffer).set(audio.bytes)

    const form = new FormData()
    form.append('file', new Blob([buffer], { type: audio.mimeType }), 'audio')
    form.append('model', this.model)
    if (options?.language) {
      form.append('language', options.language)
    }

    const res = await this.fetchImpl(`${this.baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: this.headers(),
      body: form,
      signal: options?.signal
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Transcription endpoint failed: ${res.status} ${detail}`.trim())
    }

    const payload = (await res.json()) as { text?: string; language?: string; duration?: number }
    return {
      text: payload.text ?? '',
      language: payload.language ?? options?.language,
      durationMs:
        typeof payload.duration === 'number'
          ? Math.round(payload.duration * 1000)
          : audioDurationMs(audio),
      engineId: this.descriptor.id,
      modelId: this.model
    }
  }
}
