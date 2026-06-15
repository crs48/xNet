/**
 * Umbrella test: the framework-agnostic runtime client is reachable and
 * functional through `@xnetjs/sdk` (exploration 0185, Option A2 — sdk is the
 * friendly umbrella over @xnetjs/runtime).
 */
import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { defineSchema, MemoryNodeStorageAdapter, text } from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { createXNetClient } from './index'

const NoteSchema = defineSchema({
  name: 'Note',
  namespace: 'xnet://sdk-test/',
  properties: { body: text({ required: true }) }
})

describe('@xnetjs/sdk → createXNetClient (umbrella)', () => {
  it('constructs a runtime client and round-trips a write', async () => {
    const keyPair = generateSigningKeyPair()
    const client = await createXNetClient({
      nodeStorage: new MemoryNodeStorageAdapter(),
      authorDID: createDID(keyPair.publicKey) as DID,
      signingKey: keyPair.privateKey
    })

    try {
      await client.mutate.create(NoteSchema, { body: 'from the sdk umbrella' })
      const notes = await client.fetch(NoteSchema)
      expect(notes).toHaveLength(1)
      expect(notes[0].properties.body).toBe('from the sdk umbrella')
    } finally {
      await client.destroy()
    }
  })
})
