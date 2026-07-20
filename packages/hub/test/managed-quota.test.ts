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
import { bytesToBase64, generateSigningKeyPair } from '@xnetjs/crypto'
import {
  PLAN_CATALOG,
  resolveEntitlements,
  signEntitlements,
  withStorage
} from '@xnetjs/entitlements'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { createChangeId, createUnsignedChange, signChange } from '@xnetjs/sync'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig, resolvePerUserQuota } from '../src/config'
import { NodeRelayService } from '../src/services/node-relay'
import { createMemoryStorage } from '../src/storage/memory'
import { DEMO_DEFAULTS } from '../src/types'

const ROOM = 'managed-room'
const SECRET = 'hub-plan-secret'
const ENV_KEYS = ['HUB_PLAN', 'XNET_PLAN_SECRET', 'HUB_MODE']

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
})

const { privateKey } = generateSigningKeyPair()
const identity = identityFromPrivateKey(privateKey)

const makeSignedChange = (nodeId: string, lamport: number): SerializedNodeChange => {
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
    authorDID: identity.did as DID,
    wallTime: 1_700_000_000_000 + lamport,
    lamport
  })
  const signed = signChange(unsigned, privateKey)
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
