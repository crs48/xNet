/**
 * Meeting capture session (exploration 0279).
 *
 * The platform-agnostic heart of the recorder: two capture channels
 * (`me` = microphone, `them` = system audio — the Granola attribution trick),
 * each VAD-chunked and transcribed through a swappable `DictationEngine`,
 * with results accumulated into batched transcript upserts.
 *
 * Split in two, mirroring `@xnetjs/dictation`'s hold-to-talk design:
 * - `meetingSessionReducer` — a *pure* state machine (no timers, no
 *   `Date.now()`; events carry their timestamps) so the recorder UI state is
 *   deterministic and testable.
 * - `MeetingCaptureSession` — the orchestrator that pumps PCM through
 *   VAD → engine → batcher. Platforms push PCM in; they own getUserMedia /
 *   loopback / helper-binary plumbing (and echo cancellation).
 *
 * Mic-only is a first-class mode, not an error: system audio being denied or
 * unavailable (Safari, permission declined) degrades the session, loudly, to
 * `recording-mic-only`.
 */

import type { MeetingChannel, MeetingSegment } from '@xnetjs/data'
import type { DictationEngine } from '@xnetjs/dictation'
import { SegmentBatcher, type TranscriptSnapshot } from './segment-batcher'
import { VadChunker, type VadChunk, type VadOptions } from './vad'

// ---------------------------------------------------------------------------
// Pure state machine
// ---------------------------------------------------------------------------

export type MeetingSessionStatus =
  | 'idle'
  | 'requesting-permissions'
  | 'recording'
  | 'recording-mic-only'
  | 'paused'
  | 'enhancing'
  | 'done'
  | 'error'

export type MeetingSessionState =
  | { status: 'idle' }
  | { status: 'requesting-permissions'; startedAt: number }
  | { status: 'recording'; startedAt: number }
  | {
      status: 'recording-mic-only'
      startedAt: number
      /** Why system audio is absent — the UI must say so (0279 degraded modes). */
      reason: 'denied' | 'unavailable'
    }
  | { status: 'paused'; startedAt: number; micOnly: boolean }
  | { status: 'enhancing'; startedAt: number; endedAt: number }
  | { status: 'done'; startedAt: number; endedAt: number }
  | { status: 'error'; message: string }

export type MeetingSessionEvent =
  | { type: 'start'; at: number }
  | { type: 'permissionsGranted'; systemAudio: boolean; at: number }
  | { type: 'permissionsDenied'; at: number }
  | { type: 'systemAudioLost' } // mid-meeting device/helper failure → degrade
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop'; at: number }
  | { type: 'enhanced' }
  | { type: 'skipEnhancement' }
  | { type: 'failure'; message: string }
  | { type: 'reset' }

export const initialMeetingSessionState: MeetingSessionState = { status: 'idle' }

/**
 * Advance the machine. Invalid transitions return the state unchanged, so the
 * caller can dispatch freely without guarding every combination.
 */
export function meetingSessionReducer(
  state: MeetingSessionState,
  event: MeetingSessionEvent
): MeetingSessionState {
  if (event.type === 'reset') return initialMeetingSessionState
  if (event.type === 'failure') return { status: 'error', message: event.message }

  switch (state.status) {
    case 'idle': {
      if (event.type === 'start') {
        return { status: 'requesting-permissions', startedAt: event.at }
      }
      return state
    }

    case 'requesting-permissions': {
      if (event.type === 'permissionsGranted') {
        return event.systemAudio
          ? { status: 'recording', startedAt: event.at }
          : { status: 'recording-mic-only', startedAt: event.at, reason: 'unavailable' }
      }
      if (event.type === 'permissionsDenied') {
        // The mic itself was denied — nothing to capture at all.
        return { status: 'error', message: 'Microphone permission denied' }
      }
      return state
    }

    case 'recording': {
      if (event.type === 'systemAudioLost') {
        return { status: 'recording-mic-only', startedAt: state.startedAt, reason: 'unavailable' }
      }
      if (event.type === 'pause') {
        return { status: 'paused', startedAt: state.startedAt, micOnly: false }
      }
      if (event.type === 'stop') {
        return { status: 'enhancing', startedAt: state.startedAt, endedAt: event.at }
      }
      return state
    }

    case 'recording-mic-only': {
      if (event.type === 'pause') {
        return { status: 'paused', startedAt: state.startedAt, micOnly: true }
      }
      if (event.type === 'stop') {
        return { status: 'enhancing', startedAt: state.startedAt, endedAt: event.at }
      }
      return state
    }

    case 'paused': {
      if (event.type === 'resume') {
        return state.micOnly
          ? { status: 'recording-mic-only', startedAt: state.startedAt, reason: 'unavailable' }
          : { status: 'recording', startedAt: state.startedAt }
      }
      if (event.type === 'stop') {
        return { status: 'enhancing', startedAt: state.startedAt, endedAt: event.at }
      }
      return state
    }

    case 'enhancing': {
      if (event.type === 'enhanced' || event.type === 'skipEnhancement') {
        return { status: 'done', startedAt: state.startedAt, endedAt: state.endedAt }
      }
      return state
    }

    case 'done':
    case 'error':
      return state
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface MeetingCaptureOptions {
  /** The engine transcribing both channels (resolved via `selectEngine`). */
  engine: DictationEngine
  /** Language hint forwarded to the engine. */
  language?: string
  /** Receives one batched transcript upsert per flush interval. */
  onTranscript: (snapshot: TranscriptSnapshot) => void | Promise<void>
  /** Live per-segment callback for the in-meeting transcript view. */
  onSegment?: (segment: MeetingSegment) => void
  /** Transcription errors are reported, not thrown — capture must not die. */
  onError?: (error: unknown, channel: MeetingChannel) => void
  /** VAD tuning; `sampleRate` is per-channel via `pushAudio`. */
  vad?: Omit<VadOptions, 'sampleRate'>
  /** Batching cadence (default 30s — ≤ ~120 upserts per hour). */
  flushIntervalMs?: number
  /** Injected clock for tests. */
  now?: () => number
}

/**
 * Pumps PCM from the platform's capture streams through VAD → engine →
 * batcher. Transcriptions run per channel, serialized within a channel (chunks
 * arrive in order) and concurrent across channels.
 */
export class MeetingCaptureSession {
  private readonly options: MeetingCaptureOptions
  private readonly batcher: SegmentBatcher
  private readonly chunkers = new Map<MeetingChannel, VadChunker>()
  private readonly sampleRates = new Map<MeetingChannel, number>()
  /** Per-channel transcription queue tail — keeps a channel's chunks ordered. */
  private readonly tails = new Map<MeetingChannel, Promise<void>>()
  private stopped = false

  constructor(options: MeetingCaptureOptions) {
    this.options = options
    this.batcher = new SegmentBatcher(options.onTranscript, {
      flushIntervalMs: options.flushIntervalMs,
      now: options.now
    })
  }

  /**
   * Feed PCM for one channel. The first push fixes the channel's sample rate;
   * platforms resample upstream if their source rate changes.
   */
  pushAudio(channel: MeetingChannel, samples: Float32Array, sampleRate: number): void {
    if (this.stopped) return
    let chunker = this.chunkers.get(channel)
    if (!chunker) {
      chunker = new VadChunker({ ...this.options.vad, sampleRate })
      this.chunkers.set(channel, chunker)
      this.sampleRates.set(channel, sampleRate)
    }
    for (const chunk of chunker.push(samples)) {
      this.enqueue(channel, chunk)
    }
  }

  /** Flush trailing speech on both channels and stop accepting audio. */
  async stop(): Promise<TranscriptSnapshot> {
    this.stopped = true
    for (const [channel, chunker] of this.chunkers) {
      for (const chunk of chunker.end()) this.enqueue(channel, chunk)
    }
    // Wait for in-flight transcriptions, then force the final upsert.
    await Promise.all(this.tails.values())
    await this.batcher.flush()
    return this.batcher.snapshot()
  }

  /** The accumulated transcript so far (live view). */
  snapshot(): TranscriptSnapshot {
    return this.batcher.snapshot()
  }

  /** Upserts issued so far (change-log hygiene: ≤ ~120 per hour). */
  get upserts(): number {
    return this.batcher.flushes
  }

  private enqueue(channel: MeetingChannel, chunk: VadChunk): void {
    const sampleRate = this.sampleRates.get(channel) ?? 16_000
    const tail = this.tails.get(channel) ?? Promise.resolve()
    const next = tail.then(async () => {
      try {
        const result = await this.options.engine.transcribe(
          { kind: 'pcm', samples: chunk.samples, sampleRate },
          { language: this.options.language }
        )
        if (result.text.trim().length === 0) return
        const segment: MeetingSegment = {
          channel,
          text: result.text,
          startMs: chunk.startMs,
          endMs: chunk.endMs
        }
        this.options.onSegment?.(segment)
        await this.batcher.push(segment)
      } catch (error) {
        this.options.onError?.(error, channel)
      }
    })
    this.tails.set(channel, next)
  }
}
