import type {
  AuthAction,
  AuthCheckInput,
  AuthDecision,
  AuthTrace,
  DID,
  PolicyEvaluator
} from '@xnetjs/core'
import { generateIdentity, verifyUCAN } from '@xnetjs/identity'
import { describe, expect, it, vi } from 'vitest'
import { GrantRateLimiter } from './grant-rate-limit'
import { GRANT_SCHEMA_IRI } from './grants'
import { StoreAuth, StoreAuthError } from './store-auth'

type TestNode = {
  id: string
  schemaId: string
  createdBy: DID
  properties: Record<string, unknown>
}

class TestStore {
  private nextId = 0
  private nodes = new Map<string, TestNode>()

  seed(node: TestNode): void {
    this.nodes.set(node.id, node)
  }

  async create(options: {
    schemaId: string
    properties: Record<string, unknown>
  }): Promise<{ id: string }> {
    const id = `grant-${++this.nextId}`
    this.nodes.set(id, {
      id,
      schemaId: options.schemaId,
      createdBy: options.properties.issuer as DID,
      properties: { ...options.properties }
    })
    return { id }
  }

  async update(nodeId: string, options: { properties: Record<string, unknown> }): Promise<void> {
    const node = this.nodes.get(nodeId)
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`)
    }

    this.nodes.set(nodeId, {
      ...node,
      properties: {
        ...node.properties,
        ...options.properties
      }
    })
  }

  async get(nodeId: string): Promise<TestNode | null> {
    return this.nodes.get(nodeId) ?? null
  }

  async list(options?: { schemaId?: string }): Promise<TestNode[]> {
    const all = [...this.nodes.values()]
    if (!options?.schemaId) {
      return all
    }
    return all.filter(
      (node) =>
        node.schemaId === options.schemaId || node.schemaId.startsWith(`${options.schemaId}@`)
    )
  }
}

class TestEvaluator implements PolicyEvaluator {
  readonly invalidate = vi.fn<(nodeId: string) => void>()
  readonly invalidateSubject = vi.fn<(did: DID) => void>()

  constructor(private readonly permissionMap: Map<string, boolean>) {}

  async can(input: AuthCheckInput): Promise<AuthDecision> {
    const key = `${input.subject}:${input.action}:${input.nodeId}`
    const allowed = this.permissionMap.get(key) ?? false
    return {
      allowed,
      action: input.action,
      subject: input.subject,
      resource: input.nodeId,
      roles: allowed ? ['owner'] : [],
      grants: [],
      reasons: allowed ? [] : ['DENY_NO_ROLE_MATCH'],
      cached: false,
      evaluatedAt: Date.now(),
      duration: 0
    }
  }

  async explain(input: AuthCheckInput): Promise<AuthTrace> {
    const decision = await this.can(input)
    return {
      ...decision,
      steps: []
    }
  }
}

function createPermissions(
  actorDid: DID,
  resourceId: string,
  actions: AuthAction[]
): Map<string, boolean> {
  const map = new Map<string, boolean>()
  for (const action of actions) {
    map.set(`${actorDid}:${action}:${resourceId}`, true)
  }
  return map
}

describe('StoreAuth', () => {
  it('rejects self-grants', async () => {
    const actor = generateIdentity()
    const store = new TestStore()
    const resourceId = 'node-1'
    store.seed({
      id: resourceId,
      schemaId: 'xnet://xnet.fyi/Page',
      createdBy: actor.identity.did,
      properties: {}
    })

    const evaluator = new TestEvaluator(
      createPermissions(actor.identity.did, resourceId, ['share'])
    )
    const auth = new StoreAuth({
      store,
      actorDid: actor.identity.did,
      signingKey: actor.privateKey,
      evaluator
    })

    await expect(
      auth.grant({
        to: actor.identity.did,
        actions: ['read'],
        resource: resourceId
      })
    ).rejects.toThrow('Cannot grant access to yourself')
  })

  it('returns deterministic error code when grant rate limit is exceeded', async () => {
    const actor = generateIdentity()
    const grantee = generateIdentity()
    const store = new TestStore()
    const resourceId = 'node-rate-limit'
    store.seed({
      id: resourceId,
      schemaId: 'xnet://xnet.fyi/Page',
      createdBy: actor.identity.did,
      properties: {}
    })

    const evaluator = new TestEvaluator(
      createPermissions(actor.identity.did, resourceId, ['share', 'read'])
    )
    const rateLimiter = new GrantRateLimiter({ limitPerMinute: 0 })
    const auth = new StoreAuth({
      store,
      actorDid: actor.identity.did,
      signingKey: actor.privateKey,
      evaluator,
      rateLimiter
    })

    await expect(
      auth.grant({
        to: grantee.identity.did,
        actions: ['read'],
        resource: resourceId
      })
    ).rejects.toMatchObject({
      name: 'StoreAuthError',
      code: 'AUTH_RATE_LIMIT_EXCEEDED'
    } satisfies Partial<StoreAuthError>)
  })

  it('creates a grant with UCAN token and invalidates caches', async () => {
    const actor = generateIdentity()
    const grantee = generateIdentity()
    const store = new TestStore()
    const resourceId = 'node-2'
    store.seed({
      id: resourceId,
      schemaId: 'xnet://xnet.fyi/Task',
      createdBy: actor.identity.did,
      properties: {}
    })

    const evaluator = new TestEvaluator(
      createPermissions(actor.identity.did, resourceId, ['share', 'read', 'write'])
    )
    const keyManager = {
      getContentKey: vi.fn(async () => new Uint8Array(32)),
      addRecipient: vi.fn(async () => undefined),
      rotateContentKey: vi.fn(async () => undefined)
    }
    const publicKeyResolver = {
      resolve: vi.fn(async () => new Uint8Array(32).fill(7)),
      resolveBatch: vi.fn(async () => new Map())
    }

    const auth = new StoreAuth({
      store,
      actorDid: actor.identity.did,
      signingKey: actor.privateKey,
      evaluator,
      keyManager,
      publicKeyResolver
    })

    const grant = await auth.grant({
      to: grantee.identity.did,
      actions: ['read', 'write'],
      resource: resourceId,
      expiresIn: '7d'
    })

    expect(grant.id).toBeTruthy()
    expect(grant.resourceSchema).toBe('xnet://xnet.fyi/Task')
    expect(grant.proofDepth).toBe(0)
    expect(grant.actions).toEqual(['read', 'write'])
    expect(grant.ucanToken).toBeTruthy()
    expect(verifyUCAN(grant.ucanToken as string).valid).toBe(true)
    expect(keyManager.addRecipient).toHaveBeenCalledTimes(1)
    expect(evaluator.invalidate).toHaveBeenCalledWith(resourceId)
    expect(evaluator.invalidateSubject).toHaveBeenCalledWith(grantee.identity.did)
  })

  it('enforces proof depth and attenuation for delegated grants', async () => {
    const owner = generateIdentity()
    const delegate = generateIdentity()
    const child = generateIdentity()
    const store = new TestStore()
    const resourceId = 'node-3'

    store.seed({
      id: resourceId,
      schemaId: 'xnet://xnet.fyi/Page',
      createdBy: owner.identity.did,
      properties: {}
    })

    store.seed({
      id: 'parent-grant',
      schemaId: GRANT_SCHEMA_IRI,
      createdBy: owner.identity.did,
      properties: {
        issuer: owner.identity.did,
        grantee: delegate.identity.did,
        resource: resourceId,
        resourceSchema: 'xnet://xnet.fyi/Page',
        actions: JSON.stringify(['read']),
        expiresAt: Date.now() + 100000,
        revokedAt: 0,
        proofDepth: 4,
        ucanToken: 'token'
      }
    })

    const evaluator = new TestEvaluator(
      createPermissions(delegate.identity.did, resourceId, ['share', 'read', 'write'])
    )
    const auth = new StoreAuth({
      store,
      actorDid: delegate.identity.did,
      signingKey: delegate.privateKey,
      evaluator
    })

    await expect(
      auth.grant({
        to: child.identity.did,
        actions: ['read'],
        resource: resourceId,
        parentGrantId: 'parent-grant'
      })
    ).rejects.toMatchObject({
      name: 'StoreAuthError',
      code: 'AUTH_DELEGATION_DEPTH_EXCEEDED'
    } satisfies Partial<StoreAuthError>)

    const shallowParent = {
      ...(await store.get('parent-grant')),
      properties: {
        ...(await store.get('parent-grant'))!.properties,
        proofDepth: 0
      }
    }
    store.seed(shallowParent as TestNode)

    await expect(
      auth.grant({
        to: child.identity.did,
        actions: ['write'],
        resource: resourceId,
        parentGrantId: 'parent-grant'
      })
    ).rejects.toMatchObject({
      name: 'StoreAuthError',
      code: 'AUTH_DELEGATION_ESCALATION'
    } satisfies Partial<StoreAuthError>)
  })

  it('enforces last-admin protection when revocation removes final share holder', async () => {
    const owner = generateIdentity()
    const admin = generateIdentity()
    const store = new TestStore()
    const resourceId = 'node-last-admin'

    store.seed({
      id: 'only-share-grant',
      schemaId: GRANT_SCHEMA_IRI,
      createdBy: owner.identity.did,
      properties: {
        issuer: owner.identity.did,
        grantee: admin.identity.did,
        resource: resourceId,
        resourceSchema: 'xnet://xnet.fyi/Page',
        actions: JSON.stringify(['share']),
        expiresAt: 0,
        revokedAt: 0,
        proofDepth: 0
      }
    })

    const evaluator = new TestEvaluator(
      createPermissions(owner.identity.did, resourceId, ['share', 'read'])
    )
    const auth = new StoreAuth({
      store,
      actorDid: owner.identity.did,
      signingKey: owner.privateKey,
      evaluator
    })

    await expect(auth.revoke({ grantId: 'only-share-grant' })).rejects.toThrow(
      "Cannot revoke: this would leave zero users with 'share' access"
    )
  })

  it('cascades revocation to child grants', async () => {
    const owner = generateIdentity()
    const admin = generateIdentity()
    const child = generateIdentity()
    const store = new TestStore()
    const resourceId = 'node-4'

    store.seed({
      id: resourceId,
      schemaId: 'xnet://xnet.fyi/Page',
      createdBy: owner.identity.did,
      properties: {}
    })

    const parentGrantId = 'grant-parent'
    store.seed({
      id: parentGrantId,
      schemaId: GRANT_SCHEMA_IRI,
      createdBy: owner.identity.did,
      properties: {
        issuer: owner.identity.did,
        grantee: admin.identity.did,
        resource: resourceId,
        resourceSchema: 'xnet://xnet.fyi/Page',
        actions: JSON.stringify(['share']),
        expiresAt: 0,
        revokedAt: 0,
        proofDepth: 0
      }
    })

    store.seed({
      id: 'grant-child',
      schemaId: GRANT_SCHEMA_IRI,
      createdBy: admin.identity.did,
      properties: {
        issuer: admin.identity.did,
        grantee: child.identity.did,
        resource: resourceId,
        resourceSchema: 'xnet://xnet.fyi/Page',
        actions: JSON.stringify(['read']),
        expiresAt: 0,
        revokedAt: 0,
        proofDepth: 1,
        parentGrantId
      }
    })

    const evaluator = new TestEvaluator(
      createPermissions(owner.identity.did, resourceId, ['share', 'read', 'write', 'delete'])
    )

    const keyManager = {
      getContentKey: vi.fn(async () => new Uint8Array(32)),
      addRecipient: vi.fn(async () => undefined),
      rotateContentKey: vi.fn(async () => undefined)
    }

    const auth = new StoreAuth({
      store,
      actorDid: owner.identity.did,
      signingKey: owner.privateKey,
      evaluator,
      keyManager
    })

    await auth.revoke({ grantId: parentGrantId })

    const parentGrant = await store.get(parentGrantId)
    const childGrant = await store.get('grant-child')
    expect(parentGrant?.properties.revokedAt).toBeTypeOf('number')
    expect(childGrant?.properties.revokedAt).toBeTypeOf('number')
    expect(keyManager.rotateContentKey).toHaveBeenCalledWith(resourceId, admin.identity.did)
  })

  it('lists grants by status', async () => {
    const actor = generateIdentity()
    const bob = generateIdentity()
    const store = new TestStore()
    const resourceId = 'node-5'
    const now = Date.now()

    store.seed({
      id: resourceId,
      schemaId: 'xnet://xnet.fyi/Page',
      createdBy: actor.identity.did,
      properties: {}
    })

    store.seed({
      id: 'grant-active',
      schemaId: GRANT_SCHEMA_IRI,
      createdBy: actor.identity.did,
      properties: {
        issuer: actor.identity.did,
        grantee: bob.identity.did,
        resource: resourceId,
        resourceSchema: 'xnet://xnet.fyi/Page',
        actions: JSON.stringify(['read']),
        expiresAt: now + 100000,
        revokedAt: 0,
        proofDepth: 0
      }
    })

    store.seed({
      id: 'grant-expired',
      schemaId: GRANT_SCHEMA_IRI,
      createdBy: actor.identity.did,
      properties: {
        issuer: actor.identity.did,
        grantee: bob.identity.did,
        resource: resourceId,
        resourceSchema: 'xnet://xnet.fyi/Page',
        actions: JSON.stringify(['read']),
        expiresAt: now - 100000,
        revokedAt: 0,
        proofDepth: 0
      }
    })

    store.seed({
      id: 'grant-revoked',
      schemaId: GRANT_SCHEMA_IRI,
      createdBy: actor.identity.did,
      properties: {
        issuer: actor.identity.did,
        grantee: bob.identity.did,
        resource: resourceId,
        resourceSchema: 'xnet://xnet.fyi/Page',
        actions: JSON.stringify(['read']),
        expiresAt: now + 100000,
        revokedAt: now - 1,
        proofDepth: 0
      }
    })

    const evaluator = new TestEvaluator(
      createPermissions(actor.identity.did, resourceId, ['share'])
    )
    const auth = new StoreAuth({
      store,
      actorDid: actor.identity.did,
      signingKey: actor.privateKey,
      evaluator,
      rateLimiter: new GrantRateLimiter({ limitPerMinute: 100 })
    })

    const active = await auth.listGrants({ nodeId: resourceId, status: 'active' })
    const expired = await auth.listGrants({ nodeId: resourceId, status: 'expired' })
    const revoked = await auth.listGrants({ nodeId: resourceId, status: 'revoked' })

    expect(active).toHaveLength(1)
    expect(active[0]?.id).toBe('grant-active')
    expect(expired).toHaveLength(1)
    expect(expired[0]?.id).toBe('grant-expired')
    expect(revoked).toHaveLength(1)
    expect(revoked[0]?.id).toBe('grant-revoked')
  })
})
