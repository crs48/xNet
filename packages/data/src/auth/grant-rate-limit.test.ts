import type { DID } from '@xnet/core'
import { describe, expect, it } from 'vitest'
import { GrantRateLimiter } from './grant-rate-limit'

describe('GrantRateLimiter', () => {
  it('allows up to 10 grant attempts per minute by default', () => {
    const peerDid = 'did:key:peer-a' as DID
    let now = 1000
    const limiter = new GrantRateLimiter({ now: () => now })

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(limiter.allow(peerDid)).toBe(true)
      now += 100
    }

    expect(limiter.allow(peerDid)).toBe(false)
  })

  it('resets quota after the time window elapses', () => {
    const peerDid = 'did:key:peer-b' as DID
    let now = 5000
    const limiter = new GrantRateLimiter({ now: () => now })

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(limiter.allow(peerDid)).toBe(true)
    }
    expect(limiter.allow(peerDid)).toBe(false)

    now += 60_001
    expect(limiter.allow(peerDid)).toBe(true)
  })

  it('tracks limits independently per peer', () => {
    const peerA = 'did:key:peer-a' as DID
    const peerB = 'did:key:peer-b' as DID
    const limiter = new GrantRateLimiter({
      now: () => 10_000,
      limitPerMinute: 1
    })

    expect(limiter.allow(peerA)).toBe(true)
    expect(limiter.allow(peerA)).toBe(false)

    expect(limiter.allow(peerB)).toBe(true)
    expect(limiter.allow(peerB)).toBe(false)
  })
})
