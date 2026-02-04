/**
 * @xnet/hub - Yjs sync relay service.
 */

import type { NodePool } from '../pool/node-pool'
import * as Y from 'yjs'
import {
  MAX_YJS_UPDATE_SIZE,
  YjsPeerScorer,
  YjsRateLimiter,
  isUpdateTooLarge,
  verifyYjsEnvelope,
  type SignedYjsEnvelope
} from '@xnet/sync'

export type SyncMessage = {
  type: 'sync-step1' | 'sync-step2' | 'sync-update' | 'awareness'
  from?: string
  to?: string
  sv?: string
  update?: string
  envelope?: Record<string, unknown>
}

type RelayOptions = {
  requireSignedUpdates?: boolean
}

type UpdateResult = {
  update: Uint8Array
  peerId: string
}

const HUB_PEER_ID = 'hub-relay'

const toBase64 = (data: Uint8Array): string => Buffer.from(data).toString('base64')

const fromBase64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'))

const deserializeEnvelope = (data: Record<string, unknown>): SignedYjsEnvelope | null => {
  try {
    return {
      update: fromBase64(data.update as string),
      authorDID: data.authorDID as string,
      signature: fromBase64(data.signature as string),
      timestamp: data.timestamp as number,
      clientId: data.clientId as number
    }
  } catch {
    return null
  }
}

const hasEnvelope = (data: Record<string, unknown>): boolean =>
  typeof data.envelope === 'object' &&
  data.envelope !== null &&
  'update' in (data.envelope as object) &&
  'authorDID' in (data.envelope as object) &&
  'signature' in (data.envelope as object)

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
  private rateLimiter = new YjsRateLimiter()
  private peerScorer = new YjsPeerScorer()
  private requireSignedUpdates: boolean

  constructor(private pool: NodePool, options?: RelayOptions) {
    this.requireSignedUpdates = options?.requireSignedUpdates ?? false
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
        const remoteSV = fromBase64(data.sv)
        const doc = await this.pool.get(docId)
        const diff = Y.encodeStateAsUpdate(doc, remoteSV)

        if (diff.length > 2) {
          sendToRoom(topic, {
            type: 'sync-step2',
            from: HUB_PEER_ID,
            to: data.from,
            update: toBase64(diff)
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
        const updateResult = this.extractUpdate(data)
        if (!updateResult) return
        const doc = await this.pool.get(docId)
        Y.applyUpdate(doc, updateResult.update, 'relay')
        this.pool.markDirty(docId)
        break
      }

      case 'sync-update': {
        const updateResult = this.extractUpdate(data)
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

  async handleRoomJoin(topic: string, sendToRoom: (topic: string, data: object) => void): Promise<void> {
    const docId = this.extractDocId(topic)
    if (!docId) return

    this.pool.addSubscriber(docId)

    const doc = await this.pool.get(docId)
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

  private extractUpdate(data: SyncMessage): UpdateResult | null {
    if (!hasPeerId(data)) return null

    const peerId = data.from

    if (!this.rateLimiter.allow(peerId)) {
      this.peerScorer.penalize(peerId, 'rateExceeded')
      return null
    }

    if (data && hasEnvelope(data as Record<string, unknown>)) {
      const envelope = deserializeEnvelope((data as Record<string, unknown>).envelope as Record<string, unknown>)
      if (!envelope) {
        this.peerScorer.penalize(peerId, 'invalidSignature')
        return null
      }

      if (isUpdateTooLarge(envelope.update)) {
        this.peerScorer.penalize(peerId, 'oversizedUpdate')
        return null
      }

      const result = envelope ? this.verifyEnvelope(envelope) : null
      if (!result) {
        this.peerScorer.penalize(peerId, 'invalidSignature')
        return null
      }

      this.peerScorer.recordValid(peerId)
      return { update: envelope.update, peerId }
    }

    if (this.requireSignedUpdates) {
      this.peerScorer.penalize(peerId, 'unsignedUpdate')
      return null
    }

    if (!data.update) return null
    const update = fromBase64(data.update)
    if (isUpdateTooLarge(update)) {
      this.peerScorer.penalize(peerId, 'oversizedUpdate')
      return null
    }

    this.peerScorer.recordValid(peerId)
    return { update, peerId }
  }

  private verifyEnvelope(envelope: SignedYjsEnvelope): boolean {
    if (isUpdateTooLarge(envelope.update, MAX_YJS_UPDATE_SIZE)) {
      return false
    }

    const result = verifyYjsEnvelope(envelope)
    return result.valid
  }
}
