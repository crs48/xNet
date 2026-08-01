/**
 * Filler-word cutting (exploration 0414, phase 3) — and the honesty gate in
 * front of it.
 *
 * > [!IMPORTANT]
 * > Whisper and Parakeet are trained to emit *clean* text: they delete "um"
 * > and "uh" before any consumer sees them. You cannot cut a word the
 * > transcript does not contain. Shipping a "remove filler words" button over
 * > those engines produces a control that silently does nothing — exactly the
 * > failure the root AGENTS.md forbids.
 *
 * So this module refuses rather than pretends. `proposeFillerCuts` returns a
 * discriminated result: `unsupported` when the transcript did not come from a
 * verbatim engine, and only then a cut list. The UI reads that tag to hide or
 * explain the control instead of offering a no-op.
 *
 * Cutting also needs *word-level* timings — sentence-level segments cannot
 * locate a 200 ms "um" inside them. Both conditions are checked separately so
 * the reason a user sees is the true one.
 */

import type { Cut, RecordingSegment } from '@xnetjs/data'

/**
 * Single-token fillers, matched case-insensitively after stripping
 * punctuation. Deliberately short: "like" and "you know" are ordinary speech
 * far more often than they are filler, and cutting them mangles meaning.
 */
export const DEFAULT_FILLER_WORDS = ['um', 'uh', 'umm', 'uhh', 'erm', 'ah', 'mm', 'hmm'] as const

export interface FillerCutOptions {
  /** Override the filler vocabulary. */
  fillerWords?: readonly string[]
  /** Padding trimmed from each side of the word, ms. Default 40. */
  paddingMs?: number
  /** Ignore hits longer than this — probably a real word. Default 1200 ms. */
  maxWordMs?: number
}

export type FillerCutResult =
  | { supported: true; cuts: Cut[] }
  | { supported: false; reason: 'not-verbatim' | 'no-word-timings'; explanation: string }

const normalize = (word: string): string => word.toLowerCase().replace(/[^a-z]/g, '')

/**
 * Propose a cut per filler word, or explain why it cannot.
 *
 * @param segments transcript segments on the SOURCE timeline
 * @param verbatim whether the producing engine preserves disfluencies
 */
export function proposeFillerCuts(
  segments: readonly RecordingSegment[],
  verbatim: boolean,
  options: FillerCutOptions = {}
): FillerCutResult {
  if (!verbatim) {
    return {
      supported: false,
      reason: 'not-verbatim',
      explanation:
        'This transcript came from an engine that removes filler words before you see them, ' +
        'so there is nothing to cut. Re-transcribe with a verbatim engine to enable this.'
    }
  }

  const hasWordTimings = segments.some((segment) => (segment.words?.length ?? 0) > 0)
  if (!hasWordTimings) {
    return {
      supported: false,
      reason: 'no-word-timings',
      explanation:
        'This transcript has no word-level timings, so a filler word cannot be located ' +
        'precisely enough to cut. Sentence-level timings only support manual editing.'
    }
  }

  const { fillerWords = DEFAULT_FILLER_WORDS, paddingMs = 40, maxWordMs = 1_200 } = options
  const vocabulary = new Set(fillerWords.map(normalize))

  const cuts: Cut[] = []
  for (const segment of segments) {
    for (const word of segment.words ?? []) {
      if (!vocabulary.has(normalize(word.text))) continue
      const durationMs = word.endMs - word.startMs
      if (durationMs <= 0 || durationMs > maxWordMs) continue
      const startMs = word.startMs + paddingMs
      const endMs = word.endMs - paddingMs
      if (endMs <= startMs) continue
      cuts.push({ startMs, endMs, reason: 'filler', enabled: true })
    }
  }

  return { supported: true, cuts }
}
