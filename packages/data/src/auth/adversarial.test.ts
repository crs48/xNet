import type { AuthDecision, AuthExpression, DID, PolicyEvaluator } from '@xnetjs/core'
import { createDID, generateIdentity } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { defineSchema } from '../schema/define'
import { relation, text } from '../schema/properties'
import { SchemaRegistry } from '../schema/registry'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import { allow, and, role } from './builders'
import { DefaultPolicyEvaluator } from './evaluator'
import { GrantRateLimiter } from './grant-rate-limit'
import { StoreAuth } from './store-auth'
import { validateAuthorization } from './validate'

const LoopSchema = defineSchema({
  name: 'AuthAdversarialLoop',
  namespace: 'xnet://tests/',
  properties: {
    title: text({ required: true }),
    next: relation({ target: 'xnet://tests/AuthAdversarialLoop@1.0.0' })
  },
  authorization: {
    roles: {
      loop: role.relation('next', 'loop')
    },
    actions: {
      read: allow('loop'),
      write: allow('loop'),
      delete: allow('loop'),
      share: allow('loop')
    }
  }
})

function makeDid(seed: number): DID {
  const bytes = new Uint8Array(32).fill(seed)
  return createDID(bytes) as DID
}

describe('authorization adversarial protections', () => {
  it('rejects expression trees over the configured node budget', () => {
    let expr: AuthExpression = allow('owner')
    for (let i = 0; i < 100; i++) {
      expr = and(expr, allow('owner'))
    }

    const result = validateAuthorization(
      {
        roles: {
          owner: role.creator()
        },
        actions: {
          read: expr,
          write: allow('owner'),
          delete: allow('owner'),
          share: allow('owner')
        }
      },
      {
        title: {
          '@id': 'xnet://tests/title',
          name: 'title',
          type: 'text',
          required: false
        }
      }
    )

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.code === 'AUTH_SCHEMA_EXPR_LIMIT_EXCEEDED')).toBe(
      true
    )
  })

  it('terminates safely for cyclic relation traversal graphs', async () => {
    const owner = generateIdentity()
    const stranger = generateIdentity()

    const store = new NodeStore({
      storage: new MemoryNodeStorageAdapter(),
      authorDID: owner.identity.did,
      signingKey: owner.privateKey
    })
    await store.initialize()

    const a = await store.create({
      schemaId: LoopSchema.schema['@id'],
      properties: { title: 'A' }
    })
    const b = await store.create({
      schemaId: LoopSchema.schema['@id'],
      properties: { title: 'B', next: a.id }
    })
    await store.update(a.id, {
      properties: { next: b.id }
    })

    const registry = new SchemaRegistry()
    registry.register(LoopSchema)

    const evaluator = new DefaultPolicyEvaluator({
      store,
      schemaRegistry: registry,
      maxDepth: 3,
      maxNodes: 50
    })

    const decision = await evaluator.can({
      subject: stranger.identity.did,
      action: 'read',
      nodeId: a.id
    })

    expect(decision.allowed).toBe(false)
  })

  it('enforces grant flood limits deterministically', async () => {
    const owner = generateIdentity()
    const recipient = generateIdentity()
    const resourceId = 'node-flood-1'

    const grantNodes = new Map<
      string,
      {
        id: string
        createdBy: DID
        schemaId: string
        properties: Record<string, unknown>
      }
    >()

    const store = {
      async create(options: { schemaId: string; properties: Record<string, unknown> }) {
        const id = `${options.schemaId}:${Math.random().toString(36).slice(2)}`
        grantNodes.set(id, {
          id,
          createdBy: owner.identity.did,
          schemaId: options.schemaId,
          properties: options.properties
        })
        return { id }
      },
      async update() {
        return undefined
      },
      async get(nodeId: string) {
        if (nodeId === resourceId) {
          return {
            id: resourceId,
            createdBy: owner.identity.did,
            schemaId: 'xnet://xnet.fyi/Page',
            properties: {}
          }
        }
        const grant = grantNodes.get(nodeId)
        if (grant) {
          return grant
        }
        return null
      },
      async list() {
        return []
      }
    }

    const evaluator: PolicyEvaluator = {
      async can(): Promise<AuthDecision> {
        return {
          allowed: true,
          action: 'share',
          subject: owner.identity.did,
          resource: resourceId,
          roles: ['owner'],
          grants: [],
          reasons: [],
          cached: false,
          evaluatedAt: Date.now(),
          duration: 0
        }
      },
      async explain() {
        throw new Error('not used')
      },
      invalidate() {},
      invalidateSubject() {}
    }

    const auth = new StoreAuth({
      store,
      actorDid: owner.identity.did,
      signingKey: owner.privateKey,
      evaluator,
      rateLimiter: new GrantRateLimiter({ limitPerMinute: 1 })
    })

    await auth.grant({
      to: recipient.identity.did,
      actions: ['read'],
      resource: resourceId
    })

    await expect(
      auth.grant({
        to: makeDid(5),
        actions: ['read'],
        resource: resourceId
      })
    ).rejects.toMatchObject({ code: 'AUTH_RATE_LIMIT_EXCEEDED' })
  })

  it('supports fuzz-like randomized expression validation without throwing', () => {
    const roles = ['owner', 'editor', 'viewer']
    const buildExpr = (depth: number): AuthExpression => {
      const roleName = roles[depth % roles.length]
      return allow(roleName)
    }

    for (let i = 0; i < 200; i++) {
      const expr = buildExpr(i)
      const result = validateAuthorization(
        {
          roles: {
            owner: role.creator()
          },
          actions: {
            read: expr,
            write: allow('owner'),
            delete: allow('owner'),
            share: allow('owner')
          }
        },
        {
          title: {
            '@id': 'xnet://tests/title',
            name: 'title',
            type: 'text',
            required: false
          }
        }
      )

      expect(typeof result.valid).toBe('boolean')
    }
  })
})
