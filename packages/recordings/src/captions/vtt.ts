/**
 * WebVTT caption generation (exploration 0414, phase 4).
 *
 * Transcript segments are stored on the SOURCE timeline, but a caption file is
 * consumed by a player showing the EDITED timeline. Emitting source offsets
 * would drift further out of sync with every cut, so cues are mapped through
 * the EDL here, and cues that fall entirely inside a cut are dropped rather
 * than collapsed onto a zero-length cue at the seam.
 */

import type { Cut, RecordingSegment } from '@xnetjs/data'
import { activeCuts, sourceToEdited } from '../edl/edl'

/** `HH:MM:SS.mmm`, the only timestamp form WebVTT accepts. */
export function formatVttTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms))
  const hours = Math.floor(clamped / 3_600_000)
  const minutes = Math.floor((clamped % 3_600_000) / 60_000)
  const seconds = Math.floor((clamped % 60_000) / 1_000)
  const millis = clamped % 1_000
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`
}

export interface VttCue {
  startMs: number
  endMs: number
  text: string
}

/**
 * Project segments onto the edited timeline. A segment that straddles a cut
 * keeps its surviving portion; one wholly inside a cut disappears with the
 * audio it described.
 */
export function segmentsToCues(
  segments: readonly RecordingSegment[],
  cuts: readonly Cut[] = []
): VttCue[] {
  const cues: VttCue[] = []
  const spans = activeCuts(cuts)

  for (const segment of segments) {
    const text = segment.text.trim()
    if (!text || segment.endMs <= segment.startMs) continue

    const start = sourceToEdited(segment.startMs, cuts)
    // The last instant that still belongs to the segment; using endMs directly
    // would map a segment ending exactly at a cut's start into that cut.
    const end = sourceToEdited(segment.endMs - 1, cuts)

    const swallowed = spans.some(
      (span) => segment.startMs >= span.startMs && segment.endMs <= span.endMs
    )
    if (swallowed) continue

    const endMs = Math.max(start.editedMs + 1, end.editedMs + 1)
    cues.push({ startMs: start.editedMs, endMs, text })
  }

  return cues
}

/** Render a WebVTT file. Returns a header-only file when there are no cues. */
export function toWebVtt(segments: readonly RecordingSegment[], cuts: readonly Cut[] = []): string {
  const cues = segmentsToCues(segments, cuts)
  const body = cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatVttTimestamp(cue.startMs)} --> ${formatVttTimestamp(cue.endMs)}\n${cue.text}`
    )
    .join('\n\n')

  return body ? `WEBVTT\n\n${body}\n` : 'WEBVTT\n'
}
