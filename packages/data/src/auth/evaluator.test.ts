import type { DID } from '@xnet/core'
import { generateSigningKeyPair } from '@xnet/crypto'
import { createDID } from '@xnet/identity'
import { describe, expect, it } from 'vitest'
import { defineSchema } from '../schema/define'
import { relation, person, text } from '../schema/properties'
import { SchemaRegistry } from '../schema/registry'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import { allow, role } from './builders'
import { DecisionCache, DefaultPolicyEvaluator } from './evaluator'
import { GrantIndex } from './grants'

const GRANT_SCHEMA_ID = 'xnet://xnet.fyi/Grant' as const

const ProjectSchema = defineSchema({
  name: 'AuthProject',
  namespace: 'xnet://tests/',
  properties: {
    title: text({ required: true }),
    admins: person({ multiple: true })
  },
  authorization: {
    roles: {
      owner: role.creator(),
      admin: role.property('admins')
    },
    actions: {
      read: allow('owner', 'admin'),
      write: allow('owner', 'admin'),
      delete: allow('owner'),
      share: allow('owner')
    }
  }
})

const TaskSchema = defineSchema({
  name: 'AuthTask',
  namespace: 'xnet://tests/',
  properties: {
    title: text({ required: true }),
    assignee: person(),
    project: relation({ target: ProjectSchema.schema['@id'] })
  },
  authorization: {
    roles: {
      owner: role.creator(),
      assignee: role.property('assignee'),
      projectAdmin: role.relation('project', 'admin')
    },
    actions: {
      read: allow('owner', 'assignee', 'projectAdmin'),
      write: allow('owner', 'projectAdmin'),
      delete: allow('owner'),
      share: allow('owner')
    },
    fieldRules: {
      title: {
        allow: allow('owner')
      }
    }
  }
})

const LoopSchema = defineSchema({
  name: 'AuthLoop',
  namespace: 'xnet://tests/',
  properties: {
    next: relation({ target: 'xnet://tests/AuthLoop@1.0.0' }),
    title: text({ required: true })
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

function createIdentity(): { did: DID; privateKey: Uint8Array } {
  const keyPair = generateSigningKeyPair()
  return {
    did: createDID(keyPair.publicKey) as DID,
    privateKey: keyPair.privateKey
  }
}

async function createStore(author: { did: DID; privateKey: Uint8Array }): Promise<NodeStore> {
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({
    storage: adapter,
    authorDID: author.did,
    signingKey: author.privateKey
  })
  await store.initialize()
  return store
}

describe('GrantIndex', () => {
  it('indexes grants from list and live updates', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const store = await createStore(alice)

    const grantIndex = new GrantIndex(store)
    await grantIndex.initialize()

    const grant = await store.create({
      schemaId: GRANT_SCHEMA_ID,
      properties: {
        grantee: bob.did,
        resource: 'node-1',
        actions: JSON.stringify(['read', 'write']),
        revokedAt: 0,
        expiresAt: Date.now() + 10_000
      }
    })

    const grants = grantIndex.findGrants('node-1', bob.did)
    expect(grants).toHaveLength(1)
    expect(grants[0]?.id).toBe(grant.id)

    await store.update(grant.id, {
      properties: {
        revokedAt: Date.now()
      }
    })

    expect(grantIndex.findGrants('node-1', bob.did)).toHaveLength(0)
    grantIndex.dispose()
  })
})

describe('DefaultPolicyEvaluator', () => {
  it('allows relation-derived roles and caches decisions', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const store = await createStore(alice)

    const project = await store.create({
      schemaId: ProjectSchema.schema['@id'],
      properties: {
        title: 'Project',
        admins: [bob.did]
      }
    })

    const task = await store.create({
      schemaId: TaskSchema.schema['@id'],
      properties: {
        title: 'Task',
        project: project.id
      }
    })

    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(ProjectSchema)
    schemaRegistry.register(TaskSchema)

    const grantIndex = new GrantIndex(store)
    await grantIndex.initialize()

    const evaluator = new DefaultPolicyEvaluator({
      store,
      schemaRegistry,
      grantIndex,
      cache: new DecisionCache({ ttlMs: 60_000 })
    })

    const first = await evaluator.can({
      subject: bob.did,
      action: 'write',
      nodeId: task.id
    })

    expect(first.allowed).toBe(true)
    expect(first.cached).toBe(false)
    expect(first.roles).toContain('projectAdmin')

    const second = await evaluator.can({
      subject: bob.did,
      action: 'write',
      nodeId: task.id
    })

    expect(second.allowed).toBe(true)
    expect(second.cached).toBe(true)

    grantIndex.dispose()
  })

  it('enforces field-level rules for write patches', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const store = await createStore(alice)

    const project = await store.create({
      schemaId: ProjectSchema.schema['@id'],
      properties: {
        title: 'Project',
        admins: [bob.did]
      }
    })

    const task = await store.create({
      schemaId: TaskSchema.schema['@id'],
      properties: {
        title: 'Task',
        project: project.id
      }
    })

    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(ProjectSchema)
    schemaRegistry.register(TaskSchema)

    const grantIndex = new GrantIndex(store)
    await grantIndex.initialize()

    const evaluator = new DefaultPolicyEvaluator({
      store,
      schemaRegistry,
      grantIndex
    })

    const decision = await evaluator.can({
      subject: bob.did,
      action: 'write',
      nodeId: task.id,
      patch: {
        title: 'Changed'
      }
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reasons).toContain('DENY_FIELD_RESTRICTED')
    grantIndex.dispose()
  })

  it('uses grants when role-based access denies', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const store = await createStore(alice)

    const task = await store.create({
      schemaId: TaskSchema.schema['@id'],
      properties: {
        title: 'Task'
      }
    })

    await store.create({
      schemaId: GRANT_SCHEMA_ID,
      properties: {
        issuer: alice.did,
        grantee: bob.did,
        resource: task.id,
        actions: JSON.stringify(['write']),
        revokedAt: 0,
        expiresAt: Date.now() + 60_000
      }
    })

    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(TaskSchema)

    const grantIndex = new GrantIndex(store)
    await grantIndex.initialize()

    const evaluator = new DefaultPolicyEvaluator({
      store,
      schemaRegistry,
      grantIndex
    })

    const decision = await evaluator.can({
      subject: bob.did,
      action: 'write',
      nodeId: task.id
    })

    expect(decision.allowed).toBe(true)
    expect(decision.grants).toHaveLength(1)
    grantIndex.dispose()
  })

  it('terminates safely on relation cycles', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const store = await createStore(alice)

    const a = await store.create({
      schemaId: LoopSchema.schema['@id'],
      properties: {
        title: 'A'
      }
    })

    const b = await store.create({
      schemaId: LoopSchema.schema['@id'],
      properties: {
        title: 'B',
        next: a.id
      }
    })

    await store.update(a.id, {
      properties: {
        next: b.id
      }
    })

    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(LoopSchema)

    const grantIndex = new GrantIndex(store)
    await grantIndex.initialize()

    const evaluator = new DefaultPolicyEvaluator({
      store,
      schemaRegistry,
      grantIndex,
      maxDepth: 3,
      maxNodes: 20
    })

    const decision = await evaluator.can({
      subject: bob.did,
      action: 'read',
      nodeId: a.id
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reasons).toContain('DENY_NO_ROLE_MATCH')
    grantIndex.dispose()
  })

  it('returns structured explain traces', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const store = await createStore(alice)

    const project = await store.create({
      schemaId: ProjectSchema.schema['@id'],
      properties: {
        title: 'Project',
        admins: [bob.did]
      }
    })

    const task = await store.create({
      schemaId: TaskSchema.schema['@id'],
      properties: {
        title: 'Task',
        project: project.id
      }
    })

    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(ProjectSchema)
    schemaRegistry.register(TaskSchema)

    const grantIndex = new GrantIndex(store)
    await grantIndex.initialize()

    const evaluator = new DefaultPolicyEvaluator({
      store,
      schemaRegistry,
      grantIndex
    })

    const trace = await evaluator.explain({
      subject: bob.did,
      action: 'write',
      nodeId: task.id
    })

    expect(trace.steps.length).toBeGreaterThan(0)
    expect(trace.steps.some((step) => step.phase === 'role-resolve')).toBe(true)
    expect(trace.steps.some((step) => step.phase === 'schema-eval')).toBe(true)
    grantIndex.dispose()
  })
})
