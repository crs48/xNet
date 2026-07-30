/**
 * @xnetjs/hub - Published `node-change` handler: authorize, enforce share-grant
 * write roles, persist via the node relay, maintain Space containment, then
 * FALL THROUGH so a new change still broadcasts to room subscribers via
 * signaling.
 */

import type { Metrics } from '../../middleware/metrics'
import type { NodeRelayService } from '../../services/node-relay'
import type { RemoteMutationTelemetryOptions } from '../../services/remote-mutation-telemetry'
import type { ShareAccessService } from '../../services/share-access'
import type { HubStorage } from '../../storage/interface'
import type { NodeChangeBatchMessage, NodeChangeMessage, PublishMessage } from '../guards'
import type { WsConnectionContext, WsHandler, WsHandlerResult } from '../message-router'
import { HUB_METRICS } from '../../middleware/metrics'
import { NodeRelayError } from '../../services/node-relay'
import { reportUnauthorizedRemoteWrite } from '../../services/remote-mutation-telemetry'
import { authorizeRoomAction, topicToResource } from '../authorize'
import { buildWsError } from '../errors'

// ─── Space containment maintenance (exploration 0179) ─────────────────────────
// Schemas that carry a `space` relation (their canonical security home).
const SPACEABLE_SCHEMA_PREFIXES = [
  'xnet://xnet.fyi/Page',
  'xnet://xnet.fyi/Database',
  'xnet://xnet.fyi/Canvas',
  'xnet://xnet.fyi/Dashboard',
  'xnet://xnet.fyi/Project',
  'xnet://xnet.fyi/Channel',
  'xnet://xnet.fyi/Task'
]
const SPACE_SCHEMA_PREFIX = 'xnet://xnet.fyi/Space'

const firstRelationId = (value: unknown): string | null => {
  if (typeof value === 'string') return value.trim() || null
  if (Array.isArray(value)) return value.length > 0 ? firstRelationId(value[0]) : null
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id.trim() || null : null
  }
  return null
}

type ContainmentChange = {
  nodeId?: string
  schemaId?: string
  /** Signed author of the change; verified at ingest. */
  authorDid?: string
  payload?: {
    nodeId?: string
    schemaId?: string
    properties?: Record<string, unknown>
    deleted?: boolean
  }
}

/**
 * Keep the hub's node→container index fresh from relayed node-changes so
 * container (Space) grants resolve. A content node's container is its `space`;
 * a Space's container is its `parent`. Only updates when the relevant property
 * is actually present in the change (partial CRDT updates never clobber it).
 *
 * Also records Space OWNERSHIP (first writer wins), preferring the change's
 * signed `authorDid` over the relaying session — the signature is verified at
 * ingest, whereas the session's capability may be a self-issued wildcard. A
 * Space grant is a container (subtree) grant, so "who may share this Space"
 * has to be answerable without depending on the optional `index-update`
 * publisher that writes `doc_meta` — see `canManageShares` in
 * routes/share-links.ts.
 */
export const maintainSpaceContainment = async (
  storage: HubStorage,
  change: ContainmentChange,
  relayingDid?: string
): Promise<void> => {
  const nodeId = change.payload?.nodeId ?? change.nodeId
  const schemaId = change.schemaId ?? change.payload?.schemaId
  const properties = change.payload?.properties
  if (!nodeId || !schemaId || !properties || change.payload?.deleted) return
  const hasKey = (k: string): boolean => Object.prototype.hasOwnProperty.call(properties, k)
  const recordVisibility = async (): Promise<void> => {
    if (!hasKey('visibility')) return
    const value = properties.visibility
    await storage.setNodeVisibility(nodeId, typeof value === 'string' ? value : null)
  }
  if (schemaId.startsWith(SPACE_SCHEMA_PREFIX)) {
    const ownerDid = change.authorDid ?? relayingDid
    if (ownerDid) await storage.setNodeOwnerIfAbsent(nodeId, ownerDid)
    if (hasKey('parent')) await storage.setNodeContainer(nodeId, firstRelationId(properties.parent))
    await recordVisibility()
    return
  }
  if (SPACEABLE_SCHEMA_PREFIXES.some((prefix) => schemaId.startsWith(prefix))) {
    if (hasKey('space')) await storage.setNodeContainer(nodeId, firstRelationId(properties.space))
    await recordVisibility()
  }
}

type NodeChangeRelayDeps = {
  storage: HubStorage
  nodeRelay: NodeRelayService
  shareAccess: ShareAccessService
  metrics: Metrics
  remoteMutationTelemetry: RemoteMutationTelemetryOptions
}

/**
 * The outcome of relaying ONE change. Batched and single pushes share this
 * pipeline verbatim — a batch is a transport optimization, never a weaker
 * check — so authorization, share-grant roles, signature verification, quota,
 * and containment behave identically whichever frame carried the change.
 */
type RelayOutcome =
  | { status: 'accepted' }
  /** Already stored (idempotent redelivery) — accepted, but nothing to broadcast. */
  | { status: 'duplicate' }
  | { status: 'rejected'; error: ReturnType<typeof buildWsError> }

const relayOneChange = async (
  deps: NodeChangeRelayDeps,
  message: NodeChangeMessage,
  ctx: WsConnectionContext
): Promise<RelayOutcome> => {
  const roomDecision = await authorizeRoomAction({
    storage: deps.storage,
    session: ctx.session,
    action: 'hub/relay',
    topic: message.room,
    shareAccess: deps.shareAccess
  })
  if (!roomDecision.allowed) {
    // Deny form 2 (see ws/authorize.ts): write attempt → abuse telemetry,
    // then node-error; the socket stays open.
    reportUnauthorizedRemoteWrite(deps.remoteMutationTelemetry, ctx.session.did)
    return {
      status: 'rejected',
      error: buildWsError({
        kind: 'node-error',
        code: roomDecision.code ?? 'UNAUTHORIZED',
        error: roomDecision.message ?? 'Unauthorized',
        action: 'hub/relay',
        resource: topicToResource(message.room)
      })
    }
  }

  // Share-grant role enforcement: read grantees cannot relay
  // node-changes; comment grantees only comment-kind schemas.
  // Checked for the session DID and the change author DID.
  const changeResource = topicToResource(message.room)
  const changeSchemaId = message.change.schemaId ?? message.change.payload?.schemaId
  const writerDids = new Set([ctx.session.did, message.change.authorDid])
  for (const writerDid of writerDids) {
    if (!writerDid || writerDid === 'did:key:anonymous') continue
    const allowed = await deps.shareAccess.canWriteNodeChange(
      writerDid,
      changeResource,
      changeSchemaId
    )
    if (!allowed) {
      reportUnauthorizedRemoteWrite(deps.remoteMutationTelemetry, writerDid)
      return {
        status: 'rejected',
        error: buildWsError({
          kind: 'node-error',
          code: 'WRITE_FORBIDDEN',
          error: 'Share grant does not allow writing to this document',
          action: 'hub/relay',
          resource: changeResource
        })
      }
    }
  }

  try {
    const isNew = await deps.nodeRelay.handleNodeChange(message, ctx.authContext)
    // Maintain the Space containment index (best-effort, never blocks relay).
    try {
      await maintainSpaceContainment(deps.storage, message.change, ctx.session.did)
    } catch {
      /* containment is advisory; a failure must not drop the change */
    }
    return isNew ? { status: 'accepted' } : { status: 'duplicate' }
  } catch (err) {
    if (err instanceof NodeRelayError) {
      return {
        status: 'rejected',
        error: buildWsError({
          kind: 'node-error',
          code: err.code,
          error: err.message,
          action: err.action,
          resource: err.resource
        })
      }
    }
    throw err
  }
}

export const createNodeChangeHandler = (
  deps: NodeChangeRelayDeps
): WsHandler<PublishMessage & { data: NodeChangeMessage }> => {
  return async (payload, ctx): Promise<WsHandlerResult> => {
    const outcome = await relayOneChange(deps, payload.data, ctx)
    if (outcome.status === 'rejected') {
      ctx.ws.send(JSON.stringify(outcome.error))
      deps.metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
      return 'handled'
    }
    if (outcome.status === 'duplicate') return 'handled'
    // New change: fall through so signaling broadcasts the publish.
    return 'continue'
  }
}

/**
 * Batched push handler (exploration 0357 Tier 1).
 *
 * Relays each change through the identical per-change pipeline, then
 * re-broadcasts the accepted ones individually as ordinary `node-change`
 * messages. That last part is what keeps this backward compatible: a
 * subscriber that has never heard of batching still receives exactly the
 * stream it expects.
 *
 * A rejected change does NOT abort the batch — the client needs to know which
 * changes failed, and one bad change shouldn't discard 999 good ones. Errors
 * are reported per change (each carries its own hash) and the surviving
 * changes still land.
 */
export const createNodeChangeBatchHandler = (
  deps: NodeChangeRelayDeps & {
    signaling: { publishFromHub: (topic: string, data: unknown) => void }
  }
): WsHandler<PublishMessage & { data: NodeChangeBatchMessage }> => {
  return async (payload, ctx): Promise<WsHandlerResult> => {
    const { room, changes } = payload.data

    for (const change of changes) {
      const outcome = await relayOneChange(deps, { type: 'node-change', room, change }, ctx)

      if (outcome.status === 'rejected') {
        ctx.ws.send(JSON.stringify({ ...outcome.error, hash: change.hash }))
        deps.metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
        continue
      }
      if (outcome.status === 'duplicate') continue

      // Fan out as a single change so batch-unaware subscribers are unaffected.
      deps.signaling.publishFromHub(room, { type: 'node-change', room, change })
    }

    // Never fall through: the batch frame itself must not be broadcast, since
    // we already emitted the per-change messages subscribers understand.
    return 'handled'
  }
}
