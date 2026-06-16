import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import { loadExtensionFields } from '../schema/extension-resolver'
import { schemaExtensionId } from '../schema/schemas/schema-extension'
import {
  ensureSchemaExtension,
  createExtensionField,
  deleteExtensionField
} from './extension-field-operations'

const CONTACT = 'xnet://xnet.fyi/Contact@1.0.0'

function createTestStore(): NodeStore {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  return new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: did,
    signingKey: keyPair.privateKey
  })
}

describe('extension field operations', () => {
  let store: NodeStore

  beforeEach(() => {
    store = createTestStore()
  })

  it('ensureSchemaExtension upserts on the deterministic id', async () => {
    const a = await ensureSchemaExtension(store, { targetSchema: CONTACT, authority: 'acme.com' })
    const b = await ensureSchemaExtension(store, { targetSchema: CONTACT, authority: 'acme.com' })
    expect(a).toBe(b)
    expect(a).toBe(schemaExtensionId('acme.com', CONTACT))
  })

  it('createExtensionField returns the overlay key and persists an ordered field', async () => {
    const { key } = await createExtensionField(store, {
      targetSchema: CONTACT,
      authority: 'acme.com',
      name: 'leadScore',
      type: 'number',
      config: { min: 0, max: 100 }
    })
    expect(key).toBe('ext:acme.com/leadScore')

    const fields = await loadExtensionFields(store, CONTACT)
    expect(fields).toEqual([
      { authority: 'acme.com', name: 'leadScore', type: 'number', config: { min: 0, max: 100 } }
    ])
  })

  it('adds multiple fields in stable sortKey order', async () => {
    await createExtensionField(store, { targetSchema: CONTACT, authority: 'acme.com', name: 'a', type: 'text' })
    await createExtensionField(store, { targetSchema: CONTACT, authority: 'acme.com', name: 'b', type: 'text' })
    await createExtensionField(store, { targetSchema: CONTACT, authority: 'acme.com', name: 'c', type: 'text' })
    const fields = await loadExtensionFields(store, CONTACT)
    expect(fields.map((f) => f.name)).toEqual(['a', 'b', 'c'])
  })

  it('rejects invalid field types and field names', async () => {
    await expect(
      createExtensionField(store, { targetSchema: CONTACT, authority: 'acme.com', name: 'x', type: 'bogus' })
    ).rejects.toThrow(/Invalid field type/)
    await expect(
      createExtensionField(store, { targetSchema: CONTACT, authority: 'acme.com', name: 'has/slash', type: 'text' })
    ).rejects.toThrow()
  })

  it('deleteExtensionField removes it from the resolved set', async () => {
    const { fieldId } = await createExtensionField(store, {
      targetSchema: CONTACT,
      authority: 'acme.com',
      name: 'temp',
      type: 'text'
    })
    expect(await loadExtensionFields(store, CONTACT)).toHaveLength(1)
    await deleteExtensionField(store, fieldId)
    expect(await loadExtensionFields(store, CONTACT)).toHaveLength(0)
  })
})
