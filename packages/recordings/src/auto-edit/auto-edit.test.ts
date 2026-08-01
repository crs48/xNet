import type { RecordingSegment } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { editedDurationMs } from '../edl/edl'
import { proposeFillerCuts } from './filler'
import { proposeSilenceCuts } from './silence'

describe('proposeSilenceCuts', () => {
  const speech = [
    { startMs: 0, endMs: 3_000 },
    { startMs: 8_000, endMs: 11_000 }
  ]

  it('cuts the gap between speech spans, padded on both sides', () => {
    const cuts = proposeSilenceCuts(speech, 11_000, { minGapMs: 400, paddingMs: 120 })

    expect(cuts).toEqual([{ startMs: 3_120, endMs: 7_880, reason: 'silence', enabled: true }])
  })

  it('cuts a trailing silence at the end of the recording', () => {
    const cuts = proposeSilenceCuts([{ startMs: 0, endMs: 3_000 }], 10_000)

    expect(cuts).toHaveLength(1)
    expect(cuts[0]?.endMs).toBe(9_880)
  })

  it('cuts a leading silence before the first word', () => {
    const cuts = proposeSilenceCuts([{ startMs: 5_000, endMs: 8_000 }], 8_000)

    expect(cuts[0]).toMatchObject({ startMs: 120, endMs: 4_880 })
  })

  it('leaves short pauses alone — breath is not dead air', () => {
    expect(
      proposeSilenceCuts(
        [
          { startMs: 0, endMs: 1_000 },
          { startMs: 1_300, endMs: 2_000 }
        ],
        2_000,
        { minGapMs: 400 }
      )
    ).toEqual([])
  })

  it('respects fromMs — nothing before the lead-in is ever cut', () => {
    const cuts = proposeSilenceCuts([{ startMs: 6_000, endMs: 9_000 }], 9_000, { fromMs: 5_000 })

    for (const cut of cuts) expect(cut.startMs).toBeGreaterThanOrEqual(5_000)
    expect(
      proposeSilenceCuts([{ startMs: 6_000, endMs: 9_000 }], 9_000, { fromMs: 5_900 })
    ).toEqual([])
  })

  it('tolerates unsorted and overlapping speech spans', () => {
    const cuts = proposeSilenceCuts(
      [
        { startMs: 8_000, endMs: 11_000 },
        { startMs: 0, endMs: 3_000 },
        { startMs: 2_000, endMs: 4_000 }
      ],
      11_000
    )

    expect(cuts).toEqual([{ startMs: 4_120, endMs: 7_880, reason: 'silence', enabled: true }])
  })

  it('produces cuts that shorten the recording by the expected amount', () => {
    const cuts = proposeSilenceCuts(speech, 11_000)

    expect(editedDurationMs(11_000, cuts)).toBe(11_000 - (7_880 - 3_120))
  })

  it('never proposes an inverted span when padding exceeds the gap', () => {
    const cuts = proposeSilenceCuts(
      [
        { startMs: 0, endMs: 1_000 },
        { startMs: 1_500, endMs: 2_000 }
      ],
      2_000,
      { minGapMs: 100, paddingMs: 400 }
    )

    for (const cut of cuts) expect(cut.endMs).toBeGreaterThan(cut.startMs)
  })
})

describe('proposeFillerCuts', () => {
  const verbatimSegments: RecordingSegment[] = [
    {
      text: 'So um this is the dashboard uh basically',
      startMs: 0,
      endMs: 4_000,
      words: [
        { text: 'So', startMs: 0, endMs: 200 },
        { text: 'um', startMs: 220, endMs: 560 },
        { text: 'this', startMs: 600, endMs: 800 },
        { text: 'Uh,', startMs: 2_000, endMs: 2_300 },
        { text: 'basically', startMs: 2_400, endMs: 3_000 }
      ]
    }
  ]

  it('refuses when the engine is not verbatim, and says why', () => {
    const result = proposeFillerCuts(verbatimSegments, false)

    expect(result.supported).toBe(false)
    if (result.supported) throw new Error('expected refusal')
    expect(result.reason).toBe('not-verbatim')
    expect(result.explanation).toMatch(/removes filler words/)
  })

  it('refuses when word timings are absent', () => {
    const result = proposeFillerCuts([{ text: 'um hello', startMs: 0, endMs: 1_000 }], true)

    expect(result.supported).toBe(false)
    if (result.supported) throw new Error('expected refusal')
    expect(result.reason).toBe('no-word-timings')
  })

  it('cuts fillers regardless of case and punctuation', () => {
    const result = proposeFillerCuts(verbatimSegments, true, { paddingMs: 20 })

    expect(result.supported).toBe(true)
    if (!result.supported) throw new Error('expected support')
    expect(result.cuts).toEqual([
      { startMs: 240, endMs: 540, reason: 'filler', enabled: true },
      { startMs: 2_020, endMs: 2_280, reason: 'filler', enabled: true }
    ])
  })

  it('skips suspiciously long hits — probably a real word', () => {
    const result = proposeFillerCuts(
      [
        {
          text: 'ah',
          startMs: 0,
          endMs: 3_000,
          words: [{ text: 'ah', startMs: 0, endMs: 2_500 }]
        }
      ],
      true,
      { maxWordMs: 1_200 }
    )

    expect(result.supported && result.cuts).toEqual([])
  })

  it('leaves ordinary words alone', () => {
    const result = proposeFillerCuts(
      [
        {
          text: 'like you know',
          startMs: 0,
          endMs: 900,
          words: [
            { text: 'like', startMs: 0, endMs: 300 },
            { text: 'you', startMs: 300, endMs: 600 },
            { text: 'know', startMs: 600, endMs: 900 }
          ]
        }
      ],
      true
    )

    expect(result.supported && result.cuts).toEqual([])
  })
})
