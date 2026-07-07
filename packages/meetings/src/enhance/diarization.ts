/**
 * Speaker diarization upgrade (exploration 0279, phase 4 — optional).
 *
 * Channel attribution gives Me/Them for free; splitting "Them" into named
 * speakers needs a diarizer. This module defines the PORT (cloud diarization
 * via a byo endpoint, or local pyannote, both plug in the same way) and the
 * pure merge that maps diarizer turns onto existing transcript segments and
 * seeds names from the calendar attendee list.
 *
 * Expectation-setting (from the 0279 research): clean 2-speaker audio
 * diarizes at 95%+; 3-4 speakers sharing one channel drops to 75-85%. The
 * merge therefore only *labels* segments — the channel stays `them`, so the
 * UI can always fall back to channel rendering.
 */

import type { MeetingSegment } from '@xnetjs/data'

/** One diarizer output turn: who spoke when (within the `them` channel). */
export interface SpeakerTurn {
  /** Diarizer-assigned speaker index (0, 1, 2, …). */
  speakerIndex: number
  startMs: number
  endMs: number
}

/** The diarizer port — cloud API or local pyannote, same shape. */
export interface SpeakerDiarizer {
  /** Diarize the `them` channel audio of one meeting. */
  diarize(audio: { samples: Float32Array; sampleRate: number }): Promise<SpeakerTurn[]>
}

/** Overlap (ms) between a segment and a turn. */
const overlap = (segment: MeetingSegment, turn: SpeakerTurn): number =>
  Math.max(0, Math.min(segment.endMs, turn.endMs) - Math.max(segment.startMs, turn.startMs))

/**
 * Label `them` segments with speakers from diarizer turns; `me` segments are
 * untouched (the mic channel is already attributed). Names come from the
 * calendar attendee list in speaker-index order when available, else
 * "Speaker 1/2/…". Pure — safe to re-run when better names arrive.
 */
export function applyDiarization(
  segments: MeetingSegment[],
  turns: SpeakerTurn[],
  attendees: string[] = []
): MeetingSegment[] {
  if (turns.length === 0) return segments

  const nameFor = (index: number): string => attendees[index] ?? `Speaker ${index + 1}`

  return segments.map((segment) => {
    if (segment.channel !== 'them') return segment
    let best: SpeakerTurn | undefined
    let bestOverlap = 0
    for (const turn of turns) {
      const o = overlap(segment, turn)
      if (o > bestOverlap) {
        bestOverlap = o
        best = turn
      }
    }
    // No overlapping turn → leave the channel label; never guess.
    if (!best || bestOverlap === 0) return segment
    return { ...segment, speaker: nameFor(best.speakerIndex) }
  })
}
