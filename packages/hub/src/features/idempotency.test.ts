import { describe, expect, it } from 'vitest'
import { DeliveryDeduper } from './idempotency'

describe('DeliveryDeduper', () => {
  it('reports first sight as unseen and the next as seen', () => {
    const d = new DeliveryDeduper()
    expect(d.seen('evt-1')).toBe(false)
    expect(d.seen('evt-1')).toBe(true)
    expect(d.seen('evt-2')).toBe(false)
  })

  it('treats falsy ids as never-seen and does not retain them', () => {
    const d = new DeliveryDeduper()
    expect(d.seen(undefined)).toBe(false)
    expect(d.seen('')).toBe(false)
    expect(d.seen(null)).toBe(false)
    expect(d.size).toBe(0)
  })

  it('evicts the oldest id past capacity', () => {
    const d = new DeliveryDeduper(2)
    d.seen('a')
    d.seen('b')
    d.seen('c') // evicts 'a'
    expect(d.size).toBe(2)
    expect(d.seen('a')).toBe(false) // 'a' was evicted, so it reads as new again
    expect(d.seen('c')).toBe(true)
  })

  it('refreshes recency on repeat so a hot id is not evicted', () => {
    const d = new DeliveryDeduper(2)
    d.seen('a')
    d.seen('b')
    d.seen('a') // refresh 'a' → 'b' is now oldest
    d.seen('c') // evicts 'b'
    expect(d.seen('a')).toBe(true)
    expect(d.seen('b')).toBe(false)
  })
})
