/**
 * The hub address mirror (exploration 0423).
 *
 * Two properties matter here and neither is the happy path:
 *
 *  1. the mirror re-serves the hub's signature and never mints one, so a
 *     compromised control plane cannot redirect a client;
 *  2. a cold tenant reads as `waking` with a retry hint, instead of as the
 *     connection failure it produces today.
 */

import { ShardAllocator } from '@xnetjs/cloud/provisioner'
import { createDIDFromEd25519PublicKey, generateSigningKeyPair, hybridSign } from '@xnetjs/crypto'
import { resolveEntitlements } from '@xnetjs/entitlements'
import { describe, expect, it, vi } from 'vitest'
import {
  HUB_ADDRESS_PATH,
  MemoryAddressMirrorStore,
  canonicalHubAddressBytes,
  refreshMirroredAddress,
  resolveTenantAddress,
  verifyHubAddress,
  type HubAddressRecord
} from './address-mirror'
import { type TenantRecord } from './registry'

/**
 * The canonical byte string, pinned. `packages/hub/test/hub-address.test.ts`
 * pins the identical fixture: the control plane mirrors the hub's serializer
 * rather than importing it, so this pair is what keeps the two from drifting
 * into silently rejecting every record.
 */
const CANONICAL_FIXTURE =
  '["xnet-hub-address-v1","did:key:zOWNER","did:key:zHUB","https://hub.example",[],"ready",null,1000,61000]'

const hubKeys = generateSigningKeyPair()
const HUB_DID = createDIDFromEd25519PublicKey(hubKeys.publicKey)

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
  return { ...unsigned, proof: Buffer.from(sig.ed25519!).toString('base64') }
}

const tenant = (over: Partial<TenantRecord> = {}): TenantRecord => ({
  tenantId: 't1',
  plan: 'personal',
  entitlements: resolveEntitlements('personal'),
  billingUserId: 'u1',
  did: '',
  hubUrl: 'https://hub.example',
  substrateRef: 'ref',
  region: 'us',
  targetVersion: '1.0.0',
  createdAt: 0,
  lastActiveMs: 0,
  dataTier: 'hot',
  ...over
})

const jsonResponse = (body: unknown, ok = true): Response =>
  ({ ok, json: async () => body }) as Response

describe('canonical bytes agree with the hub', () => {
  it('matches the pinned fixture', () => {
    const bytes = canonicalHubAddressBytes({
      did: 'did:key:zOWNER',
      hubDid: 'did:key:zHUB',
      url: 'https://hub.example',
      status: 'ready',
      issuedAt: 1_000,
      validUntil: 61_000
    })
    expect(new TextDecoder().decode(bytes)).toBe(CANONICAL_FIXTURE)
  })

  it('verifies a record signed with those bytes', () => {
    expect(verifyHubAddress(signedRecord())).toBe(true)
  })

  it('rejects a record whose url was rewritten after signing', () => {
    expect(verifyHubAddress({ ...signedRecord(), url: 'https://attacker.example' })).toBe(false)
  })
})

describe('refreshMirroredAddress', () => {
  it('fetches the hub well-known path and stores the record', async () => {
    const store = new MemoryAddressMirrorStore()
    const record = signedRecord()
    const fetchImpl = vi.fn(async () => jsonResponse(record))

    const got = await refreshMirroredAddress(tenant(), { store, fetchImpl: fetchImpl as never })
    expect(got?.url).toBe('https://hub.example')
    expect(fetchImpl).toHaveBeenCalledWith(`https://hub.example${HUB_ADDRESS_PATH}`)
    expect((await store.get('t1'))?.url).toBe('https://hub.example')
  })

  it('refuses to launder a forgery behind our hostname', async () => {
    const store = new MemoryAddressMirrorStore()
    const forged = { ...signedRecord(), url: 'https://attacker.example' }

    const got = await refreshMirroredAddress(tenant(), {
      store,
      fetchImpl: (async () => jsonResponse(forged)) as never
    })
    expect(got).toBeNull()
    expect(await store.get('t1')).toBeNull()
  })

  it('returns null — not a throw — when the hub is unreachable', async () => {
    const got = await refreshMirroredAddress(tenant(), {
      store: new MemoryAddressMirrorStore(),
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED')
      }) as never
    })
    expect(got).toBeNull()
  })

  it('does not try to fetch a cold tenant', async () => {
    const fetchImpl = vi.fn()
    const got = await refreshMirroredAddress(tenant({ dataTier: 'cold', hubUrl: '' }), {
      store: new MemoryAddressMirrorStore(),
      fetchImpl: fetchImpl as never
    })
    expect(got).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('resolveTenantAddress', () => {
  it('reports a hot, reachable hub as ready', async () => {
    const resolution = await resolveTenantAddress(tenant(), {
      store: new MemoryAddressMirrorStore(),
      fetchImpl: (async () => jsonResponse(signedRecord())) as never
    })
    expect(resolution?.liveness.status).toBe('ready')
    expect(resolution?.record?.url).toBe('https://hub.example')
  })

  it('reports a COLD tenant as waking, with the last known address to dial', async () => {
    const store = new MemoryAddressMirrorStore()
    await store.put('t1', signedRecord())

    const resolution = await resolveTenantAddress(tenant({ dataTier: 'cold', hubUrl: '' }), {
      store,
      wakingRetryMs: 7_000
    })
    expect(resolution?.liveness).toEqual({ status: 'waking', retryAfterMs: 7_000 })
    // The client still learns where to reconnect once the hub is restored —
    // today it only learns that the connection failed.
    expect(resolution?.record?.url).toBe('https://hub.example')
  })

  it('serves the last mirrored record when the hub is momentarily unreachable', async () => {
    const store = new MemoryAddressMirrorStore()
    await store.put('t1', signedRecord({ url: 'https://hub.example' }))

    const resolution = await resolveTenantAddress(tenant(), {
      store,
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED')
      }) as never
    })
    expect(resolution?.record?.url).toBe('https://hub.example')
    expect(resolution?.liveness.status).toBe('ready')
  })

  it('reports unknown — never ready — for a hot tenant it has never mirrored', async () => {
    const resolution = await resolveTenantAddress(tenant(), {
      store: new MemoryAddressMirrorStore(),
      fetchImpl: (async () => jsonResponse(null, false)) as never
    })
    expect(resolution?.record).toBeNull()
    expect(resolution?.liveness.status).toBe('unknown')
  })

  it('is null for an unknown tenant', async () => {
    expect(await resolveTenantAddress(null, { store: new MemoryAddressMirrorStore() })).toBeNull()
  })

  it('surfaces a migration as a new address under the same name', async () => {
    const store = new MemoryAddressMirrorStore()
    let url = 'https://cloud-run.example'
    const deps = { store, fetchImpl: (async () => jsonResponse(signedRecord({ url }))) as never }

    const before = await resolveTenantAddress(tenant({ hubUrl: url }), deps)
    expect(before?.record?.url).toBe('https://cloud-run.example')

    url = 'https://fargate.example'
    const after = await resolveTenantAddress(tenant({ hubUrl: url }), deps)
    expect(after?.record?.url).toBe('https://fargate.example')
  })
})

/**
 * The fleet drill (exploration 0423). Two tenants placed across a simulated
 * project-shard boundary must both resolve, and neither address may be
 * something a client could have hard-coded.
 */
describe('fleet drill across a project-shard boundary', () => {
  it('resolves both tenants, and neither address is client configuration', async () => {
    // servicesPerProject: 1 puts tenant 2 in the NEXT project shard, which is
    // where a per-project assumption would break.
    const allocator = new ShardAllocator({ projectPrefix: 'xnet-hub', servicesPerProject: 1 })
    const placements = [allocator.allocate('us-central1'), allocator.allocate('us-central1')]
    expect(placements).toEqual(['xnet-hub-0', 'xnet-hub-1'])

    const store = new MemoryAddressMirrorStore()
    const urlFor = (project: string): string => `https://hub-${project}.run.app`
    const resolutions = await Promise.all(
      placements.map((project, i) =>
        resolveTenantAddress(tenant({ tenantId: `t${i}`, hubUrl: urlFor(project) }), {
          store,
          fetchImpl: (async (input: string) =>
            jsonResponse(
              signedRecord({
                url: input.replace(HUB_ADDRESS_PATH, '')
              })
            )) as never
        })
      )
    )

    expect(resolutions.map((r) => r?.record?.url)).toEqual([
      'https://hub-xnet-hub-0.run.app',
      'https://hub-xnet-hub-1.run.app'
    ])
    // Each tenant's address came from resolution, not from a stored constant:
    // the client only ever held the hub's DID.
    for (const resolution of resolutions) {
      expect(resolution?.record?.did).toBe(HUB_DID)
      expect(resolution?.liveness.status).toBe('ready')
    }
  })
})
