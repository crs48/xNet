import { describe, expect, it } from 'vitest'
import { applyRetention, transcriptsToPrune, type Retainable } from './retention'

const NOW = 1_000_000_000_000
const DAY = 24 * 60 * 60 * 1000

function item(id: string, ageDays: number, starred = false): Retainable {
  return { id, createdAt: NOW - ageDays * DAY, starred }
}

describe('applyRetention', () => {
  it('keeps everything when the policy is empty', () => {
    const items = [item('a', 1), item('b', 2)]
    const { keep, prune } = applyRetention(items, {}, NOW)
    expect(keep).toHaveLength(2)
    expect(prune).toHaveLength(0)
  })

  it('caps to the newest maxItems', () => {
    const items = [item('old', 3), item('mid', 2), item('new', 1)]
    const { keep, prune } = applyRetention(items, { maxItems: 2 }, NOW)
    expect(keep.map((i) => i.id)).toEqual(['new', 'mid'])
    expect(prune.map((i) => i.id)).toEqual(['old'])
  })

  it('prunes items older than maxAgeMs', () => {
    const items = [item('fresh', 1), item('stale', 10)]
    const { keep, prune } = applyRetention(items, { maxAgeMs: 7 * DAY }, NOW)
    expect(keep.map((i) => i.id)).toEqual(['fresh'])
    expect(prune.map((i) => i.id)).toEqual(['stale'])
  })

  it('keeps starred items regardless of age or count, and they do not count toward maxItems', () => {
    const items = [item('starred-old', 100, true), item('a', 1), item('b', 2), item('c', 3)]
    const { keep, prune } = applyRetention(
      items,
      { maxItems: 2, maxAgeMs: 7 * DAY, keepStarred: true },
      NOW
    )
    expect(keep.map((i) => i.id).sort()).toEqual(['a', 'b', 'starred-old'])
    expect(prune.map((i) => i.id)).toEqual(['c'])
  })

  it('does not mutate the input array', () => {
    const items = [item('a', 2), item('b', 1)]
    const copy = [...items]
    applyRetention(items, { maxItems: 1 }, NOW)
    expect(items).toEqual(copy)
  })

  it('transcriptsToPrune returns just the doomed ids', () => {
    const items = [item('keep', 1), item('drop', 30)]
    expect(transcriptsToPrune(items, { maxAgeMs: 7 * DAY }, NOW)).toEqual(['drop'])
  })
})
