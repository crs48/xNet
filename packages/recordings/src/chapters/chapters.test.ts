import type { RecordingSegment } from '@xnetjs/data'
import type { AIProvider } from '@xnetjs/plugins'
import { describe, expect, it } from 'vitest'
import {
  buildChapterMessages,
  formatClock,
  formatTimedTranscript,
  generateChapters,
  parseChapters,
  parseClock
} from './chapters'

const segments: RecordingSegment[] = [
  { text: 'Welcome to the dashboard walkthrough', startMs: 0, endMs: 4_000 },
  { text: 'First we look at the filters panel', startMs: 30_000, endMs: 34_000 },
  { text: 'Finally exporting a report', startMs: 90_000, endMs: 94_000 }
]

describe('clock helpers', () => {
  it('formats MM:SS and switches to H:MM:SS past an hour', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(95_000)).toBe('01:35')
    expect(formatClock(3_725_000)).toBe('1:02:05')
  })

  it('round-trips through parseClock', () => {
    for (const ms of [0, 95_000, 3_725_000]) {
      expect(parseClock(formatClock(ms))).toBe(ms)
    }
  })

  it('returns null on unparseable input rather than guessing zero', () => {
    expect(parseClock('later')).toBeNull()
    expect(parseClock('12')).toBeNull()
  })
})

describe('prompt construction', () => {
  it('renders a timestamped transcript', () => {
    expect(formatTimedTranscript(segments)).toBe(
      '00:00 Welcome to the dashboard walkthrough\n' +
        '00:30 First we look at the filters panel\n' +
        '01:30 Finally exporting a report'
    )
  })

  it('forbids invention in the system prompt', () => {
    const [system] = buildChapterMessages(segments)
    expect(system?.content).toMatch(/Never invent/)
  })
})

describe('parseChapters', () => {
  it('parses well-formed lines and sorts them', () => {
    const { chapters } = parseChapters(
      '01:30 | Exporting a report\n00:00 | Dashboard walkthrough',
      segments
    )

    expect(chapters).toEqual([
      { startMs: 0, title: 'Dashboard walkthrough' },
      { startMs: 90_000, title: 'Exporting a report' }
    ])
  })

  it('snaps a hallucinated offset back to a real segment boundary', () => {
    const { chapters } = parseChapters('00:47 | Filters panel', segments)

    expect(chapters[0]?.startMs).toBe(30_000)
  })

  it('rejects a chapter starting before any segment', () => {
    const { chapters, rejected } = parseChapters('00:00 | Intro', [segments[1]!])

    expect(chapters).toEqual([])
    expect(rejected).toEqual(['00:00 | Intro'])
  })

  it('rejects a title carrying a number the transcript never contained', () => {
    const { chapters, rejected } = parseChapters('00:00 | Reviewing 42 filters', segments)

    expect(chapters).toEqual([])
    expect(rejected).toHaveLength(1)
  })

  it('rejects a title naming a product nobody mentioned', () => {
    const { rejected } = parseChapters('00:00 | Migrating to Snowflake', segments)

    expect(rejected).toEqual(['00:00 | Migrating to Snowflake'])
  })

  it('rejects malformed lines instead of dropping them silently', () => {
    const { chapters, rejected } = parseChapters(
      'Here are your chapters:\n00:00 | Dashboard walkthrough\nnonsense',
      segments
    )

    expect(chapters).toHaveLength(1)
    expect(rejected).toEqual(['Here are your chapters:', 'nonsense'])
  })

  it('deduplicates chapters that snap to the same boundary', () => {
    const { chapters } = parseChapters('00:30 | Filters panel\n00:40 | The filters panel', segments)

    expect(chapters).toHaveLength(1)
  })

  it('strips trailing punctuation from titles', () => {
    const { chapters } = parseChapters('00:00 | Dashboard walkthrough.', segments)

    expect(chapters[0]?.title).toBe('Dashboard walkthrough')
  })
})

describe('generateChapters', () => {
  const provider = (text: string): AIProvider =>
    ({
      id: 'fake',
      generate: async () => text
    }) as unknown as AIProvider

  it('returns parsed chapters from the provider', async () => {
    const result = await generateChapters(provider('00:00 | Dashboard walkthrough'), segments)

    expect(result.chapters).toEqual([{ startMs: 0, title: 'Dashboard walkthrough' }])
  })

  it('returns nothing for an empty transcript without calling the model', async () => {
    let called = false
    const spy = {
      id: 'fake',
      generate: async () => {
        called = true
        return 'x'
      }
    } as unknown as AIProvider

    expect(await generateChapters(spy, [])).toEqual({ chapters: [], rejected: [] })
    expect(called).toBe(false)
  })

  it('returns an empty list rather than fabricated chapters when all are rejected', async () => {
    const result = await generateChapters(provider('00:00 | Migrating to Snowflake'), segments)

    expect(result.chapters).toEqual([])
    expect(result.rejected).toHaveLength(1)
  })
})
