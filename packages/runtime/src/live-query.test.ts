/**
 * Tests for liveQuery — the Svelte-store-compatible reactive adapter.
 */
import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { defineSchema, MemoryNodeStorageAdapter, text } from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { afterEach, describe, expect, it } from 'vitest'
import { createXNetClient, type XNetClient } from './client'
import { liveQuery } from './live-query'

const TodoSchema = defineSchema({
  name: 'Todo',
  namespace: 'xnet://live-test/',
  properties: { label: text({ required: true }) }
})

let client: XNetClient | null = null
afterEach(async () => {
  await client?.destroy()
  client = null
})

async function makeClient(): Promise<XNetClient> {
  const keyPair = generateSigningKeyPair()
  return createXNetClient({
    nodeStorage: new MemoryNodeStorageAdapter(),
    authorDID: createDID(keyPair.publicKey) as DID,
    signingKey: keyPair.privateKey
  })
}

describe('liveQuery', () => {
  it('follows the Svelte store contract: immediate value then updates', async () => {
    client = await makeClient()
    const todos = liveQuery(client, TodoSchema)

    const values: (number | null)[] = []
    const unsubscribe = todos.subscribe((rows) => {
      values.push(rows === null ? null : rows.length)
    })

    // First call is synchronous (Svelte contract).
    expect(values.length).toBe(1)

    await client.mutate.create(TodoSchema, { label: 'a' })
    await client.mutate.create(TodoSchema, { label: 'b' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(values.at(-1)).toBe(2)
    expect(todos.get()?.length).toBe(2)

    unsubscribe()
    todos.destroy()
  })

  it('stops delivering after unsubscribe', async () => {
    client = await makeClient()
    const todos = liveQuery(client, TodoSchema)

    let calls = 0
    const unsubscribe = todos.subscribe(() => {
      calls += 1
    })
    const afterFirst = calls // 1 (immediate)
    unsubscribe()

    await client.mutate.create(TodoSchema, { label: 'ignored' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(calls).toBe(afterFirst)
    todos.destroy()
  })
})
