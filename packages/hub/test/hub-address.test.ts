/**
 * Hub address records (exploration 0423).
 *
 * The properties worth pinning are the failure modes, not the happy path: a
 * resolver outage must degrade to the cached address rather than to "no hub",
 * and a record that fails verification must be discarded rather than followed.
 */

import { generateIdentity } from '@xnetjs/identity'
import { describe, expect, it, vi } from 'vitest'
import {
  canonicalHubAddressBytes,
  dialCandidates,
  isHubAddressFresh,
  resolveHubAddress,
  signHubAddress,
  verifyHubAddress,
  type HubAddressCache,
  type HubAddressRecord,
  type UnsignedHubAddressRecord
} from '../src/services/hub-address'

const hub = generateIdentity()
const OWNER = 'did:key:z6Mkowner00000000000000000000000000000000000'

const unsigned = (over: Partial<UnsignedHubAddressRecord> = {}): UnsignedHubAddressRecord => ({
  did: OWNER,
  hubDid: hub.identity.did,
  url: 'https://alice-hub.example',
  status: 'ready',
  issuedAt: 1_000,
  validUntil: 61_000,
  ...over
})

const signed = (over: Partial<UnsignedHubAddressRecord> = {}): HubAddressRecord =>
  signHubAddress(unsigned(over), hub.privateKey)

const memoryCache = (seed?: HubAddressRecord): HubAddressCache => {
  const map = new Map<string, HubAddressRecord>()
  if (seed) map.set(seed.did, seed)
  return {
    get: (did) => map.get(did) ?? null,
    put: (record) => void map.set(record.did, record)
  }
}

describe('hub address signing', () => {
  it('round-trips sign -> verify', () => {
    expect(verifyHubAddress(signed())).toBe(true)
  })

  it('rejects a record whose url was rewritten after signing', () => {
    const tampered: HubAddressRecord = { ...signed(), url: 'https://attacker.example' }
    expect(verifyHubAddress(tampered)).toBe(false)
  })

  it('rejects a record signed by a different hub', () => {
    const other = generateIdentity()
    const forged = signHubAddress(unsigned(), other.privateKey)
    expect(verifyHubAddress(forged)).toBe(false)
  })

  it('returns false rather than throwing on a malformed did or proof', () => {
    expect(verifyHubAddress({ ...signed(), hubDid: 'not-a-did' })).toBe(false)
    expect(verifyHubAddress({ ...signed(), proof: '!!!not base64!!!' })).toBe(false)
  })

  it('matches the canonical byte fixture the control plane mirrors', () => {
    // `apps/cloud/src/address-mirror.test.ts` pins this exact string. The
    // control plane re-implements this serializer rather than depending on the
    // hub package, so the pair of fixtures is what stops the two from drifting
    // into silently rejecting every record in production.
    expect(
      new TextDecoder().decode(
        canonicalHubAddressBytes({
          did: 'did:key:zOWNER',
          hubDid: 'did:key:zHUB',
          url: 'https://hub.example',
          status: 'ready',
          issuedAt: 1_000,
          validUntil: 61_000
        })
      )
    ).toBe(
      '["xnet-hub-address-v1","did:key:zOWNER","did:key:zHUB","https://hub.example",[],"ready",null,1000,61000]'
    )
  })

  it('canonical bytes do not depend on key insertion order', () => {
    const a = unsigned()
    const b: UnsignedHubAddressRecord = {
      validUntil: a.validUntil,
      issuedAt: a.issuedAt,
      status: a.status,
      url: a.url,
      hubDid: a.hubDid,
      did: a.did
    }
    expect(canonicalHubAddressBytes(b)).toEqual(canonicalHubAddressBytes(a))
  })

  it('covers the fallback list, so alternates cannot be injected', () => {
    const record = signed({ fallbacks: ['https://backup.example'] })
    expect(verifyHubAddress(record)).toBe(true)
    expect(verifyHubAddress({ ...record, fallbacks: ['https://attacker.example'] })).toBe(false)
  })
})

describe('freshness and dial order', () => {
  it('is fresh strictly before validUntil', () => {
    const record = signed({ validUntil: 61_000 })
    expect(isHubAddressFresh(record, 60_999)).toBe(true)
    expect(isHubAddressFresh(record, 61_000)).toBe(false)
  })

  it('dials the primary first, then fallbacks, skipping empties', () => {
    expect(dialCandidates(signed({ fallbacks: ['https://b.example'] }))).toEqual([
      'https://alice-hub.example',
      'https://b.example'
    ])
    expect(dialCandidates(signed({ url: '', status: 'waking' }))).toEqual([])
  })
})

describe('resolveHubAddress', () => {
  it('skips the network while the cached record is fresh', async () => {
    const fetchRecord = vi.fn(async () => signed())
    const out = await resolveHubAddress(OWNER, {
      fetchRecord,
      cache: memoryCache(signed()),
      nowMs: () => 0
    })
    expect(out).toMatchObject({ kind: 'resolved', source: 'cache' })
    expect(fetchRecord).not.toHaveBeenCalled()
  })

  it('re-resolves once the cached record expires, and caches the answer', async () => {
    const cache = memoryCache(signed({ url: 'https://old.example' }))
    const out = await resolveHubAddress(OWNER, {
      fetchRecord: async () => signed({ url: 'https://new.example', validUntil: 200_000 }),
      cache,
      nowMs: () => 100_000
    })
    expect(out).toMatchObject({ kind: 'resolved', source: 'network' })
    expect(cache.get(OWNER)?.url).toBe('https://new.example')
  })

  it('falls back to a STALE cache when the resolver throws', async () => {
    const out = await resolveHubAddress(OWNER, {
      fetchRecord: async () => {
        throw new Error('ECONNREFUSED')
      },
      cache: memoryCache(signed({ url: 'https://last-known.example' })),
      nowMs: () => 100_000
    })
    expect(out.kind).toBe('resolved')
    if (out.kind === 'resolved') {
      expect(out.source).toBe('cache')
      expect(out.record.url).toBe('https://last-known.example')
    }
  })

  it('is unresolvable — never a successful empty — with no cache and a dead resolver', async () => {
    const out = await resolveHubAddress(OWNER, {
      fetchRecord: async () => {
        throw new Error('ECONNREFUSED')
      },
      cache: memoryCache(),
      nowMs: () => 0
    })
    expect(out.kind).toBe('unresolvable')
    if (out.kind === 'unresolvable') expect(out.reason).toMatch(/unreachable/)
  })

  it('distinguishes "resolver has no such name" from "resolver is down"', async () => {
    const out = await resolveHubAddress(OWNER, {
      fetchRecord: async () => null,
      cache: memoryCache(),
      nowMs: () => 0
    })
    expect(out).toMatchObject({ kind: 'unresolvable' })
    if (out.kind === 'unresolvable') expect(out.reason).toMatch(/no address record/)
  })

  it('discards an unverifiable record rather than following it', async () => {
    const attacker = generateIdentity()
    const forged = signHubAddress(unsigned({ url: 'https://attacker.example' }), attacker.privateKey)
    const out = await resolveHubAddress(OWNER, {
      fetchRecord: async () => forged,
      cache: memoryCache(),
      nowMs: () => 0
    })
    expect(out).toMatchObject({ kind: 'unresolvable' })
    if (out.kind === 'unresolvable') expect(out.reason).toMatch(/signature verification/)
  })

  it('prefers a stale cached record over an unverifiable fresh one', async () => {
    const attacker = generateIdentity()
    const out = await resolveHubAddress(OWNER, {
      fetchRecord: async () =>
        signHubAddress(unsigned({ url: 'https://attacker.example' }), attacker.privateKey),
      cache: memoryCache(signed({ url: 'https://trusted.example' })),
      nowMs: () => 100_000
    })
    expect(out.kind).toBe('resolved')
    if (out.kind === 'resolved') expect(out.record.url).toBe('https://trusted.example')
  })

  it('rejects a record answering for a different name', async () => {
    const out = await resolveHubAddress(OWNER, {
      fetchRecord: async () => signed({ did: 'did:key:z6MksomeoneElse' }),
      cache: memoryCache(),
      nowMs: () => 0
    })
    expect(out).toMatchObject({ kind: 'unresolvable' })
    if (out.kind === 'unresolvable') expect(out.reason).toMatch(/expected/)
  })

  it('surfaces a cold hub as waking with a retry hint, not as an outage', async () => {
    const out = await resolveHubAddress(OWNER, {
      fetchRecord: async () => signed({ url: '', status: 'waking', retryAfterMs: 5_000 }),
      cache: memoryCache(),
      nowMs: () => 0
    })
    expect(out.kind).toBe('resolved')
    if (out.kind === 'resolved') {
      expect(out.record.status).toBe('waking')
      expect(out.record.retryAfterMs).toBe(5_000)
      expect(dialCandidates(out.record)).toEqual([])
    }
  })

  it('a migration is one re-resolve, not a reconfiguration', async () => {
    const cache = memoryCache()
    let current = signed({ url: 'https://cloud-run.example', validUntil: 60_000 })
    const deps = { fetchRecord: async () => current, cache, nowMs: () => 0 }

    const before = await resolveHubAddress(OWNER, deps)
    expect(before.kind === 'resolved' && before.record.url).toBe('https://cloud-run.example')

    // Substrate moved. The client's configuration (the DID) did not change.
    current = signed({ url: 'https://fargate.example', validUntil: 60_000 })
    const after = await resolveHubAddress(OWNER, { ...deps, nowMs: () => 60_000 })
    expect(after.kind === 'resolved' && after.record.url).toBe('https://fargate.example')
  })
})
