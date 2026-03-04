import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { defineSchema } from '../schema/define'
import { person, text } from '../schema/properties'
import { SchemaRegistry } from '../schema/registry'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import { allow, role } from './builders'
import { DecisionCache, DefaultPolicyEvaluator } from './evaluator'

const PerfSchema = defineSchema({
  name: 'AuthPerformanceTask',
  namespace: 'xnet://perf/',
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

function createIdentity(): { did: DID; privateKey: Uint8Array } {
  const keyPair = generateSigningKeyPair()
  return {
    did: createDID(keyPair.publicKey) as DID,
    privateKey: keyPair.privateKey
  }
}

function p50(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted[mid] ?? 0
}

describe('auth performance budgets', () => {
  it('meets can() warm and cold p50 latency targets', async () => {
    const owner = createIdentity()
    const assignee = createIdentity()

    const store = new NodeStore({
      storage: new MemoryNodeStorageAdapter(),
      authorDID: owner.did,
      signingKey: owner.privateKey
    })
    await store.initialize()

    const node = await store.create({
      schemaId: PerfSchema.schema['@id'],
      properties: {
        title: 'Perf',
        assignee: assignee.did
      }
    })

    const schemaRegistry = new SchemaRegistry()
    schemaRegistry.register(PerfSchema)

    const cache = new DecisionCache({ ttlMs: 60_000 })
    const evaluator = new DefaultPolicyEvaluator({
      store,
      schemaRegistry,
      cache
    })

    const iterations = 100
    const coldDurations: number[] = []
    const warmDurations: number[] = []

    for (let i = 0; i < iterations; i++) {
      cache.clear()
      const coldStart = performance.now()
      await evaluator.can({
        subject: assignee.did,
        action: 'write',
        nodeId: node.id
      })
      coldDurations.push(performance.now() - coldStart)

      const warmStart = performance.now()
      await evaluator.can({
        subject: assignee.did,
        action: 'write',
        nodeId: node.id
      })
      warmDurations.push(performance.now() - warmStart)
    }

    expect(p50(coldDurations)).toBeLessThan(10)
    expect(p50(warmDurations)).toBeLessThan(1)
  })
})
