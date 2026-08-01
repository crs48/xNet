/**
 * Dead-air trimming (exploration 0414, phase 3).
 *
 * The VAD in `@xnetjs/meetings` already splits a PCM stream into speech
 * chunks; the *gaps between those chunks* are the dead air. Nothing new is
 * measured here — this reads boundaries 0279 already produces and turns them
 * into cut proposals.
 *
 * Two safeguards are deliberate:
 *
 * - **Padding.** A cut that starts the instant energy drops clips the tail of
 *   the last consonant. Every proposal leaves `paddingMs` of silence on each
 *   side, which is why a gap must exceed `minGapMs + 2 × paddingMs` to be
 *   worth cutting at all.
 * - **Proposals, never deletions.** Cuts come back `enabled` but fully
 *   reversible and countable. A quiet aside misclassified as silence is
 *   content the user cannot know is missing unless the UI can list what went
 *   (0414 §Risks).
 */

import type { Cut } from '@xnetjs/data'
import type { VadChunk } from '@xnetjs/meetings'

export interface SilenceTrimOptions {
  /**
   * Gaps shorter than this are breath and thought, not dead air. Default
   * 400 ms — below roughly a third of a second, cutting reads as clipped.
   */
  minGapMs?: number
  /** Silence left on each side of a cut so consonants survive. Default 120 ms. */
  paddingMs?: number
  /** Ignore anything before this offset, e.g. an intentional lead-in. */
  fromMs?: number
}

/** A speech span on the source timeline — the shape `VadChunk` exposes. */
export type SpeechSpan = Pick<VadChunk, 'startMs' | 'endMs'>

/**
 * Propose cuts for every gap between speech spans, plus the head and tail.
 *
 * `spans` need not be sorted; overlapping spans are tolerated because the
 * cursor only ever moves forward.
 */
export function proposeSilenceCuts(
  spans: readonly SpeechSpan[],
  durationMs: number,
  options: SilenceTrimOptions = {}
): Cut[] {
  const { minGapMs = 400, paddingMs = 120, fromMs = 0 } = options
  const minSpan = minGapMs + paddingMs * 2

  const sorted = [...spans]
    .filter((span) => span.endMs > span.startMs)
    .sort((a, b) => a.startMs - b.startMs)

  const cuts: Cut[] = []
  let cursor = fromMs

  const push = (startMs: number, endMs: number): void => {
    if (endMs - startMs < minSpan) return
    cuts.push({
      startMs: startMs + paddingMs,
      endMs: endMs - paddingMs,
      reason: 'silence',
      enabled: true
    })
  }

  for (const span of sorted) {
    if (span.startMs > cursor) push(cursor, span.startMs)
    cursor = Math.max(cursor, span.endMs)
  }
  if (durationMs > cursor) push(cursor, durationMs)

  return cuts
}
