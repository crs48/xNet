import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { bench, describe } from 'vitest'
import { defineSchema } from '../schema/define'
import { person, text } from '../schema/properties'
import { SchemaRegistry } from '../schema/registry'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import { allow, role } from './builders'
import { DecisionCache, DefaultPolicyEvaluator } from './evaluator'
import { GrantIndex } from './grants'

const BenchSchema = defineSchema({
  name: 'AuthBenchTask',
  namespace: 'xnet://bench/',
  properties: {
    title: text({ required: true }),
    assignee: person()
  },
  authorization: {
    roles: {
      owner: role.creator(),
      assignee: role.property('assignee')
    },
    actions: {
      read: allow('owner', 'assignee'),
      write: allow('owner', 'assignee'),
      delete: allow('owner'),
      share: allow('owner')
    }
  }
})

type Identity = { did: DID; privateKey: Uint8Array }

function createIdentity(): Identity {
  const keyPair = generateSigningKeyPair()
  return {
    did: createDID(keyPair.publicKey) as DID,
    privateKey: keyPair.privateKey
  }
}

async function setup() {
  const owner = createIdentity()
  const assignee = createIdentity()

  const store = new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: owner.did,
    signingKey: owner.privateKey
  })
  await store.initialize()

  const node = await store.create({
    schemaId: BenchSchema.schema['@id'],
    properties: {
      title: 'Bench task',
      assignee: assignee.did
    }
  })

  const schemaRegistry = new SchemaRegistry()
  schemaRegistry.register(BenchSchema)

  const grantIndex = new GrantIndex(store)
  await grantIndex.initialize()

  const cache = new DecisionCache({ ttlMs: 60_000, maxSize: 10_000 })
  const evaluator = new DefaultPolicyEvaluator({
    store,
    schemaRegistry,
    grantIndex,
    cache
  })

  return { evaluator, assignee, node, cache }
}

describe('auth evaluator benchmarks', async () => {
  const context = await setup()

  bench('can() cold', async () => {
    context.cache.clear()
    await context.evaluator.can({
      subject: context.assignee.did,
      action: 'write',
      nodeId: context.node.id
    })
  })

  bench('can() warm', async () => {
    await context.evaluator.can({
      subject: context.assignee.did,
      action: 'write',
      nodeId: context.node.id
    })
  })
})
