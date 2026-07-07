/**
 * whisper.cpp large-v3-turbo via the optional `smart-whisper` addon
 * (exploration 0279) — the **multilingual local fallback** behind Parakeet
 * (which is English-only). ~100 languages, Metal/CoreML acceleration on
 * macOS, q5_0 quantized weights (~574 MB).
 *
 * Same soft edges as the Parakeet engine: the native addon is optional
 * (missing → not-ready + instructive error), weights download on first
 * `ensureModel()` from the whisper.cpp Hugging Face mirror.
 */

import type {
  AudioInput,
  DictationEngine,
  EngineDescriptor,
  ModelDownloadProgress,
  TranscribeOptions,
  TranscriptResult,
  TranscriptSegment
} from '@xnetjs/dictation'
import { createWriteStream, existsSync, statSync } from 'fs'
import { mkdir, rename } from 'fs/promises'
import { join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { audioDurationMs } from '@xnetjs/dictation'

const ADDON_NAME = 'smart-whisper'
const MODEL_FILE = 'ggml-large-v3-turbo-q5_0.bin'
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILE}`
const MODEL_BYTES = 574_000_000

export interface WhisperCppOptions {
  /** Where the ggml model lives/downloads, e.g. `<userData>/dictation/whisper`. */
  modelDir: string
}

/* eslint-disable @typescript-eslint/no-explicit-any -- optional native addon has no types */

export class WhisperCppEngine implements DictationEngine {
  readonly descriptor: EngineDescriptor = {
    id: 'whisper-cpp',
    name: 'Whisper large-v3-turbo (on-device)',
    languages: ['*'],
    approxDownloadBytes: MODEL_BYTES,
    onDevice: true
  }

  private readonly modelDir: string
  private whisper: any | null = null
  private addon: any | null | undefined

  constructor(options: WhisperCppOptions) {
    this.modelDir = options.modelDir
  }

  private modelPath(): string {
    return join(this.modelDir, MODEL_FILE)
  }

  private async loadAddon(): Promise<any | null> {
    if (this.addon !== undefined) return this.addon
    try {
      this.addon = await import(/* @vite-ignore */ ADDON_NAME)
    } catch {
      this.addon = null
    }
    return this.addon
  }

  private modelPresent(): boolean {
    return existsSync(this.modelPath()) && statSync(this.modelPath()).size > MODEL_BYTES / 100
  }

  async isReady(): Promise<boolean> {
    return (await this.loadAddon()) !== null && this.modelPresent()
  }

  async ensureModel(onProgress?: (progress: ModelDownloadProgress) => void): Promise<void> {
    const addon = await this.loadAddon()
    if (!addon) {
      throw new Error(
        `Whisper needs the optional '${ADDON_NAME}' addon. Install it (pnpm add ${ADDON_NAME} in apps/electron) or pick another engine in Settings.`
      )
    }

    if (!this.modelPresent()) {
      await mkdir(this.modelDir, { recursive: true })
      const response = await fetch(MODEL_URL)
      if (!response.ok || !response.body) {
        throw new Error(`Whisper model download failed: HTTP ${response.status}`)
      }
      const partial = `${this.modelPath()}.download`
      await pipeline(Readable.fromWeb(response.body as never), createWriteStream(partial))
      await rename(partial, this.modelPath())
      onProgress?.({ fraction: 1, totalBytes: MODEL_BYTES })
    }

    if (!this.whisper) {
      this.whisper = new addon.Whisper(this.modelPath(), { gpu: true })
    }
    onProgress?.({ fraction: 1 })
  }

  async transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult> {
    if (audio.kind !== 'pcm') {
      throw new Error('whisper-cpp accepts PCM input only (decode encoded audio upstream)')
    }
    if (!this.whisper) await this.ensureModel()

    const task = await this.whisper.transcribe(audio.samples, {
      language: options?.language ?? 'auto',
      suppress_blank: true
    })
    // smart-whisper resolves to [{ from, to, text }] (ms offsets).
    const raw: Array<{ from: number; to: number; text: string }> = await task.result

    const segments: TranscriptSegment[] = raw
      .map((s) => ({ text: s.text.trim(), startMs: s.from, endMs: s.to }))
      .filter((s) => s.text.length > 0)

    return {
      text: segments.map((s) => s.text).join(' '),
      language: options?.language,
      durationMs: audioDurationMs(audio),
      segments: segments.length > 0 ? segments : undefined,
      engineId: this.descriptor.id,
      modelId: 'whisper-large-v3-turbo-q5_0'
    }
  }
}
