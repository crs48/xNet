/**
 * @xnetjs/hub - Publish pipeline stages that precede the generic signaling
 * broadcast: the doc-topic auth gate, awareness ingestion, and the Yjs sync
 * relay (with per-connection peer tracking). All stages fall through on
 * success so the message still reaches signaling.
 */

import type { Metrics } from '../../middleware/metrics'
import type { AwarenessService } from '../../services/awareness'
import type { RelayService } from '../../services/relay'
import type { RemoteMutationTelemetryOptions } from '../../services/remote-mutation-telemetry'
import type { ShareAccessService } from '../../services/share-access'
import type { createSignalingService } from '../../services/signaling'
import type { HubStorage } from '../../storage/interface'
import type { AwarenessMessage, PublishMessage } from '../guards'
import type { WsHandler, WsHandlerResult } from '../message-router'
import type { WebSocket } from 'ws'
import { HUB_METRICS } from '../../middleware/metrics'
import { reportUnauthorizedRemoteWrite } from '../../services/remote-mutation-telemetry'
import { authorizeRoomAction, denyAndCloseSocket, topicToResource } from '../authorize'
import { buildWsError } from '../errors'
import { getPublishPeerId, isSyncRelayMessage } from '../guards'

type SignalingService = ReturnType<typeof createSignalingService>

/**
 * Auth gate for publishes into `xnet-doc-*` rooms (only registered when
 * `config.auth` is on). Falls through on success.
 */
export const createDocPublishAuthHandler = (deps: {
  storage: HubStorage
  shareAccess: ShareAccessService
  metrics: Metrics
  remoteMutationTelemetry: RemoteMutationTelemetryOptions
}): WsHandler<PublishMessage & { topic: string }> => {
  return async (payload, ctx): Promise<WsHandlerResult> => {
    const publishDecision = await authorizeRoomAction({
      storage: deps.storage,
      session: ctx.session,
      action: 'hub/signal',
      topic: payload.topic,
      shareAccess: deps.shareAccess
    })
    if (!publishDecision.allowed) {
      // Deny form 4 (see ws/authorize.ts): a doc publish is a write attempt,
      // so unlike the subscribe gate this reports abuse telemetry, then
      // auth-denied + close(4403).
      reportUnauthorizedRemoteWrite(deps.remoteMutationTelemetry, ctx.session.did)
      denyAndCloseSocket(ctx.ws, publishDecision, 'hub/signal', payload.topic, deps.metrics)
      return 'handled'
    }
    return 'continue'
  }
}

/** Awareness ingestion for published awareness updates. Falls through when accepted. */
export const createAwarenessPublishHandler = (deps: {
  awareness: AwarenessService
  metrics: Metrics
}): WsHandler<PublishMessage & { topic: string; data: AwarenessMessage }> => {
  return async (payload, ctx): Promise<WsHandlerResult> => {
    const accepted = await deps.awareness.handleAwarenessMessage(
      payload.topic,
      ctx.authContext.did,
      payload.data
    )
    if (!accepted) {
      deps.metrics.increment(HUB_METRICS.WS_MESSAGES_REJECTED)
      return 'handled'
    }
    return 'continue'
  }
}

/**
 * Peer tracking for every topic publish, plus the Yjs sync relay (with
 * share-grant write enforcement) for `xnet-doc-*` sync messages.
 */
export const createSyncRelayPublishHandler = (deps: {
  relay: RelayService
  shareAccess: ShareAccessService
  signaling: SignalingService
  metrics: Metrics
  remoteMutationTelemetry: RemoteMutationTelemetryOptions
  socketPeers: Map<WebSocket, Set<string>>
}): WsHandler<PublishMessage & { topic: string }> => {
  return async (payload, ctx): Promise<WsHandlerResult> => {
    const peerId = getPublishPeerId(payload)
    if (peerId) {
      const peers = deps.socketPeers.get(ctx.ws) ?? new Set<string>()
      peers.add(peerId)
      deps.socketPeers.set(ctx.ws, peers)
    }

    if (payload.topic.startsWith('xnet-doc-') && isSyncRelayMessage(payload.data)) {
      // sync-step2 / sync-update carry Yjs document updates;
      // share grantees below `write` may not relay them
      // (sync-step1 is a state request and stays readable).
      if (payload.data.type !== 'sync-step1' && ctx.session.did !== 'did:key:anonymous') {
        const yjsResource = topicToResource(payload.topic)
        const allowed = await deps.shareAccess.canWriteYjs(ctx.session.did, yjsResource)
        if (!allowed) {
          reportUnauthorizedRemoteWrite(deps.remoteMutationTelemetry, ctx.session.did)
          ctx.ws.send(
            JSON.stringify(
              buildWsError({
                kind: 'auth-denied',
                code: 'WRITE_FORBIDDEN',
                action: 'hub/relay',
                resource: yjsResource,
                error: 'Share grant does not allow editing this document'
              })
            )
          )
          deps.metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
          deps.metrics.increment(HUB_METRICS.WS_MESSAGES_REJECTED)
          return 'handled'
        }
      }
      const accepted = await deps.relay.handleSyncMessage(
        payload.topic,
        payload.data,
        deps.signaling.publishFromHub
      )
      if (!accepted) {
        deps.metrics.increment(HUB_METRICS.WS_MESSAGES_REJECTED)
        return 'handled'
      }
    }
    return 'continue'
  }
}
