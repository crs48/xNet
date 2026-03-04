/**
 * Yjs authorized sync manager and provider.
 */

import type { SignedYjsEnvelopeV2, EnvelopeVerificationResult } from './yjs-envelope'
import type { AuthDecision, DID, PolicyEvaluator } from '@xnetjs/core'
import type { WrappedKey } from '@xnetjs/crypto'
import { generateContentKey, wrapKeyForRecipient } from '@xnetjs/crypto'
import {
  YjsAuthGate,
  decryptYjsState,
  deserializeEncryptedYjsState,
  encryptYjsState,
  serializeEncryptedYjsState
} from './yjs-authorization'
import { verifyYjsEnvelopeV2 } from './yjs-envelope'
import { YjsPeerScorer } from './yjs-peer-scoring'

const GRANT_SCHEMA_ID = 'xnet://xnet.fyi/Grant'

type GrantLikeNode = {
  schemaId?: string
  properties?: Record<string, unknown>
}

type GrantEvent = {
  node?: GrantLikeNode | null
}

export interface YDocLike {
  emit?: (event: string, args: unknown[]) => void
}

export interface YDocCodec<TDoc extends YDocLike = YDocLike> {
  createDoc(nodeId: string): TDoc
  applyUpdate(doc: TDoc, update: Uint8Array, origin?: string): void
  encodeStateAsUpdate(doc: TDoc): Uint8Array
  encodeStateVector(doc: TDoc): Uint8Array
}

export type AuthorizedRoom<TDoc extends YDocLike = YDocLike> = {
  nodeId: string
  doc: TDoc
  contentKey: Uint8Array
  authGate: YjsAuthGate
  authorizedPeers: Set<DID>
}

export type AuthorizedDoc<TDoc extends YDocLike = YDocLike> = {
  doc: TDoc
  nodeId: string
  mode: 'read' | 'write'
  contentKey: Uint8Array
  room?: AuthorizedRoom<TDoc>
  release: () => void
}

export interface AuthorizedStateAdapter {
  getDocumentContent(nodeId: string): Promise<Uint8Array | null>
  setDocumentContent(nodeId: string, content: Uint8Array): Promise<void>
}

export interface GrantEventStore {
  subscribe(listener: (event: GrantEvent) => void): () => void
}

export interface ContentKeyProvider {
  getOrUnwrap(nodeId: string): Promise<Uint8Array>
}

export interface RecipientKeyResolver {
  resolveBatch(dids: DID[]): Promise<Map<DID, Uint8Array>>
}

export interface AuthorizedSyncManagerOptions<TDoc extends YDocLike = YDocLike> {
  authorDID: DID
  evaluator: PolicyEvaluator
  adapter: AuthorizedStateAdapter
  store: GrantEventStore
  keyProvider: ContentKeyProvider
  ydoc: YDocCodec<TDoc>
  publicKeyResolver?: RecipientKeyResolver
  onRotateContentKey?: (input: {
    nodeId: string
    recipients: DID[]
    wrappedKeys: Record<string, WrappedKey>
    contentKey: Uint8Array
  }) => Promise<void>
}

type ManagedRoom<TDoc extends YDocLike = YDocLike> = AuthorizedRoom<TDoc> & {
  unsubscribe?: () => void
}

export class AuthorizedSyncManager<TDoc extends YDocLike = YDocLike> {
  private readonly options: AuthorizedSyncManagerOptions<TDoc>
  private readonly rooms = new Map<string, ManagedRoom<TDoc>>()

  constructor(options: AuthorizedSyncManagerOptions<TDoc>) {
    this.options = options
  }

  async acquire(nodeId: string, mode: 'read' | 'write' = 'write'): Promise<AuthorizedDoc<TDoc>> {
    const decision = await this.options.evaluator.can({
      subject: this.options.authorDID,
      action: mode === 'write' ? 'write' : 'read',
      nodeId
    })
    if (!decision.allowed) {
      throw new AuthorizedYjsError('PERMISSION_DENIED', decision)
    }

    const contentKey = await this.options.keyProvider.getOrUnwrap(nodeId)
    const doc = this.options.ydoc.createDoc(nodeId)

    const encryptedBytes = await this.options.adapter.getDocumentContent(nodeId)
    if (encryptedBytes) {
      const encrypted = deserializeEncryptedYjsState(encryptedBytes)
      const state = decryptYjsState(encrypted, contentKey)
      this.options.ydoc.applyUpdate(doc, state, 'bootstrap')
    }

    let room: AuthorizedRoom<TDoc> | undefined
    if (mode === 'write') {
      room = this.joinRoom(nodeId, doc, contentKey)
    }

    return {
      doc,
      nodeId,
      mode,
      contentKey,
      room,
      release: () => this.release(nodeId)
    }
  }

  release(nodeId: string): void {
    const room = this.rooms.get(nodeId)
    if (!room) {
      return
    }

    room.unsubscribe?.()
    this.rooms.delete(nodeId)
  }

  private joinRoom(nodeId: string, doc: TDoc, contentKey: Uint8Array): AuthorizedRoom<TDoc> {
    const existing = this.rooms.get(nodeId)
    if (existing) {
      return existing
    }

    const room: ManagedRoom<TDoc> = {
      nodeId,
      doc,
      contentKey,
      authGate: new YjsAuthGate(this.options.evaluator, nodeId),
      authorizedPeers: new Set<DID>([this.options.authorDID])
    }

    room.unsubscribe = this.wireRevocationEvents(room)
    this.rooms.set(nodeId, room)
    return room
  }

  private wireRevocationEvents(room: ManagedRoom<TDoc>): () => void {
    return this.options.store.subscribe((event) => {
      const grantNode = event.node
      if (!grantNode || grantNode.schemaId !== GRANT_SCHEMA_ID) {
        return
      }

      const resource = grantNode.properties?.resource
      if (typeof resource !== 'string' || resource !== room.nodeId) {
        return
      }

      const revokedAt = grantNode.properties?.revokedAt
      const grantee = grantNode.properties?.grantee
      if (typeof revokedAt !== 'number' || revokedAt <= 0 || !isDid(grantee)) {
        return
      }

      room.authGate.invalidatePeer(grantee)
      if (!room.authorizedPeers.has(grantee)) {
        return
      }

      void this.handlePeerRevocation(room, grantee)
    })
  }

  private async handlePeerRevocation(room: ManagedRoom<TDoc>, revokedDid: DID): Promise<void> {
    room.authorizedPeers.delete(revokedDid)
    room.doc.emit?.('peer:kicked', [revokedDid])

    const newContentKey = generateContentKey()
    const encrypted = encryptYjsState(
      this.options.ydoc.encodeStateAsUpdate(room.doc),
      room.nodeId,
      newContentKey,
      {
        stateVector: this.options.ydoc.encodeStateVector(room.doc)
      }
    )
    await this.options.adapter.setDocumentContent(
      room.nodeId,
      serializeEncryptedYjsState(encrypted)
    )

    const recipients = [...room.authorizedPeers]
    let wrappedKeys: Record<string, WrappedKey> = {}

    if (this.options.publicKeyResolver && recipients.length > 0) {
      const publicKeys = await this.options.publicKeyResolver.resolveBatch(recipients)
      wrappedKeys = {}
      for (const [did, pubKey] of publicKeys) {
        wrappedKeys[did] = wrapKeyForRecipient(newContentKey, pubKey)
      }
    }

    await this.options.onRotateContentKey?.({
      nodeId: room.nodeId,
      recipients,
      wrappedKeys,
      contentKey: newContentKey
    })

    room.contentKey = newContentKey
    room.doc.emit?.('key:rotated', [room.nodeId])
  }
}

export interface AuthorizedYjsSyncProviderOptions<TDoc extends YDocLike = YDocLike> {
  nodeId: string
  doc: TDoc
  ydoc: Pick<YDocCodec<TDoc>, 'applyUpdate'>
  authGate: YjsAuthGate
  peerScorer?: YjsPeerScorer
  rateLimiter?: {
    allow(peerId: DID): boolean
  }
  verifyEnvelope?: (envelope: SignedYjsEnvelopeV2) => Promise<EnvelopeVerificationResult>
  onRejected?: (input: {
    peerId: DID
    reason: 'rate-exceeded' | 'invalid-signature' | 'unauthorized'
  }) => void
}

export class AuthorizedYjsSyncProvider<TDoc extends YDocLike = YDocLike> {
  private readonly nodeId: string
  private readonly doc: TDoc
  private readonly ydoc: Pick<YDocCodec<TDoc>, 'applyUpdate'>
  private readonly authGate: YjsAuthGate
  private readonly peerScorer: YjsPeerScorer
  private readonly rateLimiter?: {
    allow(peerId: DID): boolean
  }
  private readonly verifyEnvelope: (
    envelope: SignedYjsEnvelopeV2
  ) => Promise<EnvelopeVerificationResult>
  private readonly onRejected?: (input: {
    peerId: DID
    reason: 'rate-exceeded' | 'invalid-signature' | 'unauthorized'
  }) => void

  constructor(options: AuthorizedYjsSyncProviderOptions<TDoc>) {
    this.nodeId = options.nodeId
    this.doc = options.doc
    this.ydoc = options.ydoc
    this.authGate = options.authGate
    this.peerScorer = options.peerScorer ?? new YjsPeerScorer()
    this.rateLimiter = options.rateLimiter
    this.verifyEnvelope = options.verifyEnvelope ?? verifyYjsEnvelopeV2
    this.onRejected = options.onRejected
  }

  async handleRemoteUpdate(envelope: SignedYjsEnvelopeV2): Promise<boolean> {
    const peerId = envelope.meta.authorDID

    if (this.rateLimiter && !this.rateLimiter.allow(peerId)) {
      this.peerScorer.penalize(peerId, 'rateExceeded')
      this.onRejected?.({ peerId, reason: 'rate-exceeded' })
      return false
    }

    const sigResult = await this.verifyEnvelope(envelope)
    if (!sigResult.valid) {
      this.peerScorer.penalize(peerId, 'invalidSignature')
      this.onRejected?.({ peerId, reason: 'invalid-signature' })
      return false
    }

    const authResult = await this.authGate.canApplyUpdate(envelope)
    if (!authResult.allowed) {
      this.peerScorer.penalize(peerId, 'unauthorizedUpdate')
      this.onRejected?.({ peerId, reason: 'unauthorized' })
      return false
    }

    if (envelope.meta.docId !== this.nodeId) {
      this.peerScorer.penalize(peerId, 'invalidSignature')
      this.onRejected?.({ peerId, reason: 'invalid-signature' })
      return false
    }

    this.ydoc.applyUpdate(this.doc, envelope.update, 'remote')
    this.peerScorer.recordValid(peerId)
    return true
  }
}

export class AuthorizedYjsError extends Error {
  readonly code: 'PERMISSION_DENIED'
  readonly decision: AuthDecision

  constructor(code: 'PERMISSION_DENIED', decision: AuthDecision) {
    super(`Yjs authorization denied for '${decision.action}' on '${decision.resource}'`)
    this.name = 'AuthorizedYjsError'
    this.code = code
    this.decision = decision
  }
}

function isDid(value: unknown): value is DID {
  return typeof value === 'string' && value.startsWith('did:key:')
}
