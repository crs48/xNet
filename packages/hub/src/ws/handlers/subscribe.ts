/**
 * @xnetjs/hub - Subscribe/unsubscribe stages.
 *
 * Two-phase like the original pump: the auth gate runs BEFORE signaling sees
 * the subscribe (deny → close), while the bookkeeping stage runs AFTER
 * signaling has registered the subscription (room join, awareness snapshot).
 */

import type { Metrics } from '../../middleware/metrics'
import type { AwarenessService } from '../../services/awareness'
import type { RelayService } from '../../services/relay'
import type { ShareAccessService } from '../../services/share-access'
import type { createSignalingService } from '../../services/signaling'
import type { HubStorage } from '../../storage/interface'
import type { SubscribeMessage, UnsubscribeMessage } from '../guards'
import type { WsHandler, WsHandlerResult } from '../message-router'
import type { WebSocket } from 'ws'
import { HUB_METRICS } from '../../middleware/metrics'
import { requireRoomAuth, topicToResource } from '../authorize'
import { buildWsError } from '../errors'
import { parseTopics } from '../guards'

type SignalingService = ReturnType<typeof createSignalingService>

/**
 * Auth gate for subscribes (only registered when `config.auth` is on).
 * Falls through on success so signaling + bookkeeping still run.
 */
export const createSubscribeAuthHandler = (deps: {
  storage: HubStorage
  shareAccess: ShareAccessService
  metrics: Metrics
}): WsHandler<SubscribeMessage> => {
  return async (payload, ctx): Promise<WsHandlerResult> => {
    const topics = parseTopics(payload.topics)
    const auth = await requireRoomAuth({
      storage: deps.storage,
      session: ctx.session,
      action: 'hub/signal',
      topics,
      shareAccess: deps.shareAccess
    })
    if (!auth.ok) {
      // Deny form 3 (see ws/authorize.ts): auth-denied + close(4403); unlike
      // the doc-publish gate this one does NOT report abuse telemetry.
      const resource = topicToResource(auth.topic)
      ctx.ws.send(
        JSON.stringify(
          buildWsError({
            kind: 'auth-denied',
            code: auth.decision.code ?? 'UNAUTHORIZED',
            action: 'hub/signal',
            resource,
            error: auth.decision.message ?? 'Insufficient capabilities for room'
          })
        )
      )
      deps.metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
      ctx.ws.close(4403, auth.decision.message ?? 'Insufficient capabilities for room')
      return 'handled'
    }
    return 'continue'
  }
}

/** Post-signaling subscribe bookkeeping: relay room join + awareness snapshot. */
export const createSubscribeBookkeepingHandler = (deps: {
  relay: RelayService
  awareness: AwarenessService
  signaling: SignalingService
  socketTopics: Map<WebSocket, Set<string>>
}): WsHandler<SubscribeMessage> => {
  return async (payload, ctx): Promise<WsHandlerResult> => {
    const topics = parseTopics(payload.topics)
    if (topics.length > 0) {
      const existing = deps.socketTopics.get(ctx.ws) ?? new Set<string>()
      for (const topic of topics) {
        if (!existing.has(topic)) {
          existing.add(topic)
          void deps.relay.handleRoomJoin(topic, deps.signaling.publishFromHub)
          const snapshot = await deps.awareness.getSnapshot(topic)
          if (snapshot.length > 0 && ctx.ws.readyState === 1) {
            ctx.ws.send(
              JSON.stringify({
                type: 'publish',
                topic,
                data: {
                  type: 'awareness-snapshot',
                  from: 'hub-relay',
                  users: snapshot.map((entry) => ({
                    did: entry.userDid,
                    state: entry.state,
                    lastSeen: entry.lastSeen,
                    isStale: Date.now() - entry.lastSeen > 5 * 60 * 1000
                  }))
                }
              })
            )
          }
        }
      }
      deps.socketTopics.set(ctx.ws, existing)
    }
    return 'continue'
  }
}

/** Post-signaling unsubscribe bookkeeping: relay room leave + awareness exit. */
export const createUnsubscribeBookkeepingHandler = (deps: {
  relay: RelayService
  awareness: AwarenessService
  socketTopics: Map<WebSocket, Set<string>>
}): WsHandler<UnsubscribeMessage> => {
  return async (payload, ctx): Promise<WsHandlerResult> => {
    const topics = parseTopics(payload.topics)
    const existing = deps.socketTopics.get(ctx.ws)
    if (existing && topics.length > 0) {
      for (const topic of topics) {
        if (existing.delete(topic)) {
          deps.relay.handleRoomLeave(topic)
          await deps.awareness.handleDisconnect(topic, ctx.authContext.did)
        }
      }
      if (existing.size === 0) {
        deps.socketTopics.delete(ctx.ws)
      }
    }
    return 'continue'
  }
}
