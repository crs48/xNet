/**
 * Core types for `@xnetjs/dictation`.
 *
 * The `DictationEngine` port is the seam every speech-to-text backend plugs
 * into — whether it is a native whisper.cpp addon, NVIDIA Parakeet via
 * sherpa-onnx/FluidAudio, Apple's on-device `SpeechAnalyzer`, or a remote
 * OpenAI-compatible server. Callers (the in-app mic button, the push-to-talk
 * controller) only ever see this interface, so engines can be swapped without
 * touching UI — the same move `@xnetjs/billing` makes with `PaymentProvider`.
 */

/**
 * Audio handed to an engine. Two shapes so engines can advertise what they
 * accept: raw PCM (native in-process engines) or an already-encoded blob
 * (remote / HTTP engines that want a `.wav`/`.webm` file).
 */
export type AudioInput =
  | {
      kind: 'pcm'
      /** Mono PCM samples normalized to [-1, 1]. */
      samples: Float32Array
      /** Samples per second, e.g. 16000. */
      sampleRate: number
    }
  | {
      kind: 'encoded'
      /** Encoded audio file bytes (wav, webm/opus, mp3, …). */
      bytes: Uint8Array
      /** MIME type of `bytes`, e.g. "audio/wav". */
      mimeType: string
    }

/** A timed slice of a transcript, when the engine reports word/segment timings. */
export interface TranscriptSegment {
  text: string
  startMs: number
  endMs: number
}

/** The result of transcribing one clip. */
export interface TranscriptResult {
  /** The transcribed text, already normalized for insertion. */
  text: string
  /** Detected/used language (BCP-47-ish, e.g. "en"), when known. */
  language?: string
  /** Length of the source audio in milliseconds. */
  durationMs: number
  /** Optional per-segment timings. */
  segments?: TranscriptSegment[]
  /** Which engine produced this (`descriptor.id`). */
  engineId: string
  /** Which model produced this (e.g. "parakeet-tdt-0.6b-v2"). */
  modelId: string
}

/** Options for a single transcription. */
export interface TranscribeOptions {
  /** Language hint, e.g. "en". Omit for auto-detect. */
  language?: string
  /** Abort a long transcription. */
  signal?: AbortSignal
}

/** Progress for a one-time model download. */
export interface ModelDownloadProgress {
  /** 0..1. */
  fraction: number
  receivedBytes?: number
  totalBytes?: number
}

/** Static, user-facing description of an engine. */
export interface EngineDescriptor {
  /** Stable id, e.g. "whisper" | "parakeet" | "apple" | "byo". */
  id: string
  /** Human-readable name shown in Settings. */
  name: string
  /** Languages handled; `['*']` means any / auto-detect. */
  languages: string[]
  /**
   * Rough first-run download size in bytes, for the UI. `0` means no download
   * (OS-native engine, or a remote server that owns its own model).
   */
  approxDownloadBytes: number
  /**
   * Attribution line that MUST be surfaced when this engine is active — e.g.
   * NVIDIA Parakeet is CC-BY-4.0. Omit for MIT/OS engines with no requirement.
   */
  attribution?: string
  /** True when transcription happens entirely on the user's device. */
  onDevice: boolean
}

/**
 * The speech-to-text port. Every backend implements this.
 *
 * Implementations must be safe to construct cheaply; expensive work (loading a
 * model) belongs in `ensureModel()`, which callers invoke before the first
 * `transcribe()`.
 */
export interface DictationEngine {
  /** Static description of this engine. */
  readonly descriptor: EngineDescriptor
  /** Is the model present and loadable right now (no download needed)? */
  isReady(): Promise<boolean>
  /** Download/verify/load the model. Reports 0..1 progress. Idempotent. */
  ensureModel(onProgress?: (progress: ModelDownloadProgress) => void): Promise<void>
  /** Transcribe one clip. Throws if `audio.kind` is unsupported by this engine. */
  transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult>
}

/** Where a transcript came from. */
export type TranscriptionSource = 'inApp' | 'pushToTalk'

/** Estimate a clip's duration in milliseconds (PCM only; 0 for encoded). */
export function audioDurationMs(audio: AudioInput): number {
  if (audio.kind === 'pcm') {
    if (audio.sampleRate <= 0) return 0
    return Math.round((audio.samples.length / audio.sampleRate) * 1000)
  }
  return 0
}
