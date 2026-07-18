/**
 * @xnetjs/hub - Node change relay service.
 */
import type { RemoteMutationTelemetryOptions } from './remote-mutation-telemetry'
import type { AuthContext } from '../auth/ucan'
import type { HubStorage, SerializedNodeChange } from '../storage/interface'
import type { ContentId, DID } from '@xnetjs/core'
import { TaggedError } from '@xnetjs/core'
import { base64ToBytes } from '@xnetjs/crypto'
import {
  accountRecordId,
  evaluateLedgerWrite,
  foldAccountRecord,
  isSystemNamespaceResource,
  isSystemSchemaIri,
  isValidMentions,
  ledgerAccountId,
  ledgerWriteKind,
  revocationRecordId
} from '@xnetjs/data'
import { parseDID } from '@xnetjs/identity'
import {
  CURRENT_PROTOCOL_VERSION,
  recomputeChangeHash,
  verifyChangeFast,
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
  /**
   * More changes remain past `highWaterMark`. Optional so a client talking to
   * an older hub (which never sets it) still reads as "caught up" rather than
   * looping forever.
   */
  hasMore?: boolean
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

export class NodeRelayError extends TaggedError<'NodeRelayError'> {
  readonly _tag = 'NodeRelayError'

  constructor(
    public code:
      | 'UNAUTHORIZED'
      | 'MISSING_SCOPE'
      | 'INVALID_CHANGE'
      | 'INVALID_SIGNATURE'
      | 'INVALID_HASH'
      // Account-ledger write not signed by an active controller (0149/0243/0337).
      | 'LEDGER_UNAUTHORIZED'
      // `wallTime` is implausibly far in the future (grinding guard, 0305).
      | 'INVALID_WALL_TIME'
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
   * Reject a change whose `wallTime` is more than this many milliseconds in the
   * future (exploration 0305, fix G). `wallTime` is the middle LWW tiebreak
   * rung and is a client-supplied `Date.now()`; without a bound an attacker can
   * set it far ahead to win the wallTime rung without ever reaching the author
   * tiebreak. Default 5 minutes. Set to 0/negative to disable (self-host).
   */
  maxWallTimeSkewMs?: number
  /**
   * Clock source for the {@link maxWallTimeSkewMs} bound. Injectable for tests;
   * defaults to `Date.now`.
   */
  now?: () => number
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

/**
 * Default upper bound on how far a change's `wallTime` may lead the hub clock
 * (exploration 0305, fix G). Five minutes tolerates ordinary client clock skew
 * while bounding the future-wallTime LWW-tiebreak grind.
 */
const DEFAULT_MAX_WALL_TIME_SKEW_MS = 5 * 60_000

/** Serialized byte size a change contributes to a user's quota. */
const changeUsageBytes = (change: SerializedNodeChange): number =>
  JSON.stringify(change.payload).length + change.signatureB64.length

/** The share room that carries a channel's nodes to its grantees (0298). */
export const channelShareRoom = (channelId: string): string => `xnet-channel-${channelId}`

/** The share room that carries a workspace (bench) node to its grantees (0298). */
export const workspaceShareRoom = (workspaceId: string): string => `xnet-workspace-${workspaceId}`

const CHANNEL_SCHEMA_PREFIX = 'xnet://xnet.fyi/Channel@'
const CHAT_MESSAGE_SCHEMA_PREFIX = 'xnet://xnet.fyi/ChatMessage@'
const WORKSPACE_SCHEMA_PREFIX = 'xnet://xnet.fyi/Workspace@'

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

    if (!(await verifyChangeFast(change, publicKey))) {
      throw new NodeRelayError('INVALID_SIGNATURE', 'Change signature is invalid')
    }

    // Bound wallTime to now + skew (exploration 0305, fix G). wallTime is the
    // middle LWW tiebreak rung and is a client-set Date.now(); an unbounded
    // future value wins that rung outright, a cheaper grind than the author
    // tiebreak. A bound closes it without needing synchronized clocks (skew is
    // generous). The signature already covers wallTime, so this only rejects a
    // hostile/mis-clocked author, never corrupts a valid one.
    const maxSkew = this.options.maxWallTimeSkewMs ?? DEFAULT_MAX_WALL_TIME_SKEW_MS
    if (maxSkew > 0) {
      const now = (this.options.now ?? Date.now)()
      if (typeof change.wallTime === 'number' && change.wallTime > now + maxSkew) {
        throw new NodeRelayError(
          'INVALID_WALL_TIME',
          `Change wallTime ${change.wallTime} is more than ${maxSkew}ms in the future ` +
            `(hub now ${now}); rejecting to bound LWW-tiebreak grinding.`
        )
      }
    }

    // Structured mentions (exploration 0168): clients declare mentions;
    // the hub validates plaintext declarations (shape + size cap) so a
    // hostile client cannot mention-bomb through the relay.
    const mentions = (change.payload?.properties as Record<string, unknown> | undefined)?.mentions
    if (mentions !== undefined && mentions !== null && !isValidMentions(mentions)) {
      throw new NodeRelayError('INVALID_CHANGE', 'Malformed mentions declaration')
    }

    // Account-ledger enforcement (0149/0243, wired by 0337): ledger records are
    // only writable by an active controller of the account they reference.
    await this.enforceLedgerWrite(msg.room, msg.change)

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
      await this.fanOutToShareRoom(msg.change)
    } catch (err) {
      console.error('[node-relay] share-room fan-out failed:', err)
    }

    return true
  }

  /**
   * Account-ledger enforcement (explorations 0149/0243, wired by 0337): before
   * appending an `AccountRecord`/`DeviceRecord`/`RecoveryRecord`/
   * `RevocationRecord` change, hydrate what this hub knows about the account
   * from its own change log (same room — ledger records live in their author's
   * sync room) and require the write to be signed by an active controller.
   * Genesis (first account record, author among controllers) is the anchor;
   * everything after must chain from it. Stateless per request — no cache to
   * go stale across hub restarts.
   */
  private async enforceLedgerWrite(room: string, change: SerializedNodeChange): Promise<void> {
    const schemaId = change.payload.schemaId ?? change.schemaId
    const kind = ledgerWriteKind(schemaId)
    if (!kind) return
    const properties = change.payload.properties ?? {}
    const accountId = ledgerAccountId(kind, properties)

    let account: ReturnType<typeof foldAccountRecord> | null = null
    let authorRevoked = false
    if (accountId) {
      const accountChanges = await this.storage.getNodeChangesForNode(
        room,
        accountRecordId(accountId)
      )
      if (accountChanges.length > 0) {
        // Fold in lamport order so the latest state of each property wins.
        const merged: Record<string, unknown> = {}
        for (const c of [...accountChanges].sort((a, b) => a.lamportTime - b.lamportTime)) {
          Object.assign(merged, c.payload.properties ?? {})
        }
        account = foldAccountRecord(merged)
      }
      const authorRevocation = await this.storage.getNodeChangesForNode(
        room,
        revocationRecordId(accountId, change.authorDid)
      )
      authorRevoked = authorRevocation.length > 0
    }

    const decision = evaluateLedgerWrite({
      schemaId,
      authorDid: change.authorDid,
      properties,
      state: { account, authorRevoked }
    })
    if (!decision.allowed) {
      reportUnauthorizedRemoteWrite(this.telemetryOptions, change.authorDid)
      throw new NodeRelayError('LEDGER_UNAUTHORIZED', decision.reason)
    }
  }

  /**
   * If the change is a Channel or ChatMessage the author may write, index it
   * (and the relevant member/author Profile) into the channel's share room so
   * grantees receive the channel node, its history, and members' names (0298).
   */
  private async fanOutToShareRoom(change: SerializedNodeChange): Promise<void> {
    const gate = this.options.shareAccess
    if (!gate) return
    const schema = change.schemaId ?? change.payload.schemaId ?? ''

    // The resource the fan-out is gated + keyed on, its share room, and any
    // profiles to deliver alongside (channels carry members' names).
    let resourceId: string | null = null
    let room: string | null = null
    let profileDids: string[] = []
    if (schema.startsWith(CHANNEL_SCHEMA_PREFIX)) {
      resourceId = change.nodeId
      room = channelShareRoom(resourceId)
      const members = change.payload.properties?.members
      // Deliver every member's profile so names render at share time.
      profileDids = Array.isArray(members) ? members.filter((m) => typeof m === 'string') : []
    } else if (schema.startsWith(CHAT_MESSAGE_SCHEMA_PREFIX)) {
      const channel = change.payload.properties?.channel
      resourceId = typeof channel === 'string' ? channel : null
      room = resourceId ? channelShareRoom(resourceId) : null
      // Deliver the message author's profile so their name renders.
      profileDids = [change.authorDid]
    } else if (schema.startsWith(WORKSPACE_SCHEMA_PREFIX)) {
      // A workspace (bench) is a single node — no children, no profiles (0298).
      resourceId = change.nodeId
      room = workspaceShareRoom(resourceId)
    } else {
      return
    }
    if (!resourceId || !room) return

    if (!(await gate.canWriteNodeChange(change.authorDid, resourceId, schema))) return

    await this.storage.addChangeToRoom(room, change.hash)
    // Deliver in real time to anyone subscribed to the share room.
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

    // Share rooms (channels + workspaces, 0298) are served from the hash→room
    // mapping and cursor on a per-room `seq` (carried opaquely in
    // `sinceLamport`/`highWaterMark`), not the author lamport used for
    // author/doc rooms.
    if (msg.room.startsWith('xnet-channel-') || msg.room.startsWith('xnet-workspace-')) {
      const { changes, highWaterMark, hasMore } = await this.storage.getRoomChangesSince(
        msg.room,
        msg.sinceLamport
      )
      return { type: 'node-sync-response', room: msg.room, changes, highWaterMark, hasMore }
    }

    // The page carries its own mark: on a full page it is the last change in
    // the page, NOT the room-wide max, so a >1-page catch-up can't leave the
    // client's cursor parked beyond changes it never received (the mark is
    // persisted and monotonic, so such a gap never heals). `hasMore` asks the
    // client to come straight back for the next page.
    const { changes, highWaterMark, hasMore } = await this.storage.getNodeChangesSince(
      msg.room,
      msg.sinceLamport
    )

    return {
      type: 'node-sync-response',
      room: msg.room,
      changes,
      highWaterMark,
      hasMore
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
