/**
 * Yjs authorization primitives: encrypted-at-rest state and peer auth gate.
 */

import type { SignedYjsEnvelopeV2 } from './yjs-envelope'
import type { AuthCheckInput, DID, PolicyEvaluator } from '@xnet/core'
import {
  base64ToBytes,
  bytesToBase64,
  constantTimeEqual,
  decrypt,
  encrypt,
  hash,
  type EncryptedData
} from '@xnet/crypto'

export interface EncryptedYjsState {
  nodeId: string
  version: 1
  encryptedState: Uint8Array
  nonce: Uint8Array
  stateVector: Uint8Array
  stateHash: Uint8Array
  checkpointedAt: number
  updatesSinceCheckpoint: number
}

interface EncryptedYjsStateWire {
  nodeId: string
  version: 1
  encryptedState: string
  nonce: string
  stateVector: string
  stateHash: string
  checkpointedAt: number
  updatesSinceCheckpoint: number
}

export class YjsStateIntegrityError extends Error {
  constructor(message = 'Y.Doc state hash mismatch') {
    super(message)
    this.name = 'YjsStateIntegrityError'
  }
}

export function encryptYjsState(
  state: Uint8Array,
  nodeId: string,
  contentKey: Uint8Array,
  options: {
    stateVector?: Uint8Array
    checkpointedAt?: number
    updatesSinceCheckpoint?: number
  } = {}
): EncryptedYjsState {
  const encrypted = encrypt(state, contentKey)

  return {
    nodeId,
    version: 1,
    encryptedState: encrypted.ciphertext,
    nonce: encrypted.nonce,
    stateVector: options.stateVector ?? new Uint8Array(0),
    stateHash: hash(state, 'blake3'),
    checkpointedAt: options.checkpointedAt ?? Date.now(),
    updatesSinceCheckpoint: options.updatesSinceCheckpoint ?? 0
  }
}

export function decryptYjsState(encrypted: EncryptedYjsState, contentKey: Uint8Array): Uint8Array {
  let state: Uint8Array
  try {
    state = decrypt(
      {
        nonce: encrypted.nonce,
        ciphertext: encrypted.encryptedState
      },
      contentKey
    )
  } catch {
    throw new YjsStateIntegrityError('Y.Doc state failed decryption or integrity check')
  }

  const computedHash = hash(state, 'blake3')
  if (!constantTimeEqual(computedHash, encrypted.stateHash)) {
    throw new YjsStateIntegrityError()
  }

  return state
}

export function serializeEncryptedYjsState(state: EncryptedYjsState): Uint8Array {
  const payload: EncryptedYjsStateWire = {
    nodeId: state.nodeId,
    version: 1,
    encryptedState: bytesToBase64(state.encryptedState),
    nonce: bytesToBase64(state.nonce),
    stateVector: bytesToBase64(state.stateVector),
    stateHash: bytesToBase64(state.stateHash),
    checkpointedAt: state.checkpointedAt,
    updatesSinceCheckpoint: state.updatesSinceCheckpoint
  }

  return new TextEncoder().encode(JSON.stringify(payload))
}

export function deserializeEncryptedYjsState(bytes: Uint8Array): EncryptedYjsState {
  const decoded = JSON.parse(new TextDecoder().decode(bytes)) as Partial<EncryptedYjsStateWire>
  if (
    !decoded ||
    decoded.version !== 1 ||
    typeof decoded.nodeId !== 'string' ||
    typeof decoded.encryptedState !== 'string' ||
    typeof decoded.nonce !== 'string' ||
    typeof decoded.stateVector !== 'string' ||
    typeof decoded.stateHash !== 'string' ||
    typeof decoded.checkpointedAt !== 'number' ||
    typeof decoded.updatesSinceCheckpoint !== 'number'
  ) {
    throw new Error('Invalid EncryptedYjsState payload')
  }

  return {
    nodeId: decoded.nodeId,
    version: 1,
    encryptedState: base64ToBytes(decoded.encryptedState),
    nonce: base64ToBytes(decoded.nonce),
    stateVector: base64ToBytes(decoded.stateVector),
    stateHash: base64ToBytes(decoded.stateHash),
    checkpointedAt: decoded.checkpointedAt,
    updatesSinceCheckpoint: decoded.updatesSinceCheckpoint
  }
}

export interface YjsAuthDecision {
  allowed: boolean
  authorDID: DID
  cached: boolean
}

export interface YjsAuthGateOptions {
  cacheTTL?: number
  now?: () => number
}

type CachedPeerDecision = {
  allowed: boolean
  expiresAt: number
}

export class YjsAuthGate {
  private static readonly DEFAULT_CACHE_TTL = 30_000
  private readonly peerAuthCache = new Map<DID, CachedPeerDecision>()
  private readonly cacheTTL: number
  private readonly now: () => number

  constructor(
    private readonly evaluator: PolicyEvaluator,
    private readonly nodeId: string,
    options: YjsAuthGateOptions = {}
  ) {
    this.cacheTTL = options.cacheTTL ?? YjsAuthGate.DEFAULT_CACHE_TTL
    this.now = options.now ?? Date.now
  }

  async canApplyUpdate(envelope: Pick<SignedYjsEnvelopeV2, 'meta'>): Promise<YjsAuthDecision> {
    const authorDID = envelope.meta.authorDID
    const cached = this.peerAuthCache.get(authorDID)
    if (cached && cached.expiresAt > this.now()) {
      return { allowed: cached.allowed, authorDID, cached: true }
    }

    const input: AuthCheckInput = {
      subject: authorDID,
      action: 'write',
      nodeId: this.nodeId
    }
    const decision = await this.evaluator.can(input)

    this.peerAuthCache.set(authorDID, {
      allowed: decision.allowed,
      expiresAt: this.now() + this.cacheTTL
    })

    return { allowed: decision.allowed, authorDID, cached: false }
  }

  invalidatePeer(did: DID): void {
    this.peerAuthCache.delete(did)
  }

  invalidateAll(): void {
    this.peerAuthCache.clear()
  }
}

export interface YjsCheckpointerOptions {
  maxUpdates?: number
  maxAgeMs?: number
  now?: () => number
}

export class YjsCheckpointer {
  private readonly maxUpdates: number
  private readonly maxAgeMs: number
  private readonly now: () => number

  constructor(options: YjsCheckpointerOptions = {}) {
    this.maxUpdates = options.maxUpdates ?? 100
    this.maxAgeMs = options.maxAgeMs ?? 60 * 60 * 1000
    this.now = options.now ?? Date.now
  }

  shouldCheckpoint(
    state: Pick<EncryptedYjsState, 'updatesSinceCheckpoint' | 'checkpointedAt'>
  ): boolean {
    return (
      state.updatesSinceCheckpoint >= this.maxUpdates ||
      this.now() - state.checkpointedAt >= this.maxAgeMs
    )
  }

  checkpoint(input: {
    state: Uint8Array
    nodeId: string
    contentKey: Uint8Array
    stateVector?: Uint8Array
  }): EncryptedYjsState {
    return encryptYjsState(input.state, input.nodeId, input.contentKey, {
      stateVector: input.stateVector,
      checkpointedAt: this.now(),
      updatesSinceCheckpoint: 0
    })
  }
}

export function toEncryptedData(state: EncryptedYjsState): EncryptedData {
  return {
    nonce: state.nonce,
    ciphertext: state.encryptedState
  }
}
