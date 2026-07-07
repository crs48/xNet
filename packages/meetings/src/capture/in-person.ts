/**
 * In-person (mobile) capture mode (exploration 0279, phase 4).
 *
 * Phones can't hear other apps (iOS gives third parties nothing; Android
 * exempts voice-communication streams), so mobile is a mic-only, in-person
 * shape — Granola's iPhone model: record the room now, transcribe after the
 * meeting ends (streaming a phone mic through an engine for an hour burns
 * battery for no UX gain when there is no live "Them" channel to attribute).
 *
 * The recorder accumulates PCM in memory, then `finish(engine)` VAD-splits
 * the whole recording and transcribes chunk-by-chunk with progress. Every
 * segment lands on the `me` channel (one physical mic — attribution needs
 * the phase-4 diarization upgrade, see `diarization.ts`).
 */

import type { TranscriptSnapshot } from './segment-batcher'
import type { MeetingSegment } from '@xnetjs/data'
import type { DictationEngine } from '@xnetjs/dictation'
import { VadChunker, type VadOptions } from './vad'

export interface InPersonFinishOptions {
  language?: string
  signal?: AbortSignal
  /** chunksDone/chunksTotal after each transcribed chunk. */
  onProgress?: (done: number, total: number) => void
  vad?: Omit<VadOptions, 'sampleRate'>
}

export class InPersonRecorder {
  private readonly sampleRate: number
  private buffers: Float32Array[] = []
  private samples = 0
  private finished = false

  constructor(options: { sampleRate: number }) {
    this.sampleRate = options.sampleRate
  }

  /** Feed mic PCM while recording. */
  push(samples: Float32Array): void {
    if (this.finished) return
    this.buffers.push(samples)
    this.samples += samples.length
  }

  /** Recorded length so far, ms (for the recording indicator). */
  get durationMs(): number {
    return Math.round((this.samples / this.sampleRate) * 1000)
  }

  /** The raw recording (e.g. for opt-in audio retention). */
  recording(): Float32Array {
    const all = new Float32Array(this.samples)
    let cursor = 0
    for (const part of this.buffers) {
      all.set(part, cursor)
      cursor += part.length
    }
    return all
  }

  /** Stop, VAD-split the whole recording, and transcribe it post-hoc. */
  async finish(
    engine: DictationEngine,
    options: InPersonFinishOptions = {}
  ): Promise<TranscriptSnapshot> {
    this.finished = true
    const chunker = new VadChunker({ ...options.vad, sampleRate: this.sampleRate })
    const chunks = [...chunker.push(this.recording()), ...chunker.end()]

    const segments: MeetingSegment[] = []
    let done = 0
    for (const chunk of chunks) {
      options.signal?.throwIfAborted()
      const result = await engine.transcribe(
        { kind: 'pcm', samples: chunk.samples, sampleRate: this.sampleRate },
        { language: options.language, signal: options.signal }
      )
      if (result.text.trim().length > 0) {
        segments.push({
          channel: 'me',
          text: result.text,
          startMs: chunk.startMs,
          endMs: chunk.endMs
        })
      }
      done += 1
      options.onProgress?.(done, chunks.length)
    }

    return {
      segments,
      fullText: segments.map((s) => s.text).join(' '),
      durationMs: this.durationMs
    }
  }
}
