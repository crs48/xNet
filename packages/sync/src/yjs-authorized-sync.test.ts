import type { EnvelopeVerificationResult, SignedYjsEnvelopeV2 } from './yjs-envelope'
import type { AuthDecision, DID, PolicyEvaluator } from '@xnetjs/core'
import { generateKey, randomBytes } from '@xnetjs/crypto'
import { describe, expect, it, vi } from 'vitest'
import { YjsAuthGate, encryptYjsState, serializeEncryptedYjsState } from './yjs-authorization'
import {
  AuthorizedSyncManager,
  AuthorizedYjsError,
  AuthorizedYjsSyncProvider,
  type YDocCodec,
  type YDocLike
} from './yjs-authorized-sync'

const OWNER_DID = 'did:key:z6MkuOwner11111111111111111111111111111111111111' as DID
const REVOKED_DID = 'did:key:z6MkuRevoked111111111111111111111111111111111111' as DID

type TestDoc = YDocLike & {
  updates: Uint8Array[]
  events: Array<{ event: string; args: unknown[] }>
}

const TEST_CODEC: YDocCodec<TestDoc> = {
  createDoc: () => ({
    updates: [],
    events: [],
    emit(event, args) {
      this.events.push({ event, args })
    }
  }),
  applyUpdate(doc, update) {
    doc.updates.push(update)
  },
  encodeStateAsUpdate(doc) {
    if (doc.updates.length === 0) {
      return new Uint8Array(0)
    }

    const total = doc.updates.reduce((sum, current) => sum + current.length, 0)
    const merged = new Uint8Array(total)
    let offset = 0
    for (const update of doc.updates) {
      merged.set(update, offset)
      offset += update.length
    }
    return merged
  },
  encodeStateVector(doc) {
    return new Uint8Array([doc.updates.length])
  }
}

describe('yjs-authorized-sync', () => {
  it('AuthorizedSyncManager.acquire gates document access by policy decision', async () => {
    const deniedEvaluator = createEvaluator(false)
    const manager = new AuthorizedSyncManager({
      authorDID: OWNER_DID,
      evaluator: deniedEvaluator,
      keyProvider: { getOrUnwrap: vi.fn(async () => generateKey()) },
      adapter: {
        getDocumentContent: vi.fn(async () => null),
        setDocumentContent: vi.fn(async () => {})
      },
      store: {
        subscribe: vi.fn(() => () => {})
      },
      ydoc: TEST_CODEC
    })

    await expect(manager.acquire('node-1', 'write')).rejects.toBeInstanceOf(AuthorizedYjsError)
  })

  it('AuthorizedSyncManager.acquire loads encrypted Y.Doc state via adapter.getDocumentContent', async () => {
    const state = randomBytes(24)
    const key = generateKey()
    const encrypted = encryptYjsState(state, 'node-22', key)
    const serialized = serializeEncryptedYjsState(encrypted)

    const adapter = {
      getDocumentContent: vi.fn(async () => serialized),
      setDocumentContent: vi.fn(async () => {})
    }

    const manager = new AuthorizedSyncManager({
      authorDID: OWNER_DID,
      evaluator: createEvaluator(true),
      keyProvider: { getOrUnwrap: vi.fn(async () => key) },
      adapter,
      store: {
        subscribe: vi.fn(() => () => {})
      },
      ydoc: TEST_CODEC
    })

    const acquired = await manager.acquire('node-22', 'read')
    expect(adapter.getDocumentContent).toHaveBeenCalledWith('node-22')
    expect(acquired.doc.updates).toHaveLength(1)
    expect(acquired.doc.updates[0]).toEqual(state)
  })

  it('revocation event wiring invalidates peer auth and rotates encrypted state', async () => {
    let listener:
      | ((event: { node?: { schemaId?: string; properties?: Record<string, unknown> } }) => void)
      | undefined

    const adapter = {
      getDocumentContent: vi.fn(async () => null),
      setDocumentContent: vi.fn(async () => {})
    }
    const rotateSpy = vi.fn(async () => {})

    const manager = new AuthorizedSyncManager({
      authorDID: OWNER_DID,
      evaluator: createEvaluator(true),
      keyProvider: { getOrUnwrap: vi.fn(async () => generateKey()) },
      adapter,
      store: {
        subscribe: vi.fn((cb) => {
          listener = cb
          return () => {}
        })
      },
      ydoc: TEST_CODEC,
      onRotateContentKey: rotateSpy
    })

    const acquired = await manager.acquire('node-7', 'write')
    expect(acquired.room).toBeDefined()

    const room = acquired.room!
    room.authorizedPeers.add(REVOKED_DID)
    const invalidateSpy = vi.spyOn(room.authGate, 'invalidatePeer')

    listener?.({
      node: {
        schemaId: 'xnet://xnet.fyi/Grant',
        properties: {
          resource: 'node-7',
          grantee: REVOKED_DID,
          revokedAt: Date.now()
        }
      }
    })

    await vi.waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(REVOKED_DID)
      expect(adapter.setDocumentContent).toHaveBeenCalledTimes(1)
      expect(rotateSpy).toHaveBeenCalledTimes(1)
    })

    expect(acquired.doc.events.filter((entry) => entry.event === 'peer:kicked')).toHaveLength(1)
    expect(acquired.doc.events.filter((entry) => entry.event === 'key:rotated')).toHaveLength(1)
  })

  it('AuthorizedYjsSyncProvider rejects unauthorized updates before apply', async () => {
    const evaluator = createEvaluator(false)
    const authGate = new YjsAuthGate(evaluator, 'node-50')
    const doc = TEST_CODEC.createDoc('node-50')
    const rejected = vi.fn()

    const verifyEnvelope = vi.fn(
      async (_envelope: SignedYjsEnvelopeV2): Promise<EnvelopeVerificationResult> => ({
        valid: true,
        errors: [],
        level: 0,
        authorDID: REVOKED_DID,
        clientId: 1
      })
    )

    const provider = new AuthorizedYjsSyncProvider({
      nodeId: 'node-50',
      doc,
      ydoc: TEST_CODEC,
      authGate,
      verifyEnvelope,
      onRejected: rejected
    })

    const applied = await provider.handleRemoteUpdate(
      createEnvelope('node-50', REVOKED_DID, randomBytes(8))
    )

    expect(applied).toBe(false)
    expect(doc.updates).toHaveLength(0)
    expect(rejected).toHaveBeenCalledWith({ peerId: REVOKED_DID, reason: 'unauthorized' })
  })

  it('AuthorizedYjsSyncProvider applies authorized remote updates', async () => {
    const evaluator = createEvaluator(true)
    const authGate = new YjsAuthGate(evaluator, 'node-88')
    const doc = TEST_CODEC.createDoc('node-88')
    const update = randomBytes(16)

    const verifyEnvelope = vi.fn(
      async (_envelope: SignedYjsEnvelopeV2): Promise<EnvelopeVerificationResult> => ({
        valid: true,
        errors: [],
        level: 0,
        authorDID: OWNER_DID,
        clientId: 2
      })
    )

    const provider = new AuthorizedYjsSyncProvider({
      nodeId: 'node-88',
      doc,
      ydoc: TEST_CODEC,
      authGate,
      verifyEnvelope
    })

    const applied = await provider.handleRemoteUpdate(createEnvelope('node-88', OWNER_DID, update))

    expect(applied).toBe(true)
    expect(doc.updates).toHaveLength(1)
    expect(doc.updates[0]).toEqual(update)
  })
})

function createEvaluator(allowed: boolean): PolicyEvaluator {
  return {
    can: vi.fn(async (input) => createDecision(allowed, input.subject, input.action, input.nodeId)),
    explain: vi.fn(),
    invalidate: vi.fn(),
    invalidateSubject: vi.fn()
  }
}

function createDecision(
  allowed: boolean,
  subject: DID,
  action: AuthDecision['action'],
  nodeId: string
): AuthDecision {
  return {
    allowed,
    action,
    subject,
    resource: nodeId,
    roles: [],
    grants: [],
    reasons: allowed ? [] : ['DENY_NO_ROLE_MATCH'],
    cached: false,
    evaluatedAt: Date.now(),
    duration: 1
  }
}

function createEnvelope(nodeId: string, authorDID: DID, update: Uint8Array): SignedYjsEnvelopeV2 {
  return {
    v: 2,
    update,
    meta: {
      authorDID,
      clientId: 1,
      timestamp: Date.now(),
      docId: nodeId
    },
    signature: {
      level: 0,
      ed25519: new Uint8Array(64)
    }
  }
}
