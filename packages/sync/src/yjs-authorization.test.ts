import type { AuthDecision, PolicyEvaluator } from '@xnetjs/core'
import { generateKey, randomBytes } from '@xnetjs/crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  YjsAuthGate,
  YjsCheckpointer,
  YjsStateIntegrityError,
  decryptYjsState,
  deserializeEncryptedYjsState,
  encryptYjsState,
  serializeEncryptedYjsState
} from './yjs-authorization'

const DID_A = 'did:key:z6MkrA111111111111111111111111111111111111111111' as const

describe('yjs-authorization', () => {
  it('encryptYjsState/decryptYjsState round-trips', () => {
    const contentKey = generateKey()
    const state = randomBytes(64)
    const encrypted = encryptYjsState(state, 'node-1', contentKey)

    const decrypted = decryptYjsState(encrypted, contentKey)
    expect(decrypted).toEqual(state)
  })

  it('decryptYjsState throws on tampered ciphertext', () => {
    const contentKey = generateKey()
    const encrypted = encryptYjsState(randomBytes(64), 'node-1', contentKey)
    encrypted.encryptedState[0] = encrypted.encryptedState[0]! ^ 0xff

    expect(() => decryptYjsState(encrypted, contentKey)).toThrow(YjsStateIntegrityError)
  })

  it('serializes and deserializes encrypted state', () => {
    const contentKey = generateKey()
    const encrypted = encryptYjsState(randomBytes(32), 'node-7', contentKey)

    const bytes = serializeEncryptedYjsState(encrypted)
    const decoded = deserializeEncryptedYjsState(bytes)

    expect(decoded.nodeId).toBe('node-7')
    expect(decoded.version).toBe(1)
    expect(decoded.encryptedState).toEqual(encrypted.encryptedState)
    expect(decoded.stateHash).toEqual(encrypted.stateHash)
  })

  it('YjsAuthGate caches authorization decisions by peer', async () => {
    const evaluator = createEvaluator(true)
    const gate = new YjsAuthGate(evaluator, 'node-1')

    const envelope = { meta: { authorDID: DID_A } }
    const first = await gate.canApplyUpdate(envelope as never)
    const second = await gate.canApplyUpdate(envelope as never)

    expect(first.allowed).toBe(true)
    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(evaluator.can).toHaveBeenCalledTimes(1)
  })

  it('YjsAuthGate invalidates a peer cache entry', async () => {
    const evaluator = createEvaluator(false)
    const gate = new YjsAuthGate(evaluator, 'node-1')
    const envelope = { meta: { authorDID: DID_A } }

    await gate.canApplyUpdate(envelope as never)
    gate.invalidatePeer(DID_A)
    await gate.canApplyUpdate(envelope as never)

    expect(evaluator.can).toHaveBeenCalledTimes(2)
  })

  it('YjsCheckpointer triggers by update threshold or age', () => {
    const now = vi.fn(() => 10_000)
    const checkpointer = new YjsCheckpointer({ maxUpdates: 3, maxAgeMs: 1_000, now })

    expect(
      checkpointer.shouldCheckpoint({
        updatesSinceCheckpoint: 2,
        checkpointedAt: 9_500
      })
    ).toBe(false)

    expect(
      checkpointer.shouldCheckpoint({
        updatesSinceCheckpoint: 3,
        checkpointedAt: 9_900
      })
    ).toBe(true)

    expect(
      checkpointer.shouldCheckpoint({
        updatesSinceCheckpoint: 0,
        checkpointedAt: 8_000
      })
    ).toBe(true)
  })

  it('YjsCheckpointer.checkpoint resets updatesSinceCheckpoint', () => {
    const checkpointer = new YjsCheckpointer({ now: () => 123 })
    const checkpoint = checkpointer.checkpoint({
      state: randomBytes(16),
      nodeId: 'node-2',
      contentKey: generateKey()
    })

    expect(checkpoint.checkpointedAt).toBe(123)
    expect(checkpoint.updatesSinceCheckpoint).toBe(0)
  })
})

function createEvaluator(allowed: boolean): PolicyEvaluator {
  return {
    can: vi.fn(async () => createDecision(allowed)),
    explain: vi.fn(),
    invalidate: vi.fn(),
    invalidateSubject: vi.fn()
  }
}

function createDecision(allowed: boolean): AuthDecision {
  return {
    allowed,
    action: 'write',
    subject: DID_A,
    resource: 'node-1',
    roles: [],
    grants: [],
    reasons: allowed ? [] : ['DENY_NO_ROLE_MATCH'],
    cached: false,
    evaluatedAt: Date.now(),
    duration: 1
  }
}
