import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { defineSchema } from '../schema/define'
import { relation, person, text } from '../schema/properties'
import { SchemaRegistry } from '../schema/registry'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import { allow, and, deny, or, role } from './builders'
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

const DenyPrecedenceSchema = defineSchema({
  name: 'AuthDenyPrecedence',
  namespace: 'xnet://tests/',
  properties: {
    title: text({ required: true }),
    editors: person({ multiple: true }),
    banned: person({ multiple: true })
  },
  authorization: {
    roles: {
      owner: role.creator(),
      editor: role.property('editors'),
      banned: role.property('banned')
    },
    actions: {
      read: allow('owner', 'editor'),
      write: or(allow('owner'), and(allow('editor'), deny('banned'))),
      delete: allow('owner'),
      share: allow('owner')
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
  it('honors hub grants for non-owners on legacy schemas (0192 Landmine #1)', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const carol = createIdentity()
    const store = await createStore(alice)

    const LegacyDoc = defineSchema({
      name: 'AuthLegacyDoc',
      namespace: 'xnet://tests/',
      properties: { title: text({ required: true }) }
    })
    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(LegacyDoc)

    const node = await store.create({
      schemaId: LegacyDoc.schema['@id'],
      properties: { title: 'shared' }
    })
    await store.create({
      schemaId: GRANT_SCHEMA_ID,
      properties: {
        grantee: bob.did,
        resource: node.id,
        actions: JSON.stringify(['read']),
        revokedAt: 0,
        expiresAt: Date.now() + 10_000
      }
    })

    const grantIndex = new GrantIndex(store)
    await grantIndex.initialize()
    const evaluator = new DefaultPolicyEvaluator({ store, schemaRegistry, grantIndex })

    // Owner is always allowed.
    expect(
      (await evaluator.can({ subject: alice.did, action: 'read', nodeId: node.id })).allowed
    ).toBe(true)
    // Non-owner WITH a grant is allowed — the fix. Previously a flat deny here
    // hid grant-shared legacy-schema nodes from their collaborators.
    expect(
      (await evaluator.can({ subject: bob.did, action: 'read', nodeId: node.id })).allowed
    ).toBe(true)
    // Non-owner WITHOUT a grant stays denied.
    expect(
      (await evaluator.can({ subject: carol.did, action: 'read', nodeId: node.id })).allowed
    ).toBe(false)
    grantIndex.dispose()
  })

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

  it('does not let a cached node-level decision mask a field rule', async () => {
    // A node-level write check (no patch) is cacheable; a field-scoped check
    // (with a patch) must not read or write that cache, or the field rule
    // would be silently bypassed for the rest of the TTL.
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

    // Prime the cache with the node-level decision: bob is a project admin,
    // so he can write the node in general.
    const nodeLevel = await evaluator.can({
      subject: bob.did,
      action: 'write',
      nodeId: task.id
    })
    expect(nodeLevel.allowed).toBe(true)

    // The field-scoped check must still consult the `title` field rule
    // (owner-only) rather than returning the cached node-level grant.
    const fieldLevel = await evaluator.can({
      subject: bob.did,
      action: 'write',
      nodeId: task.id,
      patch: {
        title: 'Changed'
      }
    })
    expect(fieldLevel.allowed).toBe(false)
    expect(fieldLevel.cached).not.toBe(true)
    expect(fieldLevel.reasons).toContain('DENY_FIELD_RESTRICTED')

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

  it('enforces deny precedence over nested allow expressions', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const store = await createStore(alice)

    const node = await store.create({
      schemaId: DenyPrecedenceSchema.schema['@id'],
      properties: {
        title: 'Deny wins',
        editors: [bob.did],
        banned: [bob.did]
      }
    })

    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(DenyPrecedenceSchema)

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
      nodeId: node.id
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reasons).toContain('DENY_NODE_POLICY')
    grantIndex.dispose()
  })

  it('emits auth:decision events for telemetry sinks', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const store = await createStore(alice)

    const node = await store.create({
      schemaId: TaskSchema.schema['@id'],
      properties: {
        title: 'Telemetry',
        assignee: bob.did
      }
    })

    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(TaskSchema)

    const events: Array<{
      type: string
      action: string
      allowed: boolean
      resource: string
      subject: DID
    }> = []

    const evaluator = new DefaultPolicyEvaluator({
      store,
      schemaRegistry,
      onDecision: (event) => {
        events.push(event)
      }
    })

    await evaluator.can({
      subject: bob.did,
      action: 'read',
      nodeId: node.id
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual(
      expect.objectContaining({
        type: 'auth:decision',
        action: 'read',
        resource: node.id,
        subject: bob.did,
        allowed: true
      })
    )
  })

  it('uses offline policy decisionCacheTTL for cache expiry', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const store = await createStore(alice)

    const task = await store.create({
      schemaId: TaskSchema.schema['@id'],
      properties: {
        title: 'Task',
        assignee: bob.did
      }
    })

    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(TaskSchema)

    let now = 1_000
    const cache = new DecisionCache({
      ttlMs: 30_000,
      now: () => now
    })

    const evaluator = new DefaultPolicyEvaluator({
      store,
      schemaRegistry,
      cache,
      now: () => now,
      offlinePolicy: {
        decisionCacheTTL: 10
      }
    })

    const first = await evaluator.can({
      subject: bob.did,
      action: 'read',
      nodeId: task.id
    })
    expect(first.cached).toBe(false)

    const second = await evaluator.can({
      subject: bob.did,
      action: 'read',
      nodeId: task.id
    })
    expect(second.cached).toBe(true)

    now += 11
    const third = await evaluator.can({
      subject: bob.did,
      action: 'read',
      nodeId: task.id
    })
    expect(third.cached).toBe(false)
  })

  it('blocks operations when auth state is stale while online', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const store = await createStore(alice)

    const task = await store.create({
      schemaId: TaskSchema.schema['@id'],
      properties: {
        title: 'Task',
        assignee: bob.did
      }
    })

    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(TaskSchema)

    const evaluator = new DefaultPolicyEvaluator({
      store,
      schemaRegistry,
      now: () => 10_002,
      isOnline: () => true,
      getLastSyncedAt: () => 1,
      offlinePolicy: {
        maxStaleness: 10_000
      }
    })

    const decision = await evaluator.can({
      subject: bob.did,
      action: 'read',
      nodeId: task.id
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reasons).toContain('DENY_STALE_OFFLINE')
  })

  it('triggers hybrid revalidation events on reconnect', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const store = await createStore(alice)

    const task = await store.create({
      schemaId: TaskSchema.schema['@id'],
      properties: {
        title: 'Task',
        assignee: bob.did
      }
    })

    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(TaskSchema)

    let online = true
    const revalidationEvents: Array<{ type: string; invalidated: string }> = []

    const evaluator = new DefaultPolicyEvaluator({
      store,
      schemaRegistry,
      isOnline: () => online,
      onRevalidation: (event) => {
        revalidationEvents.push(event)
      },
      offlinePolicy: {
        revalidation: 'hybrid'
      }
    })

    const first = await evaluator.can({
      subject: bob.did,
      action: 'read',
      nodeId: task.id
    })
    expect(first.cached).toBe(false)

    const second = await evaluator.can({
      subject: bob.did,
      action: 'read',
      nodeId: task.id
    })
    expect(second.cached).toBe(true)

    online = false
    evaluator.handleConnectivityChange(false)

    online = true
    evaluator.handleConnectivityChange(true)

    expect(revalidationEvents).toHaveLength(1)
    expect(revalidationEvents[0]).toEqual(
      expect.objectContaining({
        type: 'hybrid-revalidation',
        invalidated: 'all'
      })
    )

    const afterReconnect = await evaluator.can({
      subject: bob.did,
      action: 'read',
      nodeId: task.id
    })
    expect(afterReconnect.cached).toBe(false)
  })
})

// ─── create/update refinements with write fallback (exploration 0304) ─────────

const ContributorDocSchema = defineSchema({
  name: 'AuthContributorDoc',
  namespace: 'xnet://tests/',
  properties: {
    title: text({ required: true }),
    editors: person({ multiple: true })
  },
  authorization: {
    roles: {
      owner: role.creator(),
      editor: role.property('editors')
    },
    actions: {
      read: allow('owner', 'editor'),
      // editors may add documents; only the author may modify them afterwards
      create: allow('editor'),
      update: allow('owner'),
      delete: allow('owner'),
      share: allow('owner')
    }
  }
})

const SplitWithWriteSchema = defineSchema({
  name: 'AuthSplitWithWrite',
  namespace: 'xnet://tests/',
  properties: {
    title: text({ required: true }),
    editors: person({ multiple: true }),
    admins: person({ multiple: true })
  },
  authorization: {
    roles: {
      owner: role.creator(),
      editor: role.property('editors'),
      admin: role.property('admins')
    },
    actions: {
      read: allow('owner', 'editor', 'admin'),
      // granular create ignores the write fallback entirely
      create: allow('admin'),
      write: allow('owner', 'editor', 'admin'),
      delete: allow('owner'),
      share: allow('owner')
    }
  }
})

describe('DefaultPolicyEvaluator create/update fallback (0304)', () => {
  it('create and update fall back to the write expression when absent', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const carol = createIdentity()
    const store = await createStore(alice)
    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(ProjectSchema)

    const project = await store.create({
      schemaId: ProjectSchema.schema['@id'],
      properties: { title: 'Fallback', admins: [bob.did] }
    })

    const evaluator = new DefaultPolicyEvaluator({ store, schemaRegistry })

    // ProjectSchema only declares write: allow('owner', 'admin') — the
    // refinements must behave byte-identically to a write check.
    for (const action of ['create', 'update', 'write'] as const) {
      expect(
        (await evaluator.can({ subject: bob.did, action, nodeId: project.id })).allowed,
        `admin ${action}`
      ).toBe(true)
      expect(
        (await evaluator.can({ subject: carol.did, action, nodeId: project.id })).allowed,
        `outsider ${action}`
      ).toBe(false)
    }
  })

  it('expresses contributor semantics: editors may create, only the owner may update', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const store = await createStore(alice)
    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(ContributorDocSchema)

    // Alice's existing doc lists bob as editor.
    const doc = await store.create({
      schemaId: ContributorDocSchema.schema['@id'],
      properties: { title: 'Owned by alice', editors: [bob.did] }
    })

    const evaluator = new DefaultPolicyEvaluator({ store, schemaRegistry })

    // Bob may create a NEW doc (draft node, createdBy = bob, bob in editors).
    const draftCreate = await evaluator.can({
      subject: bob.did,
      action: 'create',
      nodeId: 'draft-doc-1',
      node: {
        schemaId: ContributorDocSchema.schema['@id'],
        createdBy: bob.did,
        properties: { title: 'New from bob', editors: [bob.did] }
      }
    })
    expect(draftCreate.allowed).toBe(true)

    // Bob may NOT update alice's doc — update is owner-only, and the create
    // expression must not leak into update checks.
    expect(
      (await evaluator.can({ subject: bob.did, action: 'update', nodeId: doc.id })).allowed
    ).toBe(false)
    // Legacy write checks on an existing node follow the update rule.
    expect(
      (await evaluator.can({ subject: bob.did, action: 'write', nodeId: doc.id })).allowed
    ).toBe(false)
    // The owner still updates freely.
    expect(
      (await evaluator.can({ subject: alice.did, action: 'update', nodeId: doc.id })).allowed
    ).toBe(true)
  })

  it('a declared create expression wins over the write fallback', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const store = await createStore(alice)
    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(SplitWithWriteSchema)

    const node = await store.create({
      schemaId: SplitWithWriteSchema.schema['@id'],
      properties: { title: 'Split', editors: [bob.did], admins: [] }
    })

    const evaluator = new DefaultPolicyEvaluator({ store, schemaRegistry })

    // Editor bob is covered by write — update (fallback) allows him...
    expect(
      (await evaluator.can({ subject: bob.did, action: 'update', nodeId: node.id })).allowed
    ).toBe(true)
    // ...but create is declared as admin-only, so the write expression is
    // ignored for create checks — even for the owner.
    expect(
      (await evaluator.can({ subject: bob.did, action: 'create', nodeId: node.id })).allowed
    ).toBe(false)
    expect(
      (await evaluator.can({ subject: alice.did, action: 'create', nodeId: node.id })).allowed
    ).toBe(false)
  })

  it('grant satisfaction: write covers the refinements, granular grants stay narrow', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const carol = createIdentity()
    const store = await createStore(alice)
    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(ContributorDocSchema)

    const doc = await store.create({
      schemaId: ContributorDocSchema.schema['@id'],
      properties: { title: 'Granted', editors: [] }
    })

    // bob holds a coarse write grant; carol holds a create-only grant.
    await store.create({
      schemaId: GRANT_SCHEMA_ID,
      properties: {
        grantee: bob.did,
        resource: doc.id,
        actions: JSON.stringify(['write']),
        revokedAt: 0,
        expiresAt: Date.now() + 10_000
      }
    })
    await store.create({
      schemaId: GRANT_SCHEMA_ID,
      properties: {
        grantee: carol.did,
        resource: doc.id,
        actions: JSON.stringify(['create']),
        revokedAt: 0,
        expiresAt: Date.now() + 10_000
      }
    })

    const grantIndex = new GrantIndex(store)
    await grantIndex.initialize()
    const evaluator = new DefaultPolicyEvaluator({ store, schemaRegistry, grantIndex })

    // A write grant satisfies update checks on the node.
    expect(
      (await evaluator.can({ subject: bob.did, action: 'update', nodeId: doc.id })).allowed
    ).toBe(true)
    // A create-only grant does NOT satisfy update or legacy write checks.
    expect(
      (await evaluator.can({ subject: carol.did, action: 'update', nodeId: doc.id })).allowed
    ).toBe(false)
    expect(
      (await evaluator.can({ subject: carol.did, action: 'write', nodeId: doc.id })).allowed
    ).toBe(false)
    grantIndex.dispose()
  })

  it('field rules apply to update and create checks', async () => {
    const alice = createIdentity()
    const bob = createIdentity()
    const store = await createStore(alice)
    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(ProjectSchema)
    schemaRegistry.register(TaskSchema)

    const project = await store.create({
      schemaId: ProjectSchema.schema['@id'],
      properties: { title: 'FieldRules', admins: [bob.did] }
    })
    const task = await store.create({
      schemaId: TaskSchema.schema['@id'],
      properties: { title: 'Locked title', project: project.id }
    })

    const evaluator = new DefaultPolicyEvaluator({ store, schemaRegistry })

    // TaskSchema locks `title` to the owner via fieldRules. A projectAdmin
    // update patching title must be denied on the update action too.
    const denied = await evaluator.can({
      subject: bob.did,
      action: 'update',
      nodeId: task.id,
      patch: { title: 'Hijacked' }
    })
    expect(denied.allowed).toBe(false)
    expect(denied.reasons).toContain('DENY_FIELD_RESTRICTED')

    // Without the restricted field the same update is allowed.
    const allowed = await evaluator.can({
      subject: bob.did,
      action: 'update',
      nodeId: task.id,
      patch: { assignee: bob.did }
    })
    expect(allowed.allowed).toBe(true)
  })
})
