/**
 * @xnet/hub - Node change relay service.
 */
import type { AuthContext } from '../auth/ucan'
import type { HubStorage, SerializedNodeChange } from '../storage/interface'
import type { ContentId, DID } from '@xnet/core'
import { base64ToBytes } from '@xnet/crypto'
import { parseDID } from '@xnet/identity'
import { verifyChange, verifyChangeHash, type Change } from '@xnet/sync'

type NodePayload = SerializedNodeChange['payload']

export type NodeChangeMessage = {
  type: 'node-change'
  room: string
  change: SerializedNodeChange
}

export type NodeSyncRequest = {
  type: 'node-sync-request'
  room: string
  sinceLamport: number
}

export type NodeSyncResponse = {
  type: 'node-sync-response'
  room: string
  changes: SerializedNodeChange[]
  highWaterMark: number
}

export class NodeRelayError extends Error {
  constructor(
    public code: 'UNAUTHORIZED' | 'INVALID_CHANGE' | 'INVALID_SIGNATURE' | 'INVALID_HASH',
    message: string
  ) {
    super(message)
    this.name = 'NodeRelayError'
  }
}

export class NodeRelayService {
  constructor(private storage: HubStorage) {}

  async handleNodeChange(msg: NodeChangeMessage, auth: AuthContext): Promise<boolean> {
    if (!auth.can('hub/relay', msg.room)) {
      throw new NodeRelayError('UNAUTHORIZED', 'Insufficient capabilities for node relay')
    }

    const change = this.deserializeChange(msg.change)

    if (!verifyChangeHash(change)) {
      throw new NodeRelayError('INVALID_HASH', 'Change hash is invalid')
    }

    let publicKey: Uint8Array
    try {
      publicKey = parseDID(change.authorDID)
    } catch (err) {
      throw new NodeRelayError('INVALID_CHANGE', `Invalid author DID: ${err}`)
    }

    if (!verifyChange(change, publicKey)) {
      throw new NodeRelayError('INVALID_SIGNATURE', 'Change signature is invalid')
    }

    const exists = await this.storage.hasNodeChange(change.hash)
    if (exists) return false

    await this.storage.appendNodeChange(msg.room, {
      ...msg.change,
      room: msg.room
    })

    return true
  }

  async handleSyncRequest(msg: NodeSyncRequest, auth: AuthContext): Promise<NodeSyncResponse> {
    if (!auth.can('hub/relay', msg.room)) {
      throw new NodeRelayError('UNAUTHORIZED', 'Insufficient capabilities for node relay')
    }

    const [changes, highWaterMark] = await Promise.all([
      this.storage.getNodeChangesSince(msg.room, msg.sinceLamport),
      this.storage.getHighWaterMark(msg.room)
    ])

    return {
      type: 'node-sync-response',
      room: msg.room,
      changes,
      highWaterMark
    }
  }

  private deserializeChange(serialized: SerializedNodeChange): Change<NodePayload> {
    return {
      id: serialized.id,
      type: serialized.type,
      hash: serialized.hash as ContentId,
      parentHash: serialized.parentHash as ContentId | null,
      authorDID: serialized.authorDid as DID,
      signature: base64ToBytes(serialized.signatureB64),
      wallTime: serialized.wallTime,
      lamport: { time: serialized.lamportTime, author: serialized.lamportAuthor as DID },
      payload: serialized.payload,
      protocolVersion: serialized.protocolVersion,
      batchId: serialized.batchId,
      batchIndex: serialized.batchIndex,
      batchSize: serialized.batchSize
    }
  }
}
