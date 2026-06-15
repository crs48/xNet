/**
 * Tests for createXNetClient — the framework-agnostic runtime.
 *
 * These run with no DOM and no React: a plain NodeStore + MemoryNodeStorageAdapter,
 * exercising the read / write / auth / crypto / lifecycle surface directly.
 */
import type { AuthCheckInput, AuthDecision, DID, PolicyEvaluator } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { defineSchema, MemoryNodeStorageAdapter, number, text } from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { afterEach, describe, expect, it } from 'vitest'
import { createXNetClient, type XNetClient } from './client'

const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://test/',
  properties: {
    title: text({ required: true }),
    priority: number({})
  }
})

function makeIdentity(): { authorDID: DID; signingKey: Uint8Array } {
  const keyPair = generateSigningKeyPair()
  return { authorDID: createDID(keyPair.publicKey) as DID, signingKey: keyPair.privateKey }
}

async function makeClient(
  overrides: Partial<Parameters<typeof createXNetClient>[0]> = {}
): Promise<XNetClient> {
  const { authorDID, signingKey } = makeIdentity()
  return createXNetClient({
    nodeStorage: new MemoryNodeStorageAdapter(),
    authorDID,
    signingKey,
    ...overrides
  })
}

let active: XNetClient | null = null
afterEach(async () => {
  await active?.destroy()
  active = null
})

describe('createXNetClient', () => {
  it('requires authorDID and signingKey', async () => {
    await expect(
      // @ts-expect-error — intentionally missing required fields
      createXNetClient({ nodeStorage: new MemoryNodeStorageAdapter() })
    ).rejects.toThrow(/authorDID and signingKey/)
  })

  it('constructs a ready, local-only client by default', async () => {
    active = await makeClient()
    expect(active.runtimeStatus.phase).toBe('ready')
    expect(active.runtimeStatus.bridgeMode).toBe('main-thread')
    expect(active.runtimeStatus.syncEnabled).toBe(false)
    expect(active.syncManager).toBeNull()
    expect(active.plugins).toBeNull()
    expect(active.undo).toBeNull()
  })

  it('round-trips create → fetch → update → delete', async () => {
    active = await makeClient()

    const created = await active.mutate.create(TaskSchema, { title: 'first', priority: 1 })
    expect(created.id).toBeTruthy()
    expect(created.properties.title).toBe('first')

    const afterCreate = await active.fetch(TaskSchema)
    expect(afterCreate).toHaveLength(1)
    expect(afterCreate[0].properties.title).toBe('first')

    await active.mutate.update(created.id, { title: 'renamed' })
    const fetched = await active.get(created.id)
    expect(fetched?.properties.title).toBe('renamed')

    await active.mutate.delete(created.id)
    const afterDelete = await active.fetch(TaskSchema)
    expect(afterDelete).toHaveLength(0)
  })

  it('drives a live query subscription on writes', async () => {
    active = await makeClient()

    const subscription = active.query(TaskSchema)
    let notifications = 0
    const unsubscribe = subscription.subscribe(() => {
      notifications += 1
    })

    await active.mutate.create(TaskSchema, { title: 'live' })
    // let the optimistic apply + cache notify flush
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(notifications).toBeGreaterThan(0)
    const snapshot = subscription.getSnapshot()
    expect(snapshot?.some((n) => n.properties.title === 'live')).toBe(true)
    unsubscribe()
  })

  it('signs and verifies with the client key', async () => {
    active = await makeClient()
    const message = new TextEncoder().encode('hello xnet')
    const signature = active.sign(message)
    expect(active.verify(message, signature)).toBe(true)
    expect(active.verify(new TextEncoder().encode('tampered'), signature)).toBe(false)
  })

  it('is permissive when no auth evaluator is configured', async () => {
    active = await makeClient()
    const decision = await active.can({
      subject: active.authorDID,
      action: 'write',
      nodeId: 'node-1'
    })
    expect(decision.allowed).toBe(true)
    expect(active.auth).toBeNull()
  })

  it('delegates can() to a configured auth evaluator', async () => {
    const evaluator: PolicyEvaluator = {
      can: async (input: AuthCheckInput): Promise<AuthDecision> => ({
        allowed: input.action === 'read',
        action: input.action,
        subject: input.subject,
        resource: input.nodeId,
        roles: [],
        grants: [],
        reasons: [],
        cached: false,
        evaluatedAt: 0,
        duration: 0
      }),
      explain: async () => {
        throw new Error('not used')
      },
      invalidate: () => {},
      invalidateSubject: () => {}
    }
    active = await makeClient({ authEvaluator: evaluator })

    const read = await active.can({ subject: active.authorDID, action: 'read', nodeId: 'n' })
    const write = await active.can({ subject: active.authorDID, action: 'write', nodeId: 'n' })
    expect(read.allowed).toBe(true)
    expect(write.allowed).toBe(false)
  })

  it('wires optional plugins and undo when requested', async () => {
    active = await makeClient({ plugins: { platform: 'web' }, undo: {} })
    expect(active.plugins).not.toBeNull()
    expect(active.undo).not.toBeNull()
  })

  it('destroy() is idempotent and flips runtime status', async () => {
    const client = await makeClient()
    expect(client.runtimeStatus.phase).toBe('ready')
    await client.destroy()
    expect(client.runtimeStatus.phase).toBe('destroyed')
    // second destroy is a no-op, not a throw
    await expect(client.destroy()).resolves.toBeUndefined()
  })
})
