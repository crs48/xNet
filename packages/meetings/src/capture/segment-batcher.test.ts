import type { MeetingSegment } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { SegmentBatcher, type TranscriptSnapshot } from './segment-batcher'

const seg = (channel: 'me' | 'them', text: string, startMs: number): MeetingSegment => ({
  channel,
  text,
  startMs,
  endMs: startMs + 1_000
})

const harness = () => {
  let clock = 0
  const flushed: TranscriptSnapshot[] = []
  const batcher = new SegmentBatcher((snapshot) => void flushed.push(snapshot), {
    flushIntervalMs: 30_000,
    now: () => clock
  })
  return { batcher, flushed, tick: (ms: number) => (clock += ms) }
}

describe('SegmentBatcher', () => {
  it('flushes at most once per interval, not per segment', async () => {
    const { batcher, flushed, tick } = harness()

    await batcher.push(seg('me', 'one', 0)) // first push flushes (lastFlush=-inf)
    for (let i = 1; i <= 20; i++) {
      tick(1_000)
      await batcher.push(seg('them', `part ${i}`, i * 1_000))
    }
    expect(flushed).toHaveLength(1)

    tick(30_000)
    await batcher.push(seg('me', 'later', 60_000))
    expect(flushed).toHaveLength(2)
    expect(flushed[1].segments).toHaveLength(22)
  })

  it('a 60-minute meeting stays under ~120 upserts (0249 hygiene)', async () => {
    const { batcher, tick } = harness()
    // One segment every 5s for an hour = 720 segments.
    for (let i = 0; i < 720; i++) {
      await batcher.push(seg(i % 2 ? 'me' : 'them', `s${i}`, i * 5_000))
      tick(5_000)
    }
    await batcher.flush()
    expect(batcher.flushes).toBeLessThanOrEqual(121)
  })

  it('orders segments by startMs across concurrently-transcribing channels', async () => {
    const { batcher } = harness()
    await batcher.push(seg('them', 'second', 4_000))
    await batcher.push(seg('me', 'first', 1_000))
    await batcher.push(seg('them', 'third', 9_000))
    const snapshot = batcher.snapshot()
    expect(snapshot.segments.map((s) => s.text)).toEqual(['first', 'second', 'third'])
    expect(snapshot.fullText).toBe('first second third')
    expect(snapshot.durationMs).toBe(10_000)
  })

  it('drops empty-text segments and makes flush() a no-op when clean', async () => {
    const { batcher, flushed } = harness()
    await batcher.push(seg('me', '   ', 0))
    await batcher.flush()
    expect(flushed).toHaveLength(0)

    await batcher.push(seg('me', 'real', 0))
    await batcher.flush()
    await batcher.flush() // nothing new — no second upsert
    expect(flushed).toHaveLength(1)
  })
})
