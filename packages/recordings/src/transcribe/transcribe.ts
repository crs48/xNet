/**
 * Transcribing a finished recording (exploration 0414, phase 3).
 *
 * Reuses the 0279 ASR ladder wholesale: any `DictationEngine` works, which on
 * desktop means the main-process-hosted Parakeet and whisper.cpp engines
 * reached over IPC. Nothing new is downloaded and no new model is introduced —
 * a screencast's audio is audio.
 *
 * Three decisions worth naming:
 *
 * 1. **Chunked, not one-shot.** A twelve-minute recording handed to an engine
 *    whole gives no output until it finishes. Chunking on the VAD's speech
 *    boundaries lets segments land incrementally, so the transcript fills in
 *    while the user is already scrubbing.
 * 2. **Offsets stay on the source timeline.** Every segment's timing is
 *    absolute within the recording, never relative to its chunk — otherwise
 *    the first cut would desynchronise everything after it.
 * 3. **Partial results are labelled partial.** If an engine fails halfway, the
 *    segments already produced are kept *and* the failure is reported. A
 *    transcript that silently stops at minute four looks identical to a
 *    recording that was silent from minute four.
 */

import type { RecordingSegment } from '@xnetjs/data'
import type { DictationEngine, TranscriptResult } from '@xnetjs/dictation'

export interface TranscribeChunk {
  /** Mono PCM for this chunk. */
  samples: Float32Array
  sampleRate: number
  /** Absolute offset of this chunk within the recording, in ms. */
  startMs: number
}

export interface TranscribeRecordingOptions {
  /** Called after each chunk so the UI can persist incrementally. */
  onSegments?: (segments: RecordingSegment[]) => void | Promise<void>
  /** Abort between chunks — a user navigating away should not keep decoding. */
  signal?: AbortSignal
  language?: string
}

export interface TranscribeRecordingResult {
  segments: RecordingSegment[]
  fullText: string
  engineId: string
  modelId: string
  language?: string
  durationMs: number
  /**
   * True when at least one chunk failed. The segments are still returned —
   * they are real — but the caller must not present the transcript as
   * complete.
   */
  partial: boolean
  /** Why it is partial, when it is. */
  failureReason: string | null
}

/**
 * Map an engine result onto absolute source offsets.
 *
 * Engines that return no segment breakdown still produce one segment spanning
 * the chunk — a transcript with text but no timings is unusable for editing,
 * and silently dropping it would be worse.
 */
export function toRecordingSegments(
  result: TranscriptResult,
  chunkStartMs: number,
  chunkDurationMs: number
): RecordingSegment[] {
  if (!result.segments?.length) {
    const text = result.text.trim()
    if (!text) return []
    return [{ text, startMs: chunkStartMs, endMs: chunkStartMs + chunkDurationMs }]
  }

  return result.segments
    .filter((segment) => segment.text.trim().length > 0)
    .map((segment) => ({
      text: segment.text.trim(),
      startMs: chunkStartMs + segment.startMs,
      endMs: chunkStartMs + segment.endMs,
      ...(segment.words?.length
        ? {
            words: segment.words.map((word) => ({
              text: word.text,
              startMs: chunkStartMs + word.startMs,
              endMs: chunkStartMs + word.endMs
            }))
          }
        : {})
    }))
}

/** Engines known to preserve disfluencies — the gate on filler-word cutting. */
const VERBATIM_ENGINE_IDS = new Set(['crisper-whisper'])

/** Whether an engine's output can support filler-word cutting at all. */
export function engineIsVerbatim(engineId: string): boolean {
  return VERBATIM_ENGINE_IDS.has(engineId)
}

export async function transcribeRecording(
  engine: DictationEngine,
  chunks: AsyncIterable<TranscribeChunk> | Iterable<TranscribeChunk>,
  options: TranscribeRecordingOptions = {}
): Promise<TranscribeRecordingResult> {
  const segments: RecordingSegment[] = []
  let engineId = engine.descriptor.id
  let modelId = ''
  let language = options.language
  let durationMs = 0
  let failureReason: string | null = null

  for await (const chunk of chunks) {
    if (options.signal?.aborted) {
      failureReason ??= 'Transcription was cancelled.'
      break
    }

    const chunkDurationMs = (chunk.samples.length / chunk.sampleRate) * 1_000

    try {
      const result = await engine.transcribe(
        { kind: 'pcm', samples: chunk.samples, sampleRate: chunk.sampleRate },
        options.language ? { language: options.language } : {}
      )

      engineId = result.engineId || engineId
      modelId = result.modelId || modelId
      language ??= result.language

      const fresh = toRecordingSegments(result, chunk.startMs, chunkDurationMs)
      if (fresh.length > 0) {
        segments.push(...fresh)
        await options.onSegments?.(fresh)
      }
    } catch (cause) {
      // Keep what was produced, and say the rest is missing. Continuing past a
      // failed chunk would leave an unmarked hole in the middle of the text.
      failureReason = cause instanceof Error ? cause.message : String(cause)
      break
    }

    durationMs = Math.max(durationMs, chunk.startMs + chunkDurationMs)
  }

  return {
    segments,
    fullText: segments.map((segment) => segment.text).join(' '),
    engineId,
    modelId,
    ...(language ? { language } : {}),
    durationMs: Math.round(durationMs),
    partial: failureReason !== null,
    failureReason
  }
}
