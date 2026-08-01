/**
 * Client-side hub address resolution (exploration 0423).
 */

import { createDIDFromEd25519PublicKey, generateSigningKeyPair, hybridSign } from '@xnetjs/crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  canonicalHubAddressBytes,
  httpResolver,
  readCachedAddress,
  resolveHubUrl,
  verifyHubAddress,
  writeCachedAddress,
  type HubAddressRecord,
  type HubAddressResolution,
  type HubAddressStorage
} from './hub-address-client'

const hubKeys = generateSigningKeyPair()
const HUB_DID = createDIDFromEd25519PublicKey(hubKeys.publicKey)

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const signedRecord = (over: Partial<HubAddressRecord> = {}): HubAddressRecord => {
  const unsigned = {
    did: HUB_DID,
    hubDid: HUB_DID,
    url: 'https://hub.example',
    status: 'ready' as const,
    issuedAt: 1_000,
    validUntil: 61_000,
    ...over
  }
  const sig = hybridSign(canonicalHubAddressBytes(unsigned), { ed25519: hubKeys.privateKey }, 0)
  return { ...unsigned, proof: toBase64(sig.ed25519!) }
}

const memoryStorage = (): HubAddressStorage => {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value)
  }
}

const ready = (record: HubAddressRecord): HubAddressResolution => ({
  record,
  liveness: { status: 'ready' }
})

describe('canonical bytes', () => {
  it('matches the fixture the hub and control plane pin', () => {
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

  it('verifies a hub-signed record and rejects a rewritten one', () => {
    expect(verifyHubAddress(signedRecord())).toBe(true)
    expect(verifyHubAddress({ ...signedRecord(), url: 'https://attacker.example' })).toBe(false)
  })
})

describe('address cache', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage()
    writeCachedAddress(signedRecord(), storage)
    expect(readCachedAddress(HUB_DID, storage)?.url).toBe('https://hub.example')
  })

  it('re-verifies on read — local storage is not a trusted channel', () => {
    const storage = memoryStorage()
    writeCachedAddress({ ...signedRecord(), url: 'https://attacker.example' }, storage)
    expect(readCachedAddress(HUB_DID, storage)).toBeNull()
  })

  it('survives a storage that throws', () => {
    const hostile: HubAddressStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      }
    }
    expect(() => writeCachedAddress(signedRecord(), hostile)).not.toThrow()
    expect(readCachedAddress(HUB_DID, hostile)).toBeNull()
  })
})

describe('resolveHubUrl', () => {
  it('skips the network while the cache is fresh', async () => {
    const storage = memoryStorage()
    writeCachedAddress(signedRecord(), storage)
    const fetchResolution = vi.fn()

    const out = await resolveHubUrl(HUB_DID, {
      fetchResolution: fetchResolution as never,
      storage,
      nowMs: () => 0
    })
    expect(out).toMatchObject({ kind: 'ready', url: 'https://hub.example', stale: false })
    expect(fetchResolution).not.toHaveBeenCalled()
  })

  it('re-resolves after expiry and caches the new address', async () => {
    const storage = memoryStorage()
    writeCachedAddress(signedRecord({ url: 'https://old.example' }), storage)

    const out = await resolveHubUrl(HUB_DID, {
      fetchResolution: async () =>
        ready(signedRecord({ url: 'https://new.example', validUntil: 200_000 })),
      storage,
      nowMs: () => 100_000
    })
    expect(out).toMatchObject({ kind: 'ready', url: 'https://new.example' })
    expect(readCachedAddress(HUB_DID, storage)?.url).toBe('https://new.example')
  })

  it('falls back to a STALE cached address when the resolver is down', async () => {
    const storage = memoryStorage()
    writeCachedAddress(signedRecord({ url: 'https://last-known.example' }), storage)

    const out = await resolveHubUrl(HUB_DID, {
      fetchResolution: async () => {
        throw new Error('ECONNREFUSED')
      },
      storage,
      nowMs: () => 100_000
    })
    expect(out).toMatchObject({ kind: 'ready', url: 'https://last-known.example', stale: true })
  })

  it('is unresolvable — never a successful empty — with no cache and a dead resolver', async () => {
    const out = await resolveHubUrl(HUB_DID, {
      fetchResolution: async () => {
        throw new Error('ECONNREFUSED')
      },
      storage: memoryStorage(),
      nowMs: () => 0
    })
    expect(out.kind).toBe('unresolvable')
  })

  it('reports a cold hub as waking with a retry hint, not as an outage', async () => {
    const out = await resolveHubUrl(HUB_DID, {
      fetchResolution: async () => ({
        record: signedRecord(),
        liveness: { status: 'waking', retryAfterMs: 7_000 }
      }),
      storage: memoryStorage(),
      nowMs: () => 100_000
    })
    expect(out).toMatchObject({ kind: 'waking', retryAfterMs: 7_000 })
  })

  it('discards an unverifiable record rather than dialling it', async () => {
    const attacker = generateSigningKeyPair()
    const rest = { ...signedRecord(), url: 'https://attacker.example' }
    const forged: HubAddressRecord = {
      ...rest,
      proof: toBase64(
        hybridSign(canonicalHubAddressBytes(rest), { ed25519: attacker.privateKey }, 0).ed25519!
      )
    }

    const out = await resolveHubUrl(HUB_DID, {
      fetchResolution: async () => ready(forged),
      storage: memoryStorage(),
      nowMs: () => 0
    })
    expect(out.kind).toBe('unresolvable')
    if (out.kind === 'unresolvable') expect(out.reason).toMatch(/signature verification/)
  })

  it('rejects a record answering for a different name', async () => {
    const out = await resolveHubUrl('did:key:zSOMEONEELSE', {
      fetchResolution: async () => ready(signedRecord()),
      storage: memoryStorage(),
      nowMs: () => 0
    })
    expect(out.kind).toBe('unresolvable')
  })

  it('surfaces a migration as one re-resolve, not a reconfiguration', async () => {
    const storage = memoryStorage()
    let url = 'https://cloud-run.example'
    const deps = { fetchResolution: async () => ready(signedRecord({ url })), storage }

    const before = await resolveHubUrl(HUB_DID, { ...deps, nowMs: () => 0 })
    expect(before).toMatchObject({ kind: 'ready', url: 'https://cloud-run.example' })

    url = 'https://fargate.example'
    const after = await resolveHubUrl(HUB_DID, { ...deps, nowMs: () => 61_000 })
    expect(after).toMatchObject({ kind: 'ready', url: 'https://fargate.example' })
  })

  it('carries signed fallbacks through as dial alternates', async () => {
    const out = await resolveHubUrl(HUB_DID, {
      fetchResolution: async () => ready(signedRecord({ fallbacks: ['http://hub.local:3030'] })),
      storage: memoryStorage(),
      nowMs: () => 0
    })
    expect(out.kind === 'ready' && out.fallbacks).toEqual(['http://hub.local:3030'])
  })
})

describe('httpResolver', () => {
  it('appends the encoded name to the resolver base', async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: true, json: async () => ready(signedRecord()) }) as Response
    )
    await httpResolver('https://cloud.example/resolve/', fetchImpl as never)(HUB_DID)
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://cloud.example/resolve/${encodeURIComponent(HUB_DID)}`
    )
  })

  it('returns null on a non-ok response rather than throwing', async () => {
    const fetchImpl = async () => ({ ok: false }) as Response
    expect(await httpResolver('https://cloud.example/resolve', fetchImpl as never)(HUB_DID)).toBe(
      null
    )
  })
})
