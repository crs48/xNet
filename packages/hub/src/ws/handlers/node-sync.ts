/**
 * @xnetjs/hub - Node-log sync handlers: `node-sync-request`, `node-clear`,
 * and the publish-wrapped `node-sync-request` variant.
 */

import type { AuthSession } from '../../auth/ucan'
import type { Metrics } from '../../middleware/metrics'
import type { NodeRelayService } from '../../services/node-relay'
import type { RemoteMutationTelemetryOptions } from '../../services/remote-mutation-telemetry'
import type { ShareAccessService } from '../../services/share-access'
import type { HubStorage } from '../../storage/interface'
import type { NodeClearMessage, NodeSyncRequestMessage, PublishMessage } from '../guards'
import type { WsConnectionContext, WsHandler, WsHandlerResult } from '../message-router'
import type { WebSocket } from 'ws'
import { HUB_METRICS } from '../../middleware/metrics'
import { NodeRelayError } from '../../services/node-relay'
import { reportUnauthorizedRemoteWrite } from '../../services/remote-mutation-telemetry'
import { authorizeRoomAction, topicToResource, type AuthzDecision } from '../authorize'
import { buildWsError } from '../errors'

type NodeSyncDeps = {
  storage: HubStorage
  nodeRelay: NodeRelayService
  shareAccess: ShareAccessService
  metrics: Metrics
  remoteMutationTelemetry: RemoteMutationTelemetryOptions
}

const sendNodeAuthDenied = (
  ws: WebSocket,
  decision: AuthzDecision,
  room: string,
  metrics: Metrics
): void => {
  ws.send(
    JSON.stringify(
      buildWsError({
        kind: 'node-error',
        code: decision.code ?? 'UNAUTHORIZED',
        error: decision.message ?? 'Unauthorized',
        action: 'hub/relay',
        resource: topicToResource(room)
      })
    )
  )
  metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
}

const sendNodeRelayError = (ws: WebSocket, err: NodeRelayError, metrics: Metrics): void => {
  ws.send(
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
  metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
}

const authorizeRelayRoom = async (
  deps: NodeSyncDeps,
  session: AuthSession,
  room: string
): Promise<AuthzDecision> =>
  authorizeRoomAction({
    storage: deps.storage,
    session,
    action: 'hub/relay',
    topic: room,
    shareAccess: deps.shareAccess
  })

const handleSyncRequest = async (
  deps: NodeSyncDeps,
  payload: NodeSyncRequestMessage,
  ctx: WsConnectionContext
): Promise<WsHandlerResult> => {
  const roomDecision = await authorizeRelayRoom(deps, ctx.session, payload.room)
  if (!roomDecision.allowed) {
    // Deny form 1 (see ws/authorize.ts): node-error, keep the socket open,
    // no abuse telemetry — a sync request is a read, not a write attempt.
    sendNodeAuthDenied(ctx.ws, roomDecision, payload.room, deps.metrics)
    return 'handled'
  }

  try {
    const response = await deps.nodeRelay.handleSyncRequest(payload, ctx.authContext)
    ctx.ws.send(JSON.stringify(response))
    deps.metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
  } catch (err) {
    if (err instanceof NodeRelayError) {
      sendNodeRelayError(ctx.ws, err, deps.metrics)
      return 'handled'
    }
    throw err
  }
  return 'handled'
}

export const createNodeSyncRequestHandler = (
  deps: NodeSyncDeps
): WsHandler<NodeSyncRequestMessage> => {
  return (payload, ctx) => handleSyncRequest(deps, payload, ctx)
}

/** `publish`-wrapped `node-sync-request` (data carries the request). */
export const createPublishedNodeSyncRequestHandler = (
  deps: NodeSyncDeps
): WsHandler<PublishMessage & { data: NodeSyncRequestMessage }> => {
  return (payload, ctx) => handleSyncRequest(deps, payload.data, ctx)
}

export const createNodeClearHandler = (deps: NodeSyncDeps): WsHandler<NodeClearMessage> => {
  return async (payload, ctx): Promise<WsHandlerResult> => {
    const roomDecision = await authorizeRelayRoom(deps, ctx.session, payload.room)
    if (!roomDecision.allowed) {
      // Deny form 2 (see ws/authorize.ts): a clear is a destructive write, so
      // the denial ALSO reports abuse telemetry before the node-error.
      reportUnauthorizedRemoteWrite(deps.remoteMutationTelemetry, ctx.session.did)
      sendNodeAuthDenied(ctx.ws, roomDecision, payload.room, deps.metrics)
      return 'handled'
    }

    try {
      const response = await deps.nodeRelay.handleClear(payload, ctx.authContext)
      ctx.ws.send(JSON.stringify(response))
      deps.metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
    } catch (err) {
      if (err instanceof NodeRelayError) {
        sendNodeRelayError(ctx.ws, err, deps.metrics)
        return 'handled'
      }
      throw err
    }
    return 'handled'
  }
}
