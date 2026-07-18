/**
 * @xnetjs/hub - Type guards for inbound WebSocket messages.
 *
 * Moved verbatim from server.ts (exploration 0276 Theme 2). Each guard both
 * narrows the parsed JSON payload and doubles as the router's match predicate.
 */

import type { SerializedNodeChange } from '../storage/interface'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

export const parseTopics = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

export type SubscribeMessage = { type: 'subscribe'; topics?: unknown }

export const isSubscribeMessage = (value: unknown): value is SubscribeMessage => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  return candidate.type === 'subscribe'
}

export type UnsubscribeMessage = { type: 'unsubscribe'; topics?: unknown }

export const isUnsubscribeMessage = (value: unknown): value is UnsubscribeMessage => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  return candidate.type === 'unsubscribe'
}

export type PublishMessage = { type: 'publish'; topic?: unknown; data?: unknown }

export const isPublishMessage = (value: unknown): value is PublishMessage => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  return candidate.type === 'publish'
}

export type QueryRequestMessage = {
  type: 'query-request'
  id: string
  query: string
  federate?: boolean
}

export const isQueryRequest = (value: unknown): value is QueryRequestMessage => {
  if (!isRecord(value)) return false
  return (
    value.type === 'query-request' &&
    typeof value.id === 'string' &&
    typeof value.query === 'string'
  )
}

export type IndexUpdateMessage = {
  type: 'index-update'
  docId: string
  meta: { schemaIri: string; title: string }
}

export const isIndexUpdate = (value: unknown): value is IndexUpdateMessage => {
  if (!isRecord(value)) return false
  if (value.type !== 'index-update') return false
  if (typeof value.docId !== 'string') return false
  if (!isRecord(value.meta)) return false
  return typeof value.meta.schemaIri === 'string' && typeof value.meta.title === 'string'
}

export type IndexRemoveMessage = { type: 'index-remove'; docId: string }

export const isIndexRemove = (value: unknown): value is IndexRemoveMessage => {
  if (!isRecord(value)) return false
  return value.type === 'index-remove' && typeof value.docId === 'string'
}

export type NodeSyncRequestMessage = {
  type: 'node-sync-request'
  room: string
  sinceLamport: number
}

export const isNodeSyncRequest = (value: unknown): value is NodeSyncRequestMessage => {
  if (!isRecord(value)) return false
  return (
    value.type === 'node-sync-request' &&
    typeof value.room === 'string' &&
    typeof value.sinceLamport === 'number'
  )
}

export type NodeClearMessage = { type: 'node-clear'; room: string }

export const isNodeClearRequest = (value: unknown): value is NodeClearMessage => {
  if (!isRecord(value)) return false
  return value.type === 'node-clear' && typeof value.room === 'string'
}

export type NodeChangeMessage = {
  type: 'node-change'
  room: string
  change: SerializedNodeChange
}

export const isNodeChangePayload = (value: unknown): value is NodeChangeMessage => {
  if (!isRecord(value)) return false
  if (value.type !== 'node-change' || typeof value.room !== 'string') return false
  if (!isRecord(value.change)) return false
  const change = value.change as Record<string, unknown>
  return typeof change.hash === 'string' && typeof change.signatureB64 === 'string'
}

/**
 * Batched node-change push (exploration 0357 Tier 1).
 *
 * The single-change form above costs one WebSocket frame per change, which at
 * the client's 40 msg/s outbound throttle makes a bulk import take minutes to
 * push. This carries up to {@link MAX_BATCH_CHANGES} changes in one frame.
 *
 * The hub still verifies and authorizes EVERY change individually — this is a
 * transport batch, not a trust batch — and re-broadcasts each accepted change
 * to room subscribers as an ordinary `node-change`, so subscribers that don't
 * speak this message type never see a batch frame.
 */
export const MAX_BATCH_CHANGES = 1000

export type NodeChangeBatchMessage = {
  type: 'node-change-batch'
  room: string
  changes: SerializedNodeChange[]
}

export const isNodeChangeBatchPayload = (value: unknown): value is NodeChangeBatchMessage => {
  if (!isRecord(value)) return false
  if (value.type !== 'node-change-batch' || typeof value.room !== 'string') return false
  if (!Array.isArray(value.changes)) return false
  if (value.changes.length === 0 || value.changes.length > MAX_BATCH_CHANGES) return false
  return value.changes.every((entry) => {
    if (!isRecord(entry)) return false
    return typeof entry.hash === 'string' && typeof entry.signatureB64 === 'string'
  })
}

export type AwarenessMessage = { type: 'awareness'; update?: string; state?: unknown }

export const isAwarenessMessage = (value: unknown): value is AwarenessMessage => {
  if (!isRecord(value)) return false
  if (value.type !== 'awareness') return false
  const candidate = value as { update?: unknown; state?: unknown }
  return (
    (typeof candidate.update === 'string' && candidate.update.length > 0) ||
    typeof candidate.state !== 'undefined'
  )
}

export type SyncRelayMessage = {
  type: 'sync-step1' | 'sync-step2' | 'sync-update'
  from?: unknown
}

export const isSyncRelayMessage = (value: unknown): value is SyncRelayMessage => {
  if (!isRecord(value)) return false
  return value.type === 'sync-step1' || value.type === 'sync-step2' || value.type === 'sync-update'
}

export type ClientHandshakeMessage = {
  type: 'client-handshake'
  did: string
  protocolVersion: number
  minProtocolVersion: number
  features: string[]
  packageVersion: string
}

export const isClientHandshake = (value: unknown): value is ClientHandshakeMessage => {
  if (!isRecord(value)) return false
  if (value.type !== 'client-handshake') return false
  return (
    typeof value.did === 'string' &&
    typeof value.protocolVersion === 'number' &&
    typeof value.minProtocolVersion === 'number' &&
    Array.isArray(value.features) &&
    typeof value.packageVersion === 'string'
  )
}

export const getPublishPeerId = (payload: { data?: unknown }): string | null => {
  if (!isRecord(payload.data)) return null
  return typeof payload.data.from === 'string' ? payload.data.from : null
}
