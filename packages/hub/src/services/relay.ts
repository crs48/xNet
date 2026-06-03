/**
 * @xnetjs/hub - Yjs sync relay service.
 */

import type { NodePool } from '../pool/node-pool'
import type {
  AbuseDecision,
  AbuseReasonCode,
  AbuseSeverity,
  AbuseTelemetryReporter
} from '@xnetjs/abuse'
import { reportRemoteMutationRejection } from '@xnetjs/abuse'
import {
  MAX_YJS_UPDATE_SIZE,
  MAX_YJS_STATE_VECTOR_SIZE,
  YjsPeerScorer,
  YjsRateLimiter,
  deserializeYjsEnvelope,
  isBase64PayloadTooLarge,
  isStateVectorTooLarge,
  isUpdateTooLarge,
  resolveSyncReplicationPolicy,
  signYjsUpdate,
  verifyYjsEnvelopeV1,
  isV1Envelope,
  isV2Envelope,
  type SignedYjsEnvelope,
  type SignedYjsEnvelopeV1,
  type SignedYjsEnvelopeV2,
  type SignedYjsEnvelopeWire,
  type SyncReplicationConfig,
  type PeerAction,
  type YjsViolationType,
  type YjsRateLimiterOptions
} from '@xnetjs/sync'
import * as Y from 'yjs'

export type SyncMessage = {
  type: 'sync-step1' | 'sync-step2' | 'sync-update' | 'awareness'
  from?: string
  to?: string
  sv?: string
  update?: string
  envelope?: Record<string, unknown>
}

export type YjsEnvelopeV2VerifierResult =
  | boolean
  | {
      valid: boolean
      errors?: readonly string[]
    }

export type YjsEnvelopeV2VerifierContext = {
  docId: string
  peerId: string
  messageType: SyncMessage['type']
}

export type YjsEnvelopeV2Verifier = (
  envelope: SignedYjsEnvelopeV2,
  context: YjsEnvelopeV2VerifierContext
) => YjsEnvelopeV2VerifierResult | Promise<YjsEnvelopeV2VerifierResult>

type RelayOptions = {
  replication?: SyncReplicationConfig
  rateLimit?: YjsRateLimiterOptions
  signing: {
    authorDID: string
    signingKey: Uint8Array
  }
  verifyV2Envelope?: YjsEnvelopeV2Verifier
  telemetry?: AbuseTelemetryReporter
  telemetryPeerHashSalt?: string
}

type UpdateResult = {
  update: Uint8Array
  peerId: string
}

type EnvelopeVerificationResult = { valid: true } | { valid: false; reason: AbuseReasonCode }

type SignedYjsEnvelopeV1Wire = {
  update: string
  authorDID: string
  signature: string
  timestamp: number
  clientId: number
}

const HUB_PEER_ID = 'hub-relay'

const toBase64 = (data: Uint8Array): string => Buffer.from(data).toString('base64')

const fromBase64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object')

const isV1EnvelopeWire = (value: unknown): value is SignedYjsEnvelopeV1Wire =>
  isRecord(value) &&
  typeof value.update === 'string' &&
  typeof value.authorDID === 'string' &&
  typeof value.signature === 'string' &&
  typeof value.timestamp === 'number' &&
  typeof value.clientId === 'number'

const isV2EnvelopeWire = (value: unknown): value is SignedYjsEnvelopeWire =>
  isRecord(value) &&
  value.v === 2 &&
  typeof value.u === 'string' &&
  isRecord(value.m) &&
  typeof value.m.a === 'string' &&
  typeof value.m.c === 'number' &&
  typeof value.m.t === 'number' &&
  typeof value.m.d === 'string' &&
  isRecord(value.s)

const deserializeV1Envelope = (data: SignedYjsEnvelopeV1Wire): SignedYjsEnvelopeV1 | null => {
  try {
    return {
      update: fromBase64(data.update),
      authorDID: data.authorDID,
      signature: fromBase64(data.signature),
      timestamp: data.timestamp,
      clientId: data.clientId
    }
  } catch {
    return null
  }
}

const deserializeEnvelope = (value: unknown): SignedYjsEnvelope | null => {
  if (isV2EnvelopeWire(value)) {
    if (isBase64PayloadTooLarge(value.u, MAX_YJS_UPDATE_SIZE)) return null
    try {
      return deserializeYjsEnvelope(value)
    } catch {
      return null
    }
  }

  if (isV1EnvelopeWire(value)) {
    if (isBase64PayloadTooLarge(value.update, MAX_YJS_UPDATE_SIZE)) return null
    return deserializeV1Envelope(value)
  }

  return null
}

const getEnvelope = (data: SyncMessage): unknown | null =>
  'envelope' in data ? data.envelope : null

const verifierResultIsValid = (result: YjsEnvelopeV2VerifierResult): boolean =>
  typeof result === 'boolean' ? result : result.valid

const hasPeerId = (data: SyncMessage): data is SyncMessage & { from: string } =>
  typeof data.from === 'string' && data.from.length > 0

const isSyncMessage = (data: unknown): data is SyncMessage => {
  if (!data || typeof data !== 'object') return false
  const candidate = data as { type?: unknown }
  return (
    candidate.type === 'sync-step1' ||
    candidate.type === 'sync-step2' ||
    candidate.type === 'sync-update' ||
    candidate.type === 'awareness'
  )
}

export class RelayService {
  private rateLimiter: YjsRateLimiter
  private peerScorer = new YjsPeerScorer()
  private replicationPolicy: ReturnType<typeof resolveSyncReplicationPolicy>

  constructor(
    private pool: NodePool,
    private options: RelayOptions
  ) {
    this.replicationPolicy = resolveSyncReplicationPolicy(options.replication)
    this.rateLimiter = new YjsRateLimiter(options.rateLimit)
  }

  async handleSyncMessage(
    topic: string,
    data: unknown,
    sendToRoom: (topic: string, data: object) => void
  ): Promise<void> {
    if (!isSyncMessage(data)) return
    if (data.from === HUB_PEER_ID) return

    const docId = this.extractDocId(topic)
    if (!docId) return

    switch (data.type) {
      case 'sync-step1': {
        if (!data.sv || !hasPeerId(data)) return
        const peerId = data.from
        if (!this.allowPeerMessage(peerId)) return
        if (isBase64PayloadTooLarge(data.sv, MAX_YJS_STATE_VECTOR_SIZE)) {
          this.peerScorer.penalize(peerId, 'oversizedUpdate')
          return
        }
        const remoteSV = fromBase64(data.sv)
        if (isStateVectorTooLarge(remoteSV)) {
          this.peerScorer.penalize(peerId, 'oversizedUpdate')
          return
        }
        const doc = await this.pool.get(docId)
        const diff = Y.encodeStateAsUpdate(doc, remoteSV)

        if (diff.length > 2) {
          const envelope = signYjsUpdate(
            diff,
            this.options.signing.authorDID,
            this.options.signing.signingKey,
            doc.clientID
          )
          sendToRoom(topic, {
            type: 'sync-step2',
            from: HUB_PEER_ID,
            to: data.from,
            envelope: {
              update: toBase64(envelope.update),
              authorDID: envelope.authorDID,
              signature: toBase64(envelope.signature),
              timestamp: envelope.timestamp,
              clientId: envelope.clientId
            }
          })
        }

        const sv = Y.encodeStateVector(doc)
        sendToRoom(topic, {
          type: 'sync-step1',
          from: HUB_PEER_ID,
          sv: toBase64(sv)
        })
        break
      }

      case 'sync-step2': {
        if (data.to && data.to !== HUB_PEER_ID) return
        const updateResult = await this.extractUpdate(docId, data)
        if (!updateResult) return
        const doc = await this.pool.get(docId)
        Y.applyUpdate(doc, updateResult.update, 'relay')
        this.pool.markDirty(docId)
        break
      }

      case 'sync-update': {
        const updateResult = await this.extractUpdate(docId, data)
        if (!updateResult) return
        const doc = await this.pool.get(docId)
        Y.applyUpdate(doc, updateResult.update, 'relay')
        this.pool.markDirty(docId)
        break
      }

      case 'awareness':
        break
    }
  }

  async handleRoomJoin(
    topic: string,
    sendToRoom: (topic: string, data: object) => void
  ): Promise<void> {
    const docId = this.extractDocId(topic)
    if (!docId) return

    const doc = await this.pool.get(docId)
    this.pool.addSubscriber(docId)
    const fullState = Y.encodeStateAsUpdate(doc)
    if (fullState.length <= 2) return

    const sv = Y.encodeStateVector(doc)
    sendToRoom(topic, {
      type: 'sync-step1',
      from: HUB_PEER_ID,
      sv: toBase64(sv)
    })
  }

  handleRoomLeave(topic: string): void {
    const docId = this.extractDocId(topic)
    if (docId) {
      this.pool.removeSubscriber(docId)
    }
  }

  handlePeerDisconnect(peerId: string): void {
    this.rateLimiter.remove(peerId)
    this.peerScorer.remove(peerId)
  }

  private extractDocId(topic: string): string | null {
    return topic.startsWith('xnet-doc-') ? topic.slice('xnet-doc-'.length) : null
  }

  private async extractUpdate(docId: string, data: SyncMessage): Promise<UpdateResult | null> {
    if (!hasPeerId(data)) return null

    const peerId = data.from

    if (!this.allowPeerMessage(peerId, 'over-rate-limit')) return null

    const rawEnvelope = getEnvelope(data)
    if (rawEnvelope) {
      const envelope = deserializeEnvelope(rawEnvelope)
      if (!envelope) {
        this.rejectRemoteMutation(peerId, 'invalid-signature', 'invalidSignature')
        return null
      }

      if (isUpdateTooLarge(envelope.update)) {
        this.rejectRemoteMutation(peerId, 'over-size-limit', 'oversizedUpdate')
        return null
      }

      const result = await this.verifyEnvelope(envelope, {
        docId,
        peerId,
        messageType: data.type
      })
      if (!result.valid) {
        this.rejectRemoteMutation(peerId, result.reason, 'invalidSignature')
        return null
      }

      this.peerScorer.recordValid(peerId)
      return { update: envelope.update, peerId }
    }

    if (this.replicationPolicy.requireSignedReplication) {
      this.rejectRemoteMutation(peerId, 'unsigned-update', 'unsignedUpdate')
      return null
    }

    if (!data.update) return null
    if (isBase64PayloadTooLarge(data.update, MAX_YJS_UPDATE_SIZE)) {
      this.rejectRemoteMutation(peerId, 'over-size-limit', 'oversizedUpdate')
      return null
    }
    const update = fromBase64(data.update)
    if (isUpdateTooLarge(update)) {
      this.rejectRemoteMutation(peerId, 'over-size-limit', 'oversizedUpdate')
      return null
    }

    this.peerScorer.recordValid(peerId)
    return { update, peerId }
  }

  private allowPeerMessage(peerId: string, remoteMutationReason?: AbuseReasonCode): boolean {
    if (this.rateLimiter.allow(peerId)) return true
    const action = this.peerScorer.penalize(peerId, 'rateExceeded')
    if (remoteMutationReason) {
      this.reportRejectedRemoteMutation(peerId, remoteMutationReason, action)
    }
    return false
  }

  private async verifyEnvelope(
    envelope: SignedYjsEnvelope,
    context: YjsEnvelopeV2VerifierContext
  ): Promise<EnvelopeVerificationResult> {
    if (isUpdateTooLarge(envelope.update, MAX_YJS_UPDATE_SIZE)) {
      return { valid: false, reason: 'over-size-limit' }
    }

    if (isV1Envelope(envelope)) {
      const result = verifyYjsEnvelopeV1(envelope)
      return result.valid ? { valid: true } : { valid: false, reason: 'invalid-signature' }
    }

    if (isV2Envelope(envelope)) {
      if (envelope.meta.docId !== context.docId) {
        return { valid: false, reason: 'invalid-doc-binding' }
      }

      if (!this.options.verifyV2Envelope) {
        return { valid: false, reason: 'failed-admission' }
      }

      const result = await this.options.verifyV2Envelope(envelope, context)
      return verifierResultIsValid(result)
        ? { valid: true }
        : { valid: false, reason: 'invalid-signature' }
    }

    return { valid: false, reason: 'failed-admission' }
  }

  private rejectRemoteMutation(
    peerId: string,
    reason: AbuseReasonCode,
    violation: YjsViolationType
  ): void {
    const action = this.peerScorer.penalize(peerId, violation)
    this.reportRejectedRemoteMutation(peerId, reason, action)
  }

  private reportRejectedRemoteMutation(
    peerId: string,
    reason: AbuseReasonCode,
    action: PeerAction
  ): void {
    reportRemoteMutationRejection(this.options.telemetry, {
      facts: {
        surface: 'remoteMutation',
        actor: {
          peerId,
          peerScore: this.peerScorer.getScore(peerId)
        }
      },
      decision: relayRejectionDecision(reason, action),
      peerHashSalt: this.options.telemetryPeerHashSalt
    })
  }
}

const relayRejectionDecision = (reason: AbuseReasonCode, action: PeerAction): AbuseDecision => ({
  admission: 'reject',
  visibility: 'hide',
  reach: 'exclude',
  resource: action === 'block' ? 'block-peer' : action === 'throttle' ? 'throttle' : 'normal',
  notify: false,
  includeInCounters: false,
  includeInSearch: false,
  review: { required: false },
  reasons: relayRejectionReasons(reason),
  evidenceRefs: [],
  labelsToEmit: [],
  telemetry: [
    {
      eventName: 'xnet.security.remote_mutation_rejected',
      severity: relayRejectionSeverity(reason),
      reason
    }
  ]
})

const relayRejectionReasons = (reason: AbuseReasonCode): readonly AbuseReasonCode[] => {
  if (
    reason === 'invalid-doc-binding' ||
    reason === 'invalid-signature' ||
    reason === 'unauthorized' ||
    reason === 'unsigned-update'
  ) {
    return ['failed-admission', reason]
  }

  return [reason]
}

const relayRejectionSeverity = (reason: AbuseReasonCode): AbuseSeverity => {
  if (
    reason === 'failed-admission' ||
    reason === 'invalid-doc-binding' ||
    reason === 'invalid-signature' ||
    reason === 'unauthorized' ||
    reason === 'unsigned-update'
  ) {
    return 'high'
  }

  if (reason === 'over-rate-limit' || reason === 'over-size-limit') {
    return 'medium'
  }

  return 'low'
}
