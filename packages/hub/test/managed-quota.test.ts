/**
 * Managed-plan quota on the change log (exploration 0381, R3).
 *
 * The append-only change log is the primary grower, but its quota gate was wired
 * only in demo mode — a paying tenant's log could grow without bound while their
 * backups and file uploads were capped at the same plan quota. These tests pin
 * both halves: the resolver hands a managed hub the PLAN quota (not the demo
 * default), and the relay's append path actually rejects at that number.
 */
import type { AuthContext } from '../src/auth/ucan'
import type { SerializedNodeChange } from '../src/storage/interface'
import type { DID } from '@xnetjs/core'
import { createHmac } from 'node:crypto'
import { bytesToBase64, generateSigningKeyPair } from '@xnetjs/crypto'
import {
  PLAN_CATALOG,
  resolveEntitlements,
  signEntitlements,
  withStorage,
  withStoragePack
} from '@xnetjs/entitlements'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { createChangeId, createUnsignedChange, signChange } from '@xnetjs/sync'
import { afterEach, describe, expect, it } from 'vitest'
import {
  resolveConfig,
  resolveDiskWatchdogBytes,
  resolvePerUserQuota,
  resolveTenantQuota
} from '../src/config'
import { NodeRelayService } from '../src/services/node-relay'
import { createMemoryStorage } from '../src/storage/memory'
import { DEMO_DEFAULTS } from '../src/types'

const ROOM = 'managed-room'
const SECRET = 'hub-plan-secret'
const ENV_KEYS = ['HUB_PLAN', 'XNET_PLAN_SECRET', 'HUB_MODE', 'HUB_DISK_LIMIT_BYTES']

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
})

const { privateKey } = generateSigningKeyPair()
const identity = identityFromPrivateKey(privateKey)

// A second member of the same hub. The aggregate ceiling only differs from the
// per-user one when more than one DID is writing, so proving 0435's gate needs
// two authors — with one, the two caps are indistinguishable.
const { privateKey: privateKey2 } = generateSigningKeyPair()
const identity2 = identityFromPrivateKey(privateKey2)

const makeSignedChangeAs = (
  who: { did: string; key: Uint8Array },
  nodeId: string,
  lamport: number
): SerializedNodeChange => {
  const payload = {
    nodeId,
    schemaId: 'xnet://xnet.dev/Task',
    properties: { title: `Task ${nodeId}`, status: 'todo' }
  }
  const unsigned = createUnsignedChange({
    id: createChangeId(),
    type: 'node-change',
    payload,
    parentHash: null,
    authorDID: who.did as DID,
    wallTime: 1_700_000_000_000 + lamport,
    lamport
  })
  const signed = signChange(unsigned, who.key)
  return {
    id: signed.id,
    type: signed.type,
    hash: signed.hash,
    room: ROOM,
    nodeId,
    schemaId: payload.schemaId,
    lamportTime: signed.lamport,
    lamportAuthor: signed.authorDID,
    authorDid: signed.authorDID,
    wallTime: signed.wallTime,
    parentHash: signed.parentHash,
    payload: signed.payload,
    signatureB64: bytesToBase64(signed.signature),
    protocolVersion: signed.protocolVersion,
    batchId: signed.batchId,
    batchIndex: signed.batchIndex,
    batchSize: signed.batchSize
  }
}

const makeSignedChange = (nodeId: string, lamport: number): SerializedNodeChange =>
  makeSignedChangeAs({ did: identity.did, key: privateKey }, nodeId, lamport)

/** Mirrors the relay's own accounting (`changeUsageBytes`). */
const usageOf = (change: SerializedNodeChange): number =>
  JSON.stringify(change.payload).length + change.signatureB64.length

const allowAuth = { did: identity.did, can: () => true } as unknown as AuthContext

const relayMsg = (change: SerializedNodeChange) =>
  ({ type: 'node-change', room: ROOM, change }) as const

/** Boot a managed (non-demo) hub config from a signed plan token. */
const managedConfig = (quotaBytes?: number) => {
  const base = resolveEntitlements('personal')
  const entitlements = quotaBytes === undefined ? base : withStorage(base, quotaBytes)
  process.env.HUB_PLAN = signEntitlements(entitlements, SECRET)
  process.env.XNET_PLAN_SECRET = SECRET
  return resolveConfig({})
}

describe('resolvePerUserQuota — managed vs demo', () => {
  it("gives a managed hub the plan's quota, not the demo default", () => {
    const quota = resolvePerUserQuota(managedConfig())

    expect(quota).toBe(PLAN_CATALOG.personal.quotaBytes)
    expect(quota).not.toBe(DEMO_DEFAULTS.quota)
  })

  it('still gives a demo hub the demo override', () => {
    process.env.HUB_MODE = 'demo'
    const config = resolveConfig({})

    expect(resolvePerUserQuota(config)).toBe(DEMO_DEFAULTS.quota)
  })

  it('falls back to the self-hosted default with no plan token', () => {
    const config = resolveConfig({})

    expect(resolvePerUserQuota(config)).toBe(config.defaultQuota)
  })
})

describe('change-log append gate on a managed plan (0381)', () => {
  it('rejects a managed-plan tenant that is at quota', async () => {
    const storage = createMemoryStorage()
    const first = makeSignedChange('node-1', 1)
    // A plan whose storage entitlement budgets exactly one change, so the second
    // (same-size) append is the one that crosses it. The quota travels the real
    // path: signed entitlement → resolveConfig → resolvePerUserQuota → relay.
    const config = managedConfig(usageOf(first))
    const relay = new NodeRelayService(storage, {}, { quotaBytes: resolvePerUserQuota(config) })

    await expect(relay.handleNodeChange(relayMsg(first), allowAuth)).resolves.toBe(true)

    const second = makeSignedChange('node-2', 2)
    await expect(relay.handleNodeChange(relayMsg(second), allowAuth)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED'
    })
  })

  it('accepts an append that fits under the plan quota', async () => {
    const storage = createMemoryStorage()
    const config = managedConfig()
    const relay = new NodeRelayService(storage, {}, { quotaBytes: resolvePerUserQuota(config) })

    // 25 GiB of headroom — the gate is wired but nowhere near tripped.
    await expect(
      relay.handleNodeChange(relayMsg(makeSignedChange('node-1', 1)), allowAuth)
    ).resolves.toBe(true)
  })
})

/**
 * Aggregate tenant ceiling (exploration 0435).
 *
 * The per-user cap is enforced per DID, so on a seat-metered plan the hub's real
 * capacity has always been quota × seats. A storage pack is sold once, per
 * tenant — billing it against the per-user number would provision it N times.
 */
describe('aggregate tenant quota (0435)', () => {
  const allowAuth2 = { did: identity2.did, can: () => true } as unknown as AuthContext
  const asMember2 = (nodeId: string, lamport: number) =>
    makeSignedChangeAs({ did: identity2.did, key: privateKey2 }, nodeId, lamport)

  it('stops a SECOND member that the per-user cap would have let through', async () => {
    const storage = createMemoryStorage()
    const first = makeSignedChange('node-1', 1)
    const second = asMember2('node-2', 2)

    // Per-user quota is generous (each member is well under it); the tenant
    // ceiling budgets exactly one change. Without the aggregate gate the second
    // member's append sails through — that is the bug this pins.
    const relay = new NodeRelayService(
      storage,
      {},
      { quotaBytes: 10_000_000, tenantQuotaBytes: usageOf(first) }
    )

    await expect(relay.handleNodeChange(relayMsg(first), allowAuth)).resolves.toBe(true)
    await expect(relay.handleNodeChange(relayMsg(second), allowAuth2)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED'
    })
  })

  it('reports the hub-wide limit, not the per-user one, when the aggregate trips', async () => {
    const storage = createMemoryStorage()
    const first = makeSignedChange('node-1', 1)
    const relay = new NodeRelayService(
      storage,
      {},
      { quotaBytes: 10_000_000, tenantQuotaBytes: usageOf(first) }
    )
    await relay.handleNodeChange(relayMsg(first), allowAuth)

    await expect(
      relay.handleNodeChange(relayMsg(asMember2('node-2', 2)), allowAuth2)
    ).rejects.toThrow(/for this hub/)
  })

  it('is unbounded when unset — the self-host and pre-0435-token default', async () => {
    const storage = createMemoryStorage()
    // No tenantQuotaBytes at all: exactly what `resolveTenantQuota` yields for a
    // hub with no HUB_PLAN, and for one whose token predates the field.
    const relay = new NodeRelayService(storage, {}, { quotaBytes: 10_000_000 })

    await expect(
      relay.handleNodeChange(relayMsg(makeSignedChange('n1', 1)), allowAuth)
    ).resolves.toBe(true)
    await expect(relay.handleNodeChange(relayMsg(asMember2('n2', 2)), allowAuth2)).resolves.toBe(
      true
    )
  })

  it('admits members up to the ceiling and only then refuses', async () => {
    const storage = createMemoryStorage()
    const a = makeSignedChange('node-1', 1)
    const b = asMember2('node-2', 2)
    const relay = new NodeRelayService(
      storage,
      {},
      { quotaBytes: 10_000_000, tenantQuotaBytes: usageOf(a) + usageOf(b) }
    )

    await expect(relay.handleNodeChange(relayMsg(a), allowAuth)).resolves.toBe(true)
    await expect(relay.handleNodeChange(relayMsg(b), allowAuth2)).resolves.toBe(true)
    await expect(
      relay.handleNodeChange(relayMsg(asMember2('node-3', 3)), allowAuth2)
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
  })
})

describe('resolveTenantQuota (0435)', () => {
  it('carries a signed tenantQuotaBytes through to the hub config', () => {
    const packed = withStoragePack(resolveEntitlements('personal'), 500)
    process.env.HUB_PLAN = signEntitlements(packed, SECRET)
    process.env.XNET_PLAN_SECRET = SECRET

    expect(resolveTenantQuota(resolveConfig({}))).toBe(packed.tenantQuotaBytes)
  })

  it('is null for a self-hosted hub — we cannot cap what we do not host', () => {
    // The anti-lock-in invariant (0174): no HUB_PLAN, no ceiling.
    expect(resolveTenantQuota(resolveConfig({}))).toBeNull()
  })

  it('is null when the signed token predates the field (fails OPEN)', () => {
    const legacy = { ...resolveEntitlements('personal') } as Record<string, unknown>
    delete legacy.tenantQuotaBytes
    const payload = Buffer.from(JSON.stringify(legacy)).toString('base64url')
    const sig = createHmac('sha256', SECRET).update(payload).digest().toString('base64url')
    process.env.HUB_PLAN = `${payload}.${sig}`
    process.env.XNET_PLAN_SECRET = SECRET

    expect(resolveTenantQuota(resolveConfig({}))).toBeNull()
  })
})

/**
 * Disk watchdog on a paying hub (exploration 0435).
 *
 * The watchdog was demo-only (0291), so a paying tenant's hub had no aggregate
 * disk guard at all — and on Cloud Run the writable filesystem is RAM, making a
 * full disk an OOM kill rather than a graceful shed.
 */
describe('resolveDiskWatchdogBytes beyond demo (0435)', () => {
  it('watches the substrate limit on a managed, non-demo hub', () => {
    process.env.HUB_DISK_LIMIT_BYTES = String(8 * 1024 * 1024 * 1024)
    managedConfig() // sets HUB_PLAN/XNET_PLAN_SECRET

    expect(resolveDiskWatchdogBytes(resolveConfig({}))).toBe(8 * 1024 * 1024 * 1024)
  })

  it('is sized from the SUBSTRATE, not the plan quota', () => {
    // personal is 25 GiB of entitlement on (say) an 8 GiB machine. The watchdog
    // must track the machine — shedding writes is about physical capacity.
    process.env.HUB_DISK_LIMIT_BYTES = String(8 * 1024 * 1024 * 1024)
    const config = managedConfig()

    expect(resolveDiskWatchdogBytes(config)).toBeLessThan(resolvePerUserQuota(config))
  })

  it('still has no watchdog when the substrate limit is unknown', () => {
    // A self-hosted hub on an unmeasured disk is unchanged.
    expect(resolveDiskWatchdogBytes(resolveConfig({}))).toBeNull()
  })

  it('keeps the demo override winning in demo mode', () => {
    process.env.HUB_MODE = 'demo'
    process.env.HUB_DISK_LIMIT_BYTES = String(99 * 1024 * 1024 * 1024)

    expect(resolveDiskWatchdogBytes(resolveConfig({}))).toBe(DEMO_DEFAULTS.diskLimitBytes)
  })
})
