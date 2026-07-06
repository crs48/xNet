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
import type { NodeChangeMessage, PublishMessage } from '../guards'
import type { WsHandler, WsHandlerResult } from '../message-router'
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
 */
export const maintainSpaceContainment = async (
  storage: HubStorage,
  change: ContainmentChange
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
    if (hasKey('parent')) await storage.setNodeContainer(nodeId, firstRelationId(properties.parent))
    await recordVisibility()
    return
  }
  if (SPACEABLE_SCHEMA_PREFIXES.some((prefix) => schemaId.startsWith(prefix))) {
    if (hasKey('space')) await storage.setNodeContainer(nodeId, firstRelationId(properties.space))
    await recordVisibility()
  }
}

export const createNodeChangeHandler = (deps: {
  storage: HubStorage
  nodeRelay: NodeRelayService
  shareAccess: ShareAccessService
  metrics: Metrics
  remoteMutationTelemetry: RemoteMutationTelemetryOptions
}): WsHandler<PublishMessage & { data: NodeChangeMessage }> => {
  return async (payload, ctx): Promise<WsHandlerResult> => {
    const roomDecision = await authorizeRoomAction({
      storage: deps.storage,
      session: ctx.session,
      action: 'hub/relay',
      topic: payload.data.room,
      shareAccess: deps.shareAccess
    })
    if (!roomDecision.allowed) {
      // Deny form 2 (see ws/authorize.ts): write attempt → abuse telemetry,
      // then node-error; the socket stays open.
      reportUnauthorizedRemoteWrite(deps.remoteMutationTelemetry, ctx.session.did)
      ctx.ws.send(
        JSON.stringify(
          buildWsError({
            kind: 'node-error',
            code: roomDecision.code ?? 'UNAUTHORIZED',
            error: roomDecision.message ?? 'Unauthorized',
            action: 'hub/relay',
            resource: topicToResource(payload.data.room)
          })
        )
      )
      deps.metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
      return 'handled'
    }

    // Share-grant role enforcement: read grantees cannot relay
    // node-changes; comment grantees only comment-kind schemas.
    // Checked for the session DID and the change author DID.
    const changeResource = topicToResource(payload.data.room)
    const changeSchemaId = payload.data.change.schemaId ?? payload.data.change.payload?.schemaId
    const writerDids = new Set([ctx.session.did, payload.data.change.authorDid])
    for (const writerDid of writerDids) {
      if (!writerDid || writerDid === 'did:key:anonymous') continue
      const allowed = await deps.shareAccess.canWriteNodeChange(
        writerDid,
        changeResource,
        changeSchemaId
      )
      if (!allowed) {
        reportUnauthorizedRemoteWrite(deps.remoteMutationTelemetry, writerDid)
        ctx.ws.send(
          JSON.stringify(
            buildWsError({
              kind: 'node-error',
              code: 'WRITE_FORBIDDEN',
              error: 'Share grant does not allow writing to this document',
              action: 'hub/relay',
              resource: changeResource
            })
          )
        )
        deps.metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
        return 'handled'
      }
    }

    try {
      const isNew = await deps.nodeRelay.handleNodeChange(payload.data, ctx.authContext)
      // Maintain the Space containment index (best-effort, never blocks relay).
      try {
        await maintainSpaceContainment(deps.storage, payload.data.change)
      } catch {
        /* containment is advisory; a failure must not drop the change */
      }
      if (!isNew) return 'handled'
    } catch (err) {
      if (err instanceof NodeRelayError) {
        ctx.ws.send(
          JSON.stringify(
            buildWsError({
              kind: 'node-error',
              code: err.code,
              error: err.message,
              action: err.action,
              resource: err.resource
            })
          )
        )
        deps.metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
        return 'handled'
      }
      throw err
    }
    // New change: fall through so signaling broadcasts the publish.
    return 'continue'
  }
}
