/**
 * IpcDictationEngine (exploration 0279) — a `DictationEngine` that delegates
 * to a main-process-hosted native engine (Parakeet via sherpa-onnx,
 * whisper.cpp) over the `window.xnetMeetings` preload bridge. The descriptor
 * is mirrored from the main process so Settings renders the same name /
 * languages / attribution the engine host declared; readiness and model
 * downloads round-trip over IPC.
 */

import type { MeetingsBridge } from './bridge.js'
import type {
  AudioInput,
  DictationEngine,
  EngineDescriptor,
  ModelDownloadProgress,
  TranscribeOptions,
  TranscriptResult
} from '@xnetjs/dictation'

export class IpcDictationEngine implements DictationEngine {
  readonly descriptor: EngineDescriptor

  private readonly bridge: MeetingsBridge
  /** Readiness reported by the main process at construction; refreshed on ensureModel(). */
  private ready: boolean

  constructor(bridge: MeetingsBridge, descriptor: EngineDescriptor, ready = false) {
    this.bridge = bridge
    // Mirror only the port's fields — the bridge payload may carry extras.
    this.descriptor = {
      id: descriptor.id,
      name: descriptor.name,
      languages: descriptor.languages,
      approxDownloadBytes: descriptor.approxDownloadBytes,
      onDevice: descriptor.onDevice,
      ...(descriptor.attribution ? { attribution: descriptor.attribution } : {})
    }
    this.ready = ready
  }

  async isReady(): Promise<boolean> {
    return this.ready
  }

  async ensureModel(onProgress?: (progress: ModelDownloadProgress) => void): Promise<void> {
    const unsubscribe = onProgress
      ? this.bridge.onEngineProgress(this.descriptor.id, onProgress)
      : null
    try {
      await this.bridge.ensureEngine(this.descriptor.id)
      this.ready = true
    } finally {
      unsubscribe?.()
    }
  }

  async transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult> {
    if (audio.kind !== 'pcm') {
      throw new Error('IpcDictationEngine only accepts PCM audio (the capture session emits PCM)')
    }
    return this.bridge.transcribe({
      engineId: this.descriptor.id,
      samples: audio.samples,
      sampleRate: audio.sampleRate,
      ...(options?.language ? { language: options.language } : {})
    })
  }
}
