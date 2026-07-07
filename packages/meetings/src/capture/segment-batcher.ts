/**
 * Segment batcher (exploration 0279).
 *
 * Transcribed chunks arrive every few seconds during a live meeting. Writing
 * each one to the change log would recreate the 0249 bloat problem (a 60-min
 * meeting must produce ≤ ~120 upserts, not thousands), so this batcher
 * accumulates segments and flushes one LWW upsert per `flushIntervalMs` of
 * wall-clock time — the sink rewrites the `MeetingTranscript` node's
 * `segments` + `fullText` with the full accumulated state each time
 * (last-write-wins, so a rewrite is one change-log row regardless of size).
 *
 * The clock is injected so tests don't sleep.
 */

import type { MeetingSegment } from '@xnetjs/data'

/** What a flush hands to the persistence layer. */
export interface TranscriptSnapshot {
  /** All segments so far, ordered by startMs. */
  segments: MeetingSegment[]
  /** Concatenated text of all segments (FTS payload). */
  fullText: string
  /** End of the latest segment, ms — the transcript's running duration. */
  durationMs: number
}

export interface SegmentBatcherOptions {
  /** Minimum wall-clock time between flushes, ms. Default 30_000 (0279). */
  flushIntervalMs?: number
  /** Injected clock (ms). Defaults to Date.now. */
  now?: () => number
}

export class SegmentBatcher {
  private readonly flushIntervalMs: number
  private readonly now: () => number
  private readonly sink: (snapshot: TranscriptSnapshot) => void | Promise<void>

  private segments: MeetingSegment[] = []
  private dirty = false
  private lastFlushAt = -Infinity
  private flushCount = 0

  constructor(
    sink: (snapshot: TranscriptSnapshot) => void | Promise<void>,
    options: SegmentBatcherOptions = {}
  ) {
    this.sink = sink
    this.flushIntervalMs = options.flushIntervalMs ?? 30_000
    this.now = options.now ?? Date.now
  }

  /** Add one transcribed segment; flushes when the interval has elapsed. */
  push(segment: MeetingSegment): Promise<void> | void {
    if (segment.text.trim().length === 0) return
    // Insert keeping startMs order — channels transcribe concurrently, so
    // arrival order is not timeline order.
    const at = this.segments.findIndex((s) => s.startMs > segment.startMs)
    if (at === -1) this.segments.push(segment)
    else this.segments.splice(at, 0, segment)
    this.dirty = true

    if (this.now() - this.lastFlushAt >= this.flushIntervalMs) {
      return this.flush()
    }
  }

  /** Force a flush (stop/pause). No-op when nothing changed since the last one. */
  async flush(): Promise<void> {
    if (!this.dirty) return
    this.dirty = false
    this.lastFlushAt = this.now()
    this.flushCount += 1
    await this.sink(this.snapshot())
  }

  /** The accumulated transcript state (cheap copy; segments are shared). */
  snapshot(): TranscriptSnapshot {
    return {
      segments: [...this.segments],
      fullText: this.segments.map((s) => s.text).join(' '),
      durationMs: this.segments.reduce((max, s) => Math.max(max, s.endMs), 0)
    }
  }

  /** How many upserts this batcher has issued (change-log hygiene checks). */
  get flushes(): number {
    return this.flushCount
  }
}
