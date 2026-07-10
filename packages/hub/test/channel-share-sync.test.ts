/**
 * Channel share-room fan-out (exploration 0298).
 *
 * A shared channel must actually reach the grantee: the Channel node, its
 * ChatMessage history, and members' Profiles are indexed into the channel's
 * share room (`xnet-channel-<id>`), which the grantee subscribes to. These
 * tests drive the real NodeRelayService + storage (memory + SQLite).
 */
import type { AuthContext } from '../src/auth/ucan'
import type { HubStorage, SerializedNodeChange } from '../src/storage/interface'
import type { DID } from '@xnetjs/core'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bytesToBase64, generateSigningKeyPair } from '@xnetjs/crypto'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { createChangeId, createUnsignedChange, signChange } from '@xnetjs/sync'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  channelShareRoom,
  NodeRelayService,
  type ShareAccessGate
} from '../src/services/node-relay'
import { createMemoryStorage } from '../src/storage/memory'
import { createSQLiteStorage } from '../src/storage/sqlite'

type Actor = { did: string; privateKey: Uint8Array; lamport: number }

const actor = (): Actor => {
  const { privateKey } = generateSigningKeyPair()
  return { did: identityFromPrivateKey(privateKey).did, privateKey, lamport: 0 }
}

const signChangeFor = (
  who: Actor,
  nodeId: string,
  schemaId: string,
  properties: Record<string, unknown>
): SerializedNodeChange => {
  const payload = { nodeId, schemaId, properties }
  const signed = signChange(
    createUnsignedChange({
      id: createChangeId(),
      type: 'node-change',
      payload,
      parentHash: null,
      authorDID: who.did as DID,
      wallTime: 1_700_000_000_000 + ++who.lamport,
      lamport: who.lamport
    }),
    who.privateKey
  )
  return {
    id: signed.id,
    type: signed.type,
    hash: signed.hash,
    room: who.did,
    nodeId,
    schemaId,
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

const authFor = (who: Actor): AuthContext =>
  ({ did: who.did, can: () => true }) as unknown as AuthContext

const relayMsg = (change: SerializedNodeChange) =>
  ({ type: 'node-change', room: change.room, change }) as const

const CHANNEL = 'xnet://xnet.fyi/Channel@1.0.0'
const CHAT_MESSAGE = 'xnet://xnet.fyi/ChatMessage@1.0.0'
const PROFILE = 'xnet://xnet.fyi/Profile@1.0.0'

// ─── Gate: model roles by (did → status) for the channel resource ────────────

const gateWith = (roles: Map<string, 'read' | 'comment' | 'write' | 'owner'>): ShareAccessGate => ({
  async canWriteNodeChange(did, _docId, schemaId) {
    const role = roles.get(did) ?? 'owner' // no entry ⇒ possession model (allow)
    if (role === 'owner' || role === 'write') return true
    if (role === 'comment') return schemaId?.startsWith(CHAT_MESSAGE) ?? false
    return false // read
  }
})

let sqliteAvailable = false
try {
  const probe = mkdtempSync(join(tmpdir(), 'hub-probe-'))
  createSQLiteStorage(probe).close()
  rmSync(probe, { recursive: true, force: true })
  sqliteAvailable = true
} catch {
  sqliteAvailable = false
}

type Factory = { name: string; create: () => { storage: HubStorage; cleanup: () => void } }
const factories: Factory[] = [
  { name: 'Memory', create: () => ({ storage: createMemoryStorage(), cleanup: () => {} }) },
  ...(sqliteAvailable
    ? [
        {
          name: 'SQLite',
          create: () => {
            const dir = mkdtempSync(join(tmpdir(), 'hub-chan-'))
            return {
              storage: createSQLiteStorage(dir),
              cleanup: () => rmSync(dir, { recursive: true, force: true })
            }
          }
        }
      ]
    : [])
]

describe.each(factories)('channel share fan-out ($name)', ({ create }) => {
  let storage: HubStorage
  let cleanup: () => void
  beforeEach(() => {
    const created = create()
    storage = created.storage
    cleanup = created.cleanup
  })
  afterEach(async () => {
    await storage.close?.()
    cleanup()
  })

  const relay = (gate: ShareAccessGate, broadcasts?: string[]) =>
    new NodeRelayService(
      storage,
      {},
      {
        shareAccess: gate,
        broadcastToRoom: broadcasts ? (room) => broadcasts.push(room) : undefined
      }
    )

  it('delivers the channel node, its messages, and member profiles to the share room', async () => {
    const owner = actor()
    const member = actor()
    const channelId = 'chan-1'
    const gate = gateWith(new Map()) // owner/possession — everything allowed
    const svc = relay(gate)

    // Members publish their profiles (own author rooms) first.
    await svc.handleNodeChange(
      relayMsg(signChangeFor(owner, 'prof-owner', PROFILE, { did: owner.did, name: 'Owner' })),
      authFor(owner)
    )
    await svc.handleNodeChange(
      relayMsg(signChangeFor(member, 'prof-member', PROFILE, { did: member.did, name: 'Member' })),
      authFor(member)
    )
    // Owner creates the channel + posts a message.
    await svc.handleNodeChange(
      relayMsg(
        signChangeFor(owner, channelId, CHANNEL, {
          name: 'general',
          kind: 'channel',
          members: [owner.did, member.did]
        })
      ),
      authFor(owner)
    )
    await svc.handleNodeChange(
      relayMsg(signChangeFor(owner, 'msg-1', CHAT_MESSAGE, { channel: channelId, body: 'hello' })),
      authFor(owner)
    )

    const { changes } = await storage.getRoomChangesSince(channelShareRoom(channelId), 0)
    const schemas = changes.map((c) => c.schemaId)
    expect(schemas).toContain(CHANNEL)
    expect(schemas).toContain(CHAT_MESSAGE)
    // Both members' profiles rode along so names render for the grantee.
    const profileNodes = changes.filter((c) => c.schemaId === PROFILE).map((c) => c.nodeId)
    expect(profileNodes).toContain('prof-owner')
    expect(profileNodes).toContain('prof-member')
  })

  it('lets a comment grantee post into the channel but rejects a read grantee', async () => {
    const owner = actor()
    const commenter = actor()
    const reader = actor()
    const channelId = 'chan-2'
    const gate = gateWith(
      new Map([
        [commenter.did, 'comment'],
        [reader.did, 'read']
      ])
    )
    const svc = relay(gate)

    await svc.handleNodeChange(
      relayMsg(
        signChangeFor(owner, channelId, CHANNEL, { name: 'c', kind: 'channel', members: [] })
      ),
      authFor(owner)
    )
    // Commenter posts (authored in their own room) → fans in.
    await svc.handleNodeChange(
      relayMsg(signChangeFor(commenter, 'm-c', CHAT_MESSAGE, { channel: channelId, body: 'hi' })),
      authFor(commenter)
    )
    // Reader tries to post → author-room write succeeds but must NOT fan in.
    await svc.handleNodeChange(
      relayMsg(signChangeFor(reader, 'm-r', CHAT_MESSAGE, { channel: channelId, body: 'no' })),
      authFor(reader)
    )

    const { changes } = await storage.getRoomChangesSince(channelShareRoom(channelId), 0)
    const messageNodes = changes.filter((c) => c.schemaId === CHAT_MESSAGE).map((c) => c.nodeId)
    expect(messageNodes).toContain('m-c')
    expect(messageNodes).not.toContain('m-r')
  })

  it('advances the share-room cursor by seq (not author lamport)', async () => {
    const owner = actor()
    const channelId = 'chan-3'
    const svc = relay(gateWith(new Map()))
    await svc.handleNodeChange(
      relayMsg(
        signChangeFor(owner, channelId, CHANNEL, { name: 'c', kind: 'channel', members: [] })
      ),
      authFor(owner)
    )
    await svc.handleNodeChange(
      relayMsg(signChangeFor(owner, 'm1', CHAT_MESSAGE, { channel: channelId, body: '1' })),
      authFor(owner)
    )

    const room = channelShareRoom(channelId)
    const first = await storage.getRoomChangesSince(room, 0)
    expect(first.changes.length).toBeGreaterThan(0)
    expect(first.highWaterMark).toBeGreaterThan(0)
    // Re-pulling from the returned cursor yields nothing new.
    const second = await storage.getRoomChangesSince(room, first.highWaterMark)
    expect(second.changes).toHaveLength(0)
    expect(second.highWaterMark).toBe(first.highWaterMark)
  })

  it('live-broadcasts fanned-out changes to the channel room', async () => {
    const owner = actor()
    const channelId = 'chan-4'
    const broadcasts: string[] = []
    const svc = relay(gateWith(new Map()), broadcasts)
    await svc.handleNodeChange(
      relayMsg(
        signChangeFor(owner, channelId, CHANNEL, { name: 'c', kind: 'channel', members: [] })
      ),
      authFor(owner)
    )
    await svc.handleNodeChange(
      relayMsg(signChangeFor(owner, 'm1', CHAT_MESSAGE, { channel: channelId, body: '1' })),
      authFor(owner)
    )
    expect(broadcasts).toContain(channelShareRoom(channelId))
  })
})
