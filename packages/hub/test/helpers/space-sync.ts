/**
 * Sync a Space to a running hub over the wire, the way the web app does.
 *
 * Tests that mint a `docType: 'space'` share link need this first: a Space
 * grant is a container (subtree) grant, so the hub refuses to let anyone mint
 * one for a Space with no attested owner. Relaying the Space's own signed
 * change is what records that owner — see `maintainSpaceContainment` and
 * `canManageShares`.
 */

import type { SerializedNodeChange } from '../../src/storage/interface'
import type { DID } from '@xnetjs/core'
import { bytesToBase64 } from '@xnetjs/crypto'
import { createChangeId, createUnsignedChange, signChange } from '@xnetjs/sync'
import { WebSocket } from 'ws'

export const SPACE_SCHEMA = 'xnet://xnet.fyi/Space@1.0.0'

export type SpaceSyncActor = {
  did: string
  token: string
  bundle: { signingKey: Uint8Array }
}

/** A signed change whose nodeId IS the Space id — how a Space actually syncs. */
export const makeSpaceChange = (
  actor: SpaceSyncActor,
  spaceId: string,
  lamport = 1
): SerializedNodeChange => {
  const payload = {
    nodeId: spaceId,
    schemaId: SPACE_SCHEMA,
    properties: { name: 'Space', visibility: 'private' }
  }
  const unsigned = createUnsignedChange({
    id: createChangeId(),
    type: 'node-change',
    payload,
    parentHash: null,
    authorDID: actor.did as DID,
    wallTime: Date.now(),
    lamport
  })
  const signed = signChange(unsigned, actor.bundle.signingKey)
  return {
    id: signed.id,
    type: signed.type,
    hash: signed.hash,
    room: `xnet-doc-${spaceId}`,
    nodeId: spaceId,
    schemaId: SPACE_SCHEMA,
    lamportTime: signed.lamport,
    lamportAuthor: signed.authorDID,
    authorDid: signed.authorDID,
    wallTime: signed.wallTime,
    parentHash: signed.parentHash,
    payload: signed.payload,
    signatureB64: bytesToBase64(signed.signature),
    protocolVersion: signed.protocolVersion
  }
}

/** Relay a Space change as `actor`, making them its recorded owner. */
export const syncSpaceAs = async (
  port: number,
  actor: SpaceSyncActor,
  spaceId: string,
  lamport = 1
): Promise<void> => {
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}`, [
      'xnet-sync.v1',
      `xnet-auth.${actor.token}`
    ])
    socket.on('error', reject)
    socket.on('open', () => socket.once('message', () => resolve(socket)))
  })
  const change = makeSpaceChange(actor, spaceId, lamport)
  ws.send(
    JSON.stringify({
      type: 'publish',
      topic: change.room,
      data: { type: 'node-change', room: change.room, change }
    })
  )
  await new Promise((resolve) => setTimeout(resolve, 150))
  ws.close()
}
