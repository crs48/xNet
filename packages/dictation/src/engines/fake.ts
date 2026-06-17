/**
 * A scripted in-memory engine for tests and dev — no audio, no model, no
 * network. Mirrors the `fake` provider in `@xnetjs/billing`.
 */

import type {
  AudioInput,
  DictationEngine,
  EngineDescriptor,
  ModelDownloadProgress,
  TranscribeOptions,
  TranscriptResult
} from '../types'
import { audioDurationMs } from '../types'

export interface FakeEngineOptions {
  id?: string
  name?: string
  /** Text to return, or a function of the call. Defaults to a fixed phrase. */
  script?: string | ((audio: AudioInput, options?: TranscribeOptions) => string)
  language?: string
  modelId?: string
  /** Start un-ready to exercise `ensureModel()`. Defaults to ready. */
  ready?: boolean
  /** Pretend download size, for descriptor tests. */
  approxDownloadBytes?: number
}

export class FakeDictationEngine implements DictationEngine {
  readonly descriptor: EngineDescriptor

  /** Recorded transcribe calls, for assertions. */
  readonly calls: AudioInput[] = []
  /** Number of `ensureModel()` invocations. */
  ensureModelCalls = 0

  private ready: boolean
  private readonly script: NonNullable<FakeEngineOptions['script']>
  private readonly language?: string
  private readonly modelId: string

  constructor(options: FakeEngineOptions = {}) {
    const id = options.id ?? 'fake'
    this.descriptor = {
      id,
      name: options.name ?? 'Fake engine',
      languages: options.language ? [options.language] : ['*'],
      approxDownloadBytes: options.approxDownloadBytes ?? 0,
      onDevice: true
    }
    this.ready = options.ready ?? true
    this.script = options.script ?? 'hello world'
    this.language = options.language
    this.modelId = options.modelId ?? `${id}-model`
  }

  async isReady(): Promise<boolean> {
    return this.ready
  }

  async ensureModel(onProgress?: (progress: ModelDownloadProgress) => void): Promise<void> {
    this.ensureModelCalls++
    onProgress?.({ fraction: 0 })
    onProgress?.({ fraction: 1 })
    this.ready = true
  }

  async transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult> {
    if (!this.ready) {
      throw new Error('Fake engine model not ready — call ensureModel() first')
    }
    this.calls.push(audio)
    const text = typeof this.script === 'function' ? this.script(audio, options) : this.script
    return {
      text,
      language: options?.language ?? this.language,
      durationMs: audioDurationMs(audio),
      engineId: this.descriptor.id,
      modelId: this.modelId
    }
  }
}
