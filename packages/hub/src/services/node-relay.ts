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
import {
  CURRENT_PROTOCOL_VERSION,
  recomputeChangeHash,
  verifyChange,
  verifyChangeHash,
  type Change
} from '@xnetjs/sync'
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

export type NodeClearRequest = {
  type: 'node-clear'
  room: string
}

export type NodeClearedResponse = {
  type: 'node-cleared'
  room: string
  cleared: number
}

export class NodeRelayError extends Error {
  constructor(
    public code:
      | 'UNAUTHORIZED'
      | 'MISSING_SCOPE'
      | 'INVALID_CHANGE'
      | 'INVALID_SIGNATURE'
      | 'INVALID_HASH'
      | 'REPLAY_REJECTED'
      // The author's stored data would exceed the per-user cap (demo mode).
      | 'QUOTA_EXCEEDED'
      // The hub's disk is (near) full; writes are shed to avoid a crash.
      | 'STORAGE_FULL',
    message: string,
    public action?: string,
    public resource?: string
  ) {
    super(message)
    this.name = 'NodeRelayError'
  }
}

export type NodeRelayOptions = {
  /**
   * Per-user storage cap in bytes (demo mode, exploration 0291). When set, a
   * change is rejected if the author's existing `node_changes` bytes plus the
   * incoming change would exceed it. Unset ⇒ unbounded (self-host default).
   */
  quotaBytes?: number
  /**
   * Returns true when the hub's disk is at/near capacity. When it does, new
   * changes are shed with `STORAGE_FULL` so a full volume degrades gracefully
   * instead of crashing the process.
   */
  isStorageFull?: () => boolean
  /**
   * Gates channel share-room fan-out (0298). When set, a Channel/ChatMessage
   * change is indexed into `xnet-channel-<id>` only if its author may write to
   * that channel — so a share-link grantee's `/channel/<id>` subscription
   * receives the conversation. Unset ⇒ no fan-out (self-host without sharing).
   */
  shareAccess?: ShareAccessGate
  /**
   * Live-broadcasts a fanned-out change to a share room's subscribers so new
   * messages arrive in real time (not just on the next pull). Wired to the
   * signaling service (0298).
   */
  broadcastToRoom?: (room: string, change: SerializedNodeChange) => void
}

/** Serialized byte size a change contributes to a user's quota. */
const changeUsageBytes = (change: SerializedNodeChange): number =>
  JSON.stringify(change.payload).length + change.signatureB64.length

/** The share room that carries a channel's nodes to its grantees (0298). */
export const channelShareRoom = (channelId: string): string => `xnet-channel-${channelId}`

const CHANNEL_SCHEMA_PREFIX = 'xnet://xnet.fyi/Channel@'
const CHAT_MESSAGE_SCHEMA_PREFIX = 'xnet://xnet.fyi/ChatMessage@'

/** Minimal shape the relay needs to gate channel fan-out. */
export type ShareAccessGate = {
  canWriteNodeChange: (did: string, docId: string, schemaId: string | undefined) => Promise<boolean>
}

export class NodeRelayService {
  constructor(
    private storage: HubStorage,
    private telemetryOptions: RemoteMutationTelemetryOptions = {},
    private options: NodeRelayOptions = {}
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
      // A mismatch here is almost never tampering — far more often it's a
      // protocol/build skew: the change is internally valid for the *client's*
      // @xnetjs/sync, but this hub recomputes a different hash (e.g. an older
      // build that hashes a field differently). The opaque "hash is invalid"
      // used to send operators chasing data corruption; spell out both hashes
      // and protocol versions so the real fix — upgrading one side — is obvious.
      const expected = recomputeChangeHash(change)
      throw new NodeRelayError(
        'INVALID_HASH',
        `Change hash mismatch: client sent ${change.hash}, hub recomputed ${expected} ` +
          `(change protocol v${change.protocolVersion ?? 0}, hub protocol v${CURRENT_PROTOCOL_VERSION}). ` +
          `This usually means the hub and client are on incompatible @xnetjs/sync builds.`
      )
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

    // Shed writes before the volume fills so a full disk degrades gracefully
    // instead of crashing the hub (exploration 0291).
    if (this.options.isStorageFull?.()) {
      throw new NodeRelayError(
        'STORAGE_FULL',
        'Hub storage is full; new changes are temporarily rejected'
      )
    }

    // Per-user storage cap (demo mode). The append-only change log is the
    // primary grower and, unlike backups/files, had no quota gate — one active
    // user could fill the disk (exploration 0291).
    if (this.options.quotaBytes !== undefined) {
      const used = await this.storage.getUsageBytesByDid(change.authorDID)
      if (used + changeUsageBytes(msg.change) > this.options.quotaBytes) {
        throw new NodeRelayError(
          'QUOTA_EXCEEDED',
          `Storage limit reached (${this.options.quotaBytes} bytes per user). ` +
            `Delete some data or use your own hub for more space.`
        )
      }
    }

    await this.storage.appendNodeChange(msg.room, {
      ...msg.change,
      room: msg.room
    })

    // Channel sharing (0298): index a channel's nodes into its share room so a
    // grantee's `/channel/<id>` subscription receives the conversation. Never
    // blocks the primary relay — a fan-out failure just means slower delivery.
    try {
      await this.fanOutToChannelRoom(msg.change)
    } catch (err) {
      console.error('[node-relay] channel fan-out failed:', err)
    }

    return true
  }

  /**
   * If the change is a Channel or ChatMessage the author may write, index it
   * (and the relevant member/author Profile) into the channel's share room so
   * grantees receive the channel node, its history, and members' names (0298).
   */
  private async fanOutToChannelRoom(change: SerializedNodeChange): Promise<void> {
    const gate = this.options.shareAccess
    if (!gate) return
    const schema = change.schemaId ?? change.payload.schemaId ?? ''

    let channelId: string | null = null
    let profileDids: string[] = []
    if (schema.startsWith(CHANNEL_SCHEMA_PREFIX)) {
      channelId = change.nodeId
      const members = change.payload.properties?.members
      // Deliver every member's profile so names render at share time.
      profileDids = Array.isArray(members) ? members.filter((m) => typeof m === 'string') : []
    } else if (schema.startsWith(CHAT_MESSAGE_SCHEMA_PREFIX)) {
      const channel = change.payload.properties?.channel
      channelId = typeof channel === 'string' ? channel : null
      // Deliver the message author's profile so their name renders.
      profileDids = [change.authorDid]
    } else {
      return
    }
    if (!channelId) return

    if (!(await gate.canWriteNodeChange(change.authorDid, channelId, schema))) return

    const room = channelShareRoom(channelId)
    await this.storage.addChangeToRoom(room, change.hash)
    // Deliver in real time to anyone subscribed to the channel room.
    this.options.broadcastToRoom?.(room, change)
    for (const did of profileDids) {
      const profileHash = await this.storage.getLatestProfileHash(did)
      if (profileHash) await this.storage.addChangeToRoom(room, profileHash)
    }
  }

  /**
   * Wipe every stored node-change for a room ("reset my data" dev tool).
   * Gated on `hub/relay` for the room — you can only clear rooms you can write
   * to (a user's own author room, their own document rooms). Returns how many
   * changes were removed so the caller can confirm the reset.
   */
  async handleClear(msg: NodeClearRequest, auth: AuthContext): Promise<NodeClearedResponse> {
    if (!auth.can('hub/relay', msg.room)) {
      throw new NodeRelayError('UNAUTHORIZED', 'Insufficient capabilities for node relay')
    }

    const cleared = await this.storage.clearNodeChanges(msg.room)
    return { type: 'node-cleared', room: msg.room, cleared }
  }

  async handleSyncRequest(msg: NodeSyncRequest, auth: AuthContext): Promise<NodeSyncResponse> {
    if (!auth.can('hub/relay', msg.room)) {
      throw new NodeRelayError('UNAUTHORIZED', 'Insufficient capabilities for node relay')
    }

    // Channel share rooms (0298) are served from the hash→room mapping and
    // cursor on a per-room `seq` (carried opaquely in `sinceLamport`/
    // `highWaterMark`), not the author lamport used for author/doc rooms.
    if (msg.room.startsWith('xnet-channel-')) {
      const { changes, highWaterMark } = await this.storage.getRoomChangesSince(
        msg.room,
        msg.sinceLamport
      )
      return { type: 'node-sync-response', room: msg.room, changes, highWaterMark }
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
    // Fall back to the redundant top-level schemaId when the payload's is
    // missing, so the relayed change round-trips intact (exploration 0206).
    const payload =
      serialized.payload && !serialized.payload.schemaId && serialized.schemaId
        ? { ...serialized.payload, schemaId: serialized.schemaId as NodePayload['schemaId'] }
        : serialized.payload
    return {
      id: serialized.id,
      type: serialized.type,
      hash: serialized.hash as ContentId,
      parentHash: serialized.parentHash as ContentId | null,
      authorDID: serialized.authorDid as DID,
      signature: base64ToBytes(serialized.signatureB64),
      wallTime: serialized.wallTime,
      lamport: serialized.lamportTime,
      payload,
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
