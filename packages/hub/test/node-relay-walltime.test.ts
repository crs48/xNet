/**
 * Unit tests for the relay's `wallTime` upper bound (exploration 0300, fix G).
 *
 * `wallTime` is the middle LWW tiebreak rung and is a client-set `Date.now()`.
 * Without a bound an attacker sets it far in the future to win that rung
 * outright — a cheaper grind than the author tiebreak. The relay rejects a
 * change whose wallTime leads the hub clock by more than the configured skew,
 * while still accepting changes within the skew window.
 */
import type { DID } from '@xnetjs/core'
import { bytesToBase64, generateSigningKeyPair } from '@xnetjs/crypto'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { createUnsignedChange, signChange, createChangeId } from '@xnetjs/sync'
import { describe, it, expect } from 'vitest'
import { createMemoryStorage } from '../src/storage'
import type { SerializedNodeChange } from '../src/storage/interface'
import {
  NodeRelayService,
  NodeRelayError,
  type NodeChangeMessage
} from '../src/services/node-relay'

const ROOM = 'walltime-room'
const HUB_NOW = 1_700_000_000_000

/** A validly signed change with a chosen wallTime (signature covers wallTime). */
const signedChangeWithWallTime = (wallTime: number): SerializedNodeChange => {
  const { privateKey } = generateSigningKeyPair()
  const identity = identityFromPrivateKey(privateKey)
  const payload = {
    nodeId: 'node-1',
    schemaId: 'xnet://xnet.dev/Task',
    properties: { title: 'grind', status: 'todo' }
  }
  const unsigned = createUnsignedChange({
    id: createChangeId(),
    type: 'node-change',
    payload,
    parentHash: null,
    authorDID: identity.did as DID,
    wallTime,
    lamport: 1
  })
  const signed = signChange(unsigned, privateKey)
  return {
    id: signed.id,
    type: signed.type,
    hash: signed.hash,
    room: ROOM,
    nodeId: payload.nodeId,
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

const allowAll = { did: 'did:key:tester', can: () => true }

const relay = () =>
  new NodeRelayService(createMemoryStorage(), {}, { now: () => HUB_NOW })

describe('relay wallTime bound (0300 fix G)', () => {
  it('rejects a change whose wallTime is far in the future', async () => {
    const svc = relay()
    const change = signedChangeWithWallTime(HUB_NOW + 60 * 60_000) // +1h
    const msg: NodeChangeMessage = { type: 'node-change', room: ROOM, change }
    await expect(svc.handleNodeChange(msg, allowAll)).rejects.toMatchObject({
      code: 'INVALID_WALL_TIME'
    })
  })

  it('accepts a change within the allowed skew window', async () => {
    const svc = relay()
    const change = signedChangeWithWallTime(HUB_NOW + 60_000) // +1m, within 5m
    const msg: NodeChangeMessage = { type: 'node-change', room: ROOM, change }
    await expect(svc.handleNodeChange(msg, allowAll)).resolves.toBe(true)
  })

  it('accepts a normal past/now wallTime', async () => {
    const svc = relay()
    const change = signedChangeWithWallTime(HUB_NOW - 1000)
    const msg: NodeChangeMessage = { type: 'node-change', room: ROOM, change }
    await expect(svc.handleNodeChange(msg, allowAll)).resolves.toBe(true)
  })

  it('can be disabled with maxWallTimeSkewMs = 0 (self-host)', async () => {
    const svc = new NodeRelayService(createMemoryStorage(), {}, {
      now: () => HUB_NOW,
      maxWallTimeSkewMs: 0
    })
    const change = signedChangeWithWallTime(HUB_NOW + 10 * 60 * 60_000) // +10h
    const msg: NodeChangeMessage = { type: 'node-change', room: ROOM, change }
    await expect(svc.handleNodeChange(msg, allowAll)).resolves.toBe(true)
  })

  it('the rejection is a NodeRelayError', async () => {
    const svc = relay()
    const change = signedChangeWithWallTime(HUB_NOW + 60 * 60_000)
    const msg: NodeChangeMessage = { type: 'node-change', room: ROOM, change }
    await expect(svc.handleNodeChange(msg, allowAll)).rejects.toBeInstanceOf(NodeRelayError)
  })
})
