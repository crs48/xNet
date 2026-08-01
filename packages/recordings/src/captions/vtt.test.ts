import type { Cut, RecordingSegment } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { formatVttTimestamp, segmentsToCues, toWebVtt } from './vtt'

const segments: RecordingSegment[] = [
  { text: 'First line', startMs: 0, endMs: 2_000 },
  { text: 'Second line', startMs: 3_000, endMs: 5_000 },
  { text: 'Third line', startMs: 6_000, endMs: 8_000 }
]

describe('formatVttTimestamp', () => {
  it('renders HH:MM:SS.mmm', () => {
    expect(formatVttTimestamp(0)).toBe('00:00:00.000')
    expect(formatVttTimestamp(3_661_042)).toBe('01:01:01.042')
  })

  it('clamps negatives rather than emitting an invalid cue', () => {
    expect(formatVttTimestamp(-500)).toBe('00:00:00.000')
  })
})

describe('segmentsToCues', () => {
  it('passes segments through untouched when there are no cuts', () => {
    const cues = segmentsToCues(segments)

    expect(cues).toHaveLength(3)
    expect(cues[1]).toMatchObject({ startMs: 3_000, text: 'Second line' })
  })

  it('shifts later cues onto the edited timeline', () => {
    const cuts: Cut[] = [{ startMs: 2_000, endMs: 3_000, reason: 'silence', enabled: true }]
    const cues = segmentsToCues(segments, cuts)

    expect(cues[1]?.startMs).toBe(2_000)
    expect(cues[2]?.startMs).toBe(5_000)
  })

  it('drops a cue that lives entirely inside a cut', () => {
    const cuts: Cut[] = [{ startMs: 2_900, endMs: 5_100, reason: 'manual', enabled: true }]
    const cues = segmentsToCues(segments, cuts)

    expect(cues.map((cue) => cue.text)).toEqual(['First line', 'Third line'])
  })

  it('ignores disabled cuts', () => {
    const cuts: Cut[] = [{ startMs: 2_900, endMs: 5_100, reason: 'manual', enabled: false }]

    expect(segmentsToCues(segments, cuts)).toHaveLength(3)
  })

  it('skips empty and inverted segments', () => {
    const cues = segmentsToCues([
      { text: '   ', startMs: 0, endMs: 1_000 },
      { text: 'ok', startMs: 2_000, endMs: 1_000 }
    ])

    expect(cues).toEqual([])
  })

  it('never emits a zero-length cue', () => {
    const cuts: Cut[] = [{ startMs: 1_000, endMs: 1_500, reason: 'silence', enabled: true }]

    for (const cue of segmentsToCues(segments, cuts)) {
      expect(cue.endMs).toBeGreaterThan(cue.startMs)
    }
  })
})

describe('toWebVtt', () => {
  it('renders a numbered cue list under a WEBVTT header', () => {
    expect(toWebVtt([segments[0]!])).toBe(
      'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nFirst line\n'
    )
  })

  it('renders a header-only file when nothing survives', () => {
    expect(toWebVtt([])).toBe('WEBVTT\n')
  })
})
