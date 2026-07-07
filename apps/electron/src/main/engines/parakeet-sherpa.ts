/**
 * NVIDIA Parakeet-TDT-0.6B-v2 via the sherpa-onnx Node addon (exploration
 * 0279) — the desktop **default English engine**: 6.05% WER (#1 Open ASR
 * leaderboard), real-time on CPU with the int8 export, word-level timestamps.
 *
 * Two deliberately-soft edges:
 * - `sherpa-onnx-node` is an OPTIONAL native addon (per-platform prebuilds;
 *   see the 0279 packaging notes). When it isn't installed the engine reports
 *   not-ready with an instructive error instead of crashing the app — the
 *   registry then routes to whisper.cpp/byo.
 * - Model weights (~660 MB int8) download on first `ensureModel()` from the
 *   sherpa-onnx Hugging Face mirror, file-by-file (no tar.bz2 extraction
 *   dependency), with progress for the settings UI.
 *
 * English-only (v2). Parakeet v3 (25 languages) is a descriptor/URL swap.
 * Runs in the Electron MAIN/data process — never the renderer — so a bad
 * addon can't take the UI down; the renderer reaches it over IPC.
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

const ADDON_NAME = 'sherpa-onnx-node'
const MODEL_BASE_URL =
  'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main'

/** Files the recognizer needs, with rough sizes for download progress. */
const MODEL_FILES: Array<{ name: string; approxBytes: number }> = [
  { name: 'encoder.int8.onnx', approxBytes: 620_000_000 },
  { name: 'decoder.int8.onnx', approxBytes: 20_000_000 },
  { name: 'joiner.int8.onnx', approxBytes: 3_000_000 },
  { name: 'tokens.txt', approxBytes: 20_000 }
]

const TOTAL_BYTES = MODEL_FILES.reduce((sum, f) => sum + f.approxBytes, 0)

export interface ParakeetSherpaOptions {
  /** Where model files live/download, e.g. `<userData>/dictation/parakeet-v2`. */
  modelDir: string
  /** Decode threads. Default 2 — meetings transcribe while the app runs. */
  numThreads?: number
}

/* eslint-disable @typescript-eslint/no-explicit-any -- optional native addon has no types */

export class ParakeetSherpaEngine implements DictationEngine {
  readonly descriptor: EngineDescriptor = {
    id: 'parakeet-sherpa',
    name: 'NVIDIA Parakeet v2 (on-device)',
    languages: ['en'],
    approxDownloadBytes: TOTAL_BYTES,
    attribution: 'NVIDIA Parakeet-TDT-0.6B-v2 (CC-BY-4.0), via sherpa-onnx',
    onDevice: true
  }

  private readonly modelDir: string
  private readonly numThreads: number
  private recognizer: any | null = null
  private addon: any | null | undefined // undefined = not probed yet

  constructor(options: ParakeetSherpaOptions) {
    this.modelDir = options.modelDir
    this.numThreads = options.numThreads ?? 2
  }

  private async loadAddon(): Promise<any | null> {
    if (this.addon !== undefined) return this.addon
    try {
      // Runtime-optional: resolved only when the prebuilt addon is installed.
      this.addon = await import(/* @vite-ignore */ ADDON_NAME)
    } catch {
      this.addon = null
    }
    return this.addon
  }

  private modelFilesPresent(): boolean {
    return MODEL_FILES.every((f) => {
      const path = join(this.modelDir, f.name)
      // Guard against truncated downloads: a file under 1% of its expected
      // size is a failed fetch, not a model.
      return existsSync(path) && statSync(path).size > f.approxBytes / 100
    })
  }

  async isReady(): Promise<boolean> {
    return (await this.loadAddon()) !== null && this.modelFilesPresent()
  }

  async ensureModel(onProgress?: (progress: ModelDownloadProgress) => void): Promise<void> {
    const addon = await this.loadAddon()
    if (!addon) {
      throw new Error(
        `Parakeet needs the optional '${ADDON_NAME}' addon. Install it (pnpm add ${ADDON_NAME} in apps/electron) or pick another engine in Settings.`
      )
    }

    if (!this.modelFilesPresent()) {
      await mkdir(this.modelDir, { recursive: true })
      let receivedBytes = 0
      for (const file of MODEL_FILES) {
        const target = join(this.modelDir, file.name)
        if (existsSync(target) && statSync(target).size > file.approxBytes / 100) {
          receivedBytes += file.approxBytes
          continue
        }
        const response = await fetch(`${MODEL_BASE_URL}/${file.name}`)
        if (!response.ok || !response.body) {
          throw new Error(`Parakeet model download failed: ${file.name} → HTTP ${response.status}`)
        }
        // Download to a temp name so a crash never leaves a plausible-looking
        // partial model behind.
        const partial = `${target}.download`
        await pipeline(Readable.fromWeb(response.body as never), createWriteStream(partial))
        await rename(partial, target)
        receivedBytes += file.approxBytes
        onProgress?.({
          fraction: Math.min(1, receivedBytes / TOTAL_BYTES),
          receivedBytes,
          totalBytes: TOTAL_BYTES
        })
      }
    }

    if (!this.recognizer) {
      this.recognizer = new addon.OfflineRecognizer({
        featConfig: { sampleRate: 16_000, featureDim: 80 },
        modelConfig: {
          transducer: {
            encoder: join(this.modelDir, 'encoder.int8.onnx'),
            decoder: join(this.modelDir, 'decoder.int8.onnx'),
            joiner: join(this.modelDir, 'joiner.int8.onnx')
          },
          tokens: join(this.modelDir, 'tokens.txt'),
          modelType: 'nemo_transducer',
          numThreads: this.numThreads,
          provider: 'cpu'
        }
      })
    }
    onProgress?.({ fraction: 1 })
  }

  async transcribe(audio: AudioInput, _options?: TranscribeOptions): Promise<TranscriptResult> {
    if (audio.kind !== 'pcm') {
      throw new Error('parakeet-sherpa accepts PCM input only (decode encoded audio upstream)')
    }
    if (!this.recognizer) await this.ensureModel()

    const stream = this.recognizer.createStream()
    stream.acceptWaveform({ samples: audio.samples, sampleRate: audio.sampleRate })
    this.recognizer.decode(stream)
    const raw = this.recognizer.getResult(stream)

    // sherpa reports per-token timestamps (seconds); collapse to one segment
    // per clip — chunk-level timing is what the meeting timeline needs.
    const segments: TranscriptSegment[] | undefined =
      Array.isArray(raw.timestamps) && raw.timestamps.length > 0
        ? [
            {
              text: String(raw.text ?? '').trim(),
              startMs: Math.round(raw.timestamps[0] * 1000),
              endMs: Math.round(raw.timestamps[raw.timestamps.length - 1] * 1000)
            }
          ]
        : undefined

    return {
      text: String(raw.text ?? '').trim(),
      language: 'en',
      durationMs: audioDurationMs(audio),
      segments,
      engineId: this.descriptor.id,
      modelId: 'parakeet-tdt-0.6b-v2-int8'
    }
  }
}
