/**
 * @xnetjs/hub - WS route registration (exploration 0276 Theme 2).
 *
 * Builds the message router with every stage of the old inline pump, in the
 * pump's EXACT original branch order. Order is load-bearing: several stages
 * match the same `publish` type and fall through to later stages (auth gate →
 * node-change persist → awareness → Yjs relay → signaling broadcast).
 */

import type { Metrics } from '../middleware/metrics'
import type { AwarenessService } from '../services/awareness'
import type { FederationService } from '../services/federation'
import type { NodeRelayService } from '../services/node-relay'
import type { QueryService } from '../services/query'
import type { RelayService } from '../services/relay'
import type { RemoteMutationTelemetryOptions } from '../services/remote-mutation-telemetry'
import type { ShareAccessService } from '../services/share-access'
import type { createSignalingService } from '../services/signaling'
import type { HubStorage } from '../storage/interface'
import type { HubConfig } from '../types'
import type { WebSocket } from 'ws'
import {
  isAwarenessMessage,
  isClientHandshake,
  isIndexRemove,
  isIndexUpdate,
  isNodeChangeBatchPayload,
  isNodeChangePayload,
  isNodeClearRequest,
  isNodeSyncRequest,
  isPublishMessage,
  isQueryRequest,
  isSubscribeMessage,
  isUnsubscribeMessage,
  type AwarenessMessage,
  type NodeChangeBatchMessage,
  type NodeChangeMessage,
  type NodeSyncRequestMessage,
  type PublishMessage
} from './guards'
import { createClientHandshakeHandler } from './handlers/client-handshake'
import { createNodeChangeBatchHandler, createNodeChangeHandler } from './handlers/node-change'
import {
  createNodeClearHandler,
  createNodeSyncRequestHandler,
  createPublishedNodeSyncRequestHandler
} from './handlers/node-sync'
import {
  createAwarenessPublishHandler,
  createDocPublishAuthHandler,
  createSyncRelayPublishHandler
} from './handlers/publish-relay'
import { createQueryRequestHandler } from './handlers/query-request'
import { createIndexRemoveHandler, createIndexUpdateHandler } from './handlers/search-index'
import {
  createSubscribeAuthHandler,
  createSubscribeBookkeepingHandler,
  createUnsubscribeBookkeepingHandler
} from './handlers/subscribe'
import { createMessageRouter, type MessageRouter } from './message-router'

type SignalingService = ReturnType<typeof createSignalingService>

export type WsRouterDeps = {
  config: HubConfig
  storage: HubStorage
  metrics: Metrics
  query: QueryService
  federation: FederationService
  federationEnabled: boolean
  nodeRelay: NodeRelayService
  shareAccess: ShareAccessService
  awareness: AwarenessService
  relay: RelayService
  signaling: SignalingService
  remoteMutationTelemetry: RemoteMutationTelemetryOptions
  socketTopics: Map<WebSocket, Set<string>>
  socketPeers: Map<WebSocket, Set<string>>
}

export const createWsMessageRouter = (deps: WsRouterDeps): MessageRouter => {
  const router = createMessageRouter(deps.metrics)

  // Terminal typed handlers (each was an early-`return` branch in the pump).
  router.on('client-handshake', isClientHandshake, createClientHandshakeHandler(deps))
  router.on('query-request', isQueryRequest, createQueryRequestHandler(deps))
  router.on('index-update', isIndexUpdate, createIndexUpdateHandler(deps))
  router.on('index-remove', isIndexRemove, createIndexRemoveHandler(deps))
  router.on('node-sync-request', isNodeSyncRequest, createNodeSyncRequestHandler(deps))
  router.on('node-clear', isNodeClearRequest, createNodeClearHandler(deps))
  router.on(
    'publish',
    (value): value is PublishMessage & { data: NodeSyncRequestMessage } =>
      isPublishMessage(value) && isNodeSyncRequest(value.data),
    createPublishedNodeSyncRequestHandler(deps)
  )

  // Auth gates (only when the hub enforces auth; `config.auth` is fixed for
  // the server's lifetime). Both fall through on success.
  if (deps.config.auth) {
    router.on('subscribe', isSubscribeMessage, createSubscribeAuthHandler(deps))
    router.on(
      'publish',
      (value): value is PublishMessage & { topic: string } =>
        isPublishMessage(value) &&
        typeof value.topic === 'string' &&
        value.topic.startsWith('xnet-doc-'),
      createDocPublishAuthHandler(deps)
    )
  }

  // Publish pipeline: persist node-changes, ingest awareness, relay Yjs sync.
  router.on(
    'publish',
    (value): value is PublishMessage & { data: NodeChangeBatchMessage } =>
      isPublishMessage(value) && isNodeChangeBatchPayload(value.data),
    createNodeChangeBatchHandler(deps)
  )
  router.on(
    'publish',
    (value): value is PublishMessage & { data: NodeChangeMessage } =>
      isPublishMessage(value) && isNodeChangePayload(value.data),
    createNodeChangeHandler(deps)
  )
  router.on(
    'publish',
    (value): value is PublishMessage & { topic: string; data: AwarenessMessage } =>
      isPublishMessage(value) && typeof value.topic === 'string' && isAwarenessMessage(value.data),
    createAwarenessPublishHandler(deps)
  )
  router.on(
    'publish',
    (value): value is PublishMessage & { topic: string } =>
      isPublishMessage(value) && typeof value.topic === 'string',
    createSyncRelayPublishHandler(deps)
  )

  // Generic signaling pass-through (subscribe/unsubscribe/publish/ping) — the
  // pump handed every remaining message to the signaling service. Registered
  // under `ping` so ping traffic is counted; the guard matches everything.
  router.on(
    'ping',
    (value): value is unknown => true,
    (payload, ctx) => {
      deps.signaling.handleMessage(ctx.ws, payload)
      return 'continue'
    }
  )

  // Post-signaling bookkeeping (room join/leave, awareness snapshots).
  router.on('subscribe', isSubscribeMessage, createSubscribeBookkeepingHandler(deps))
  router.on('unsubscribe', isUnsubscribeMessage, createUnsubscribeBookkeepingHandler(deps))

  return router
}
