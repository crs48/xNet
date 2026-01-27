/**
 * Tests for YjsChange - Yjs updates wrapped in Change<T> envelope
 */

import { describe, it, expect } from 'vitest'
import { generateIdentity } from '@xnet/identity'
import { verifyChange, verifyChangeHash } from './change'
import {
  createYjsChange,
  createUnsignedYjsChange,
  isYjsChange,
  isNodeChange,
  getChangeNodeId,
  YJS_CHANGE_TYPE,
  type YjsChange,
  type YjsUpdatePayload
} from './yjs-change'

describe('createYjsChange', () => {
  it('creates a valid signed YjsChange', () => {
    const { identity, privateKey } = generateIdentity()
    const update = new Uint8Array([1, 2, 3, 4, 5])

    const change = createYjsChange({
      nodeId: 'node-123',
      update,
      clientId: 42,
      updateCount: 5,
      authorDID: identity.did,
      privateKey,
      parentHash: null,
      lamport: { time: 1, author: identity.did }
    })

    expect(change.type).toBe(YJS_CHANGE_TYPE)
    expect(change.payload.nodeId).toBe('node-123')
    expect(change.payload.update).toEqual(update)
    expect(change.payload.clientId).toBe(42)
    expect(change.payload.updateCount).toBe(5)
    expect(change.authorDID).toBe(identity.did)
    expect(change.parentHash).toBeNull()
    expect(change.lamport.time).toBe(1)
    expect(change.hash).toBeTruthy()
    expect(change.signature).toBeInstanceOf(Uint8Array)
    expect(change.signature.length).toBe(64) // Ed25519 signature
  })

  it('chains to parent hash', () => {
    const { identity, privateKey } = generateIdentity()

    const change1 = createYjsChange({
      nodeId: 'node-1',
      update: new Uint8Array([1]),
      clientId: 1,
      updateCount: 1,
      authorDID: identity.did,
      privateKey,
      parentHash: null,
      lamport: { time: 1, author: identity.did }
    })

    const change2 = createYjsChange({
      nodeId: 'node-1',
      update: new Uint8Array([2]),
      clientId: 1,
      updateCount: 1,
      authorDID: identity.did,
      privateKey,
      parentHash: change1.hash,
      lamport: { time: 2, author: identity.did }
    })

    expect(change2.parentHash).toBe(change1.hash)
    expect(change2.hash).not.toBe(change1.hash)
  })

  it('produces different hashes for different updates', () => {
    const { identity, privateKey } = generateIdentity()

    const change1 = createYjsChange({
      nodeId: 'node-1',
      update: new Uint8Array([1, 2, 3]),
      clientId: 1,
      updateCount: 1,
      authorDID: identity.did,
      privateKey,
      parentHash: null,
      lamport: { time: 1, author: identity.did }
    })

    const change2 = createYjsChange({
      nodeId: 'node-1',
      update: new Uint8Array([4, 5, 6]),
      clientId: 1,
      updateCount: 1,
      authorDID: identity.did,
      privateKey,
      parentHash: null,
      lamport: { time: 1, author: identity.did }
    })

    expect(change1.hash).not.toBe(change2.hash)
    expect(change1.signature).not.toEqual(change2.signature)
  })

  it('uses custom wallTime if provided', () => {
    const { identity, privateKey } = generateIdentity()
    const customWallTime = 1234567890000

    const change = createYjsChange({
      nodeId: 'node-1',
      update: new Uint8Array([1]),
      clientId: 1,
      updateCount: 1,
      authorDID: identity.did,
      privateKey,
      parentHash: null,
      lamport: { time: 1, author: identity.did },
      wallTime: customWallTime
    })

    expect(change.wallTime).toBe(customWallTime)
  })
})

describe('createUnsignedYjsChange', () => {
  it('creates an unsigned change without signature', () => {
    const { identity } = generateIdentity()

    const unsigned = createUnsignedYjsChange({
      nodeId: 'node-1',
      update: new Uint8Array([1, 2, 3]),
      clientId: 42,
      updateCount: 3,
      authorDID: identity.did,
      parentHash: null,
      lamport: { time: 1, author: identity.did }
    })

    expect(unsigned.type).toBe(YJS_CHANGE_TYPE)
    expect(unsigned.payload.nodeId).toBe('node-1')
    expect(unsigned.payload.update).toEqual(new Uint8Array([1, 2, 3]))
    expect(unsigned.payload.clientId).toBe(42)
    expect(unsigned.payload.updateCount).toBe(3)
    expect(unsigned.authorDID).toBe(identity.did)
    expect((unsigned as any).hash).toBeUndefined()
    expect((unsigned as any).signature).toBeUndefined()
  })
})

describe('verification', () => {
  it('verifyChange accepts valid signature', () => {
    const { identity, privateKey } = generateIdentity()

    const change = createYjsChange({
      nodeId: 'node-1',
      update: new Uint8Array([1, 2, 3]),
      clientId: 1,
      updateCount: 1,
      authorDID: identity.did,
      privateKey,
      parentHash: null,
      lamport: { time: 1, author: identity.did }
    })

    expect(verifyChange(change, identity.publicKey)).toBe(true)
  })

  it('verifyChange rejects tampered payload', () => {
    const { identity, privateKey } = generateIdentity()

    const change = createYjsChange({
      nodeId: 'node-1',
      update: new Uint8Array([1, 2, 3]),
      clientId: 1,
      updateCount: 1,
      authorDID: identity.did,
      privateKey,
      parentHash: null,
      lamport: { time: 1, author: identity.did }
    })

    // Tamper with the update
    ;(change.payload as YjsUpdatePayload).update = new Uint8Array([9, 9, 9])

    // Signature still valid against hash, but hash no longer matches content
    expect(verifyChangeHash(change)).toBe(false)
  })

  it('verifyChange rejects wrong key', () => {
    const { identity, privateKey } = generateIdentity()
    const { identity: other } = generateIdentity()

    const change = createYjsChange({
      nodeId: 'node-1',
      update: new Uint8Array([1, 2, 3]),
      clientId: 1,
      updateCount: 1,
      authorDID: identity.did,
      privateKey,
      parentHash: null,
      lamport: { time: 1, author: identity.did }
    })

    expect(verifyChange(change, other.publicKey)).toBe(false)
  })

  it('verifyChangeHash detects tampered hash', () => {
    const { identity, privateKey } = generateIdentity()

    const change = createYjsChange({
      nodeId: 'node-1',
      update: new Uint8Array([1, 2, 3]),
      clientId: 1,
      updateCount: 1,
      authorDID: identity.did,
      privateKey,
      parentHash: null,
      lamport: { time: 1, author: identity.did }
    })

    // Tamper with hash directly
    ;(change as any).hash = 'cid:blake3:tampered'

    expect(verifyChangeHash(change)).toBe(false)
  })
})

describe('isYjsChange', () => {
  it('returns true for YjsChange', () => {
    const { identity, privateKey } = generateIdentity()

    const change = createYjsChange({
      nodeId: 'node-1',
      update: new Uint8Array([1]),
      clientId: 1,
      updateCount: 1,
      authorDID: identity.did,
      privateKey,
      parentHash: null,
      lamport: { time: 1, author: identity.did }
    })

    expect(isYjsChange(change)).toBe(true)
  })

  it('returns false for NodeChange-like payload', () => {
    const nodeChange = {
      type: 'node-change',
      payload: {
        nodeId: 'node-1',
        schemaId: 'xnet://xnet.dev/Page',
        properties: { title: 'Test' }
      }
    } as any

    expect(isYjsChange(nodeChange)).toBe(false)
  })

  it('returns false for invalid payload', () => {
    expect(isYjsChange({ type: 'yjs-update', payload: null } as any)).toBe(false)
    expect(isYjsChange({ type: 'yjs-update', payload: 'string' } as any)).toBe(false)
    expect(isYjsChange({ type: 'yjs-update', payload: { nodeId: 'x' } } as any)).toBe(false)
  })
})

describe('isNodeChange', () => {
  it('returns true for NodeChange-like payload', () => {
    const nodeChange = {
      type: 'node-change',
      payload: {
        nodeId: 'node-1',
        schemaId: 'xnet://xnet.dev/Page',
        properties: { title: 'Test' }
      }
    } as any

    expect(isNodeChange(nodeChange)).toBe(true)
  })

  it('returns false for YjsChange', () => {
    const { identity, privateKey } = generateIdentity()

    const change = createYjsChange({
      nodeId: 'node-1',
      update: new Uint8Array([1]),
      clientId: 1,
      updateCount: 1,
      authorDID: identity.did,
      privateKey,
      parentHash: null,
      lamport: { time: 1, author: identity.did }
    })

    expect(isNodeChange(change)).toBe(false)
  })
})

describe('getChangeNodeId', () => {
  it('extracts nodeId from YjsChange', () => {
    const { identity, privateKey } = generateIdentity()

    const change = createYjsChange({
      nodeId: 'page-abc-123',
      update: new Uint8Array([1]),
      clientId: 1,
      updateCount: 1,
      authorDID: identity.did,
      privateKey,
      parentHash: null,
      lamport: { time: 1, author: identity.did }
    })

    expect(getChangeNodeId(change)).toBe('page-abc-123')
  })

  it('extracts nodeId from NodeChange-like payload', () => {
    const nodeChange = {
      type: 'node-change',
      payload: { nodeId: 'task-xyz-789' }
    } as any

    expect(getChangeNodeId(nodeChange)).toBe('task-xyz-789')
  })

  it('returns undefined for invalid payload', () => {
    expect(getChangeNodeId({ type: 'other', payload: {} } as any)).toBeUndefined()
    expect(getChangeNodeId({ type: 'other', payload: null } as any)).toBeUndefined()
  })
})

describe('hash chain integrity', () => {
  it('builds a valid hash chain', () => {
    const { identity, privateKey } = generateIdentity()
    const changes: YjsChange[] = []

    // Create a chain of 5 changes
    let parentHash: string | null = null
    for (let i = 0; i < 5; i++) {
      const change = createYjsChange({
        nodeId: 'node-1',
        update: new Uint8Array([i]),
        clientId: 1,
        updateCount: 1,
        authorDID: identity.did,
        privateKey,
        parentHash: parentHash as any,
        lamport: { time: i + 1, author: identity.did }
      })
      changes.push(change)
      parentHash = change.hash
    }

    // Verify chain linkage
    for (let i = 1; i < changes.length; i++) {
      expect(changes[i].parentHash).toBe(changes[i - 1].hash)
    }

    // Verify all changes
    for (const change of changes) {
      expect(verifyChange(change, identity.publicKey)).toBe(true)
      expect(verifyChangeHash(change)).toBe(true)
    }
  })
})
