/**
 * @xnetjs/hub - Node change relay service.
 */
import type { RemoteMutationTelemetryOptions } from './remote-mutation-telemetry'
import type { AuthContext } from '../auth/ucan'
import type { HubStorage, SerializedNodeChange } from '../storage/interface'
import type { ContentId, DID } from '@xnetjs/core'
import { base64ToBytes } from '@xnetjs/crypto'
import { isSystemNamespaceResource, isSystemSchemaIri, isValidMentions } from '@xnetjs/data'
import { parseDID } from '@xnetjs/identity'
import { verifyChange, verifyChangeHash, type Change } from '@xnetjs/sync'
import { reportUnauthorizedRemoteWrite } from './remote-mutation-telemetry'

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
    public code:
      | 'UNAUTHORIZED'
      | 'MISSING_SCOPE'
      | 'INVALID_CHANGE'
      | 'INVALID_SIGNATURE'
      | 'INVALID_HASH'
      | 'REPLAY_REJECTED',
    message: string,
    public action?: string,
    public resource?: string
  ) {
    super(message)
    this.name = 'NodeRelayError'
  }
}

export class NodeRelayService {
  constructor(
    private storage: HubStorage,
    private telemetryOptions: RemoteMutationTelemetryOptions = {}
  ) {}

  async handleNodeChange(msg: NodeChangeMessage, auth: AuthContext): Promise<boolean> {
    if (!auth.can('hub/relay', msg.room)) {
      reportUnauthorizedRemoteWrite(this.telemetryOptions, auth.did)
      throw new NodeRelayError('UNAUTHORIZED', 'Insufficient capabilities for node relay')
    }

    const change = this.deserializeChange(msg.change)
    const systemResource = getSystemRelayResource(msg.change)
    if (systemResource && !auth.can('hub/relay', systemResource)) {
      reportUnauthorizedRemoteWrite(this.telemetryOptions, auth.did)
      throw new NodeRelayError(
        'MISSING_SCOPE',
        'Missing hub/relay capability for system namespace resource',
        'hub/relay',
        systemResource
      )
    }

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

    // Structured mentions (exploration 0168): clients declare mentions;
    // the hub validates plaintext declarations (shape + size cap) so a
    // hostile client cannot mention-bomb through the relay.
    const mentions = (change.payload?.properties as Record<string, unknown> | undefined)?.mentions
    if (mentions !== undefined && mentions !== null && !isValidMentions(mentions)) {
      throw new NodeRelayError('INVALID_CHANGE', 'Malformed mentions declaration')
    }

    const exists = await this.storage.hasNodeChange(change.hash)
    if (exists && systemResource) {
      throw new NodeRelayError(
        'REPLAY_REJECTED',
        'Replay rejected for system control-plane change',
        'hub/relay',
        systemResource
      )
    }
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

export function getSystemRelayResource(change: SerializedNodeChange): string | null {
  const nodeId = change.payload.nodeId || change.nodeId
  if (isSystemNamespaceResource(nodeId)) {
    return nodeId
  }

  const schemaId = change.payload.schemaId ?? change.schemaId
  if (schemaId && isSystemSchemaIri(schemaId)) {
    return schemaId
  }

  return null
}
