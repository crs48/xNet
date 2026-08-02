import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  handledKeys,
  MAX_ATTEMPTS,
  readLedger,
  recordFailure,
  recordPosted,
  seed,
  writeLedger
} from './ledger.mjs'

const NOW = '2026-08-02T09:00:00.000Z'
const tmpLedger = () => join(mkdtempSync(join(tmpdir(), 'syndicate-')), 'log.json')

describe('readLedger', () => {
  it('returns an empty, unseeded ledger when the file is absent', () => {
    const l = readLedger(join(tmpdir(), 'definitely-not-here', 'log.json'))
    expect(l.posted).toEqual([])
    expect(l.failed).toEqual([])
    expect(l.seededAt).toBeNull()
  })

  it('refuses to treat corrupt JSON as "nothing posted"', () => {
    const path = tmpLedger()
    writeFileSync(path, '{ not json')
    // The dangerous failure mode: a corrupt ledger reading as empty would
    // re-announce the entire backlog.
    expect(() => readLedger(path)).toThrow(/refusing to run/)
  })

  it('refuses a ledger missing its arrays', () => {
    const path = tmpLedger()
    writeFileSync(path, JSON.stringify({ version: 1 }))
    expect(() => readLedger(path)).toThrow(/posted\/failed/)
  })

  it('round-trips through writeLedger', () => {
    const path = tmpLedger()
    const l = readLedger(path)
    recordPosted(l, { key: 'blog:a', kind: 'blog', url: 'u', text: 't', bluesky: { uri: 'at://x' } }, NOW)
    writeLedger(l, path)
    expect(readLedger(path).posted).toHaveLength(1)
  })
})

describe('handledKeys', () => {
  it('includes posted items', () => {
    const l = readLedger(tmpLedger())
    recordPosted(l, { key: 'blog:a', kind: 'blog', url: 'u', text: 't', bluesky: {} }, NOW)
    expect(handledKeys(l).has('blog:a')).toBe(true)
  })

  it('keeps retrying a failure until the attempt cap', () => {
    const l = readLedger(tmpLedger())
    recordFailure(l, { key: 'blog:a', url: 'u' }, new Error('boom'), NOW)
    expect(handledKeys(l).has('blog:a')).toBe(false)
  })

  it('gives up after the cap, without dropping the record', () => {
    const l = readLedger(tmpLedger())
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      recordFailure(l, { key: 'blog:a', url: 'u' }, new Error('boom'), NOW)
    }
    expect(handledKeys(l).has('blog:a')).toBe(true)
    // "Gave up" and "never seen" must be distinguishable.
    expect(l.failed[0]).toMatchObject({ key: 'blog:a', attempts: MAX_ATTEMPTS, lastError: 'boom' })
  })
})

describe('recordFailure', () => {
  it('counts attempts per key rather than appending duplicates', () => {
    const l = readLedger(tmpLedger())
    recordFailure(l, { key: 'blog:a', url: 'u' }, new Error('one'), NOW)
    recordFailure(l, { key: 'blog:a', url: 'u' }, new Error('two'), NOW)
    expect(l.failed).toHaveLength(1)
    expect(l.failed[0].attempts).toBe(2)
    expect(l.failed[0].lastError).toBe('two')
  })
})

describe('recordPosted', () => {
  it('clears an earlier failure for the same key', () => {
    const l = readLedger(tmpLedger())
    recordFailure(l, { key: 'blog:a', url: 'u' }, new Error('transient'), NOW)
    recordPosted(l, { key: 'blog:a', kind: 'blog', url: 'u', text: 't', bluesky: {} }, NOW)
    expect(l.failed).toEqual([])
    expect(l.posted).toHaveLength(1)
  })
})

describe('seed', () => {
  it('adopts the backlog without announcing it', () => {
    const l = readLedger(tmpLedger())
    seed(l, [{ key: 'blog:a', kind: 'blog', url: 'u' }, { key: 'blog:b', kind: 'blog', url: 'v' }], NOW)
    expect(l.seededAt).toBe(NOW)
    expect(l.posted.every((p) => p.seeded)).toBe(true)
    expect(handledKeys(l)).toEqual(new Set(['blog:a', 'blog:b']))
  })
})
