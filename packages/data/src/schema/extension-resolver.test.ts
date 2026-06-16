import type { SchemaIRI } from './node'
import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import { extKey } from './extension'
import { loadExtensionFields, resolveEffectiveSchema } from './extension-resolver'
import { schemaRegistry } from './registry'
import {
  SchemaExtensionSchema,
  ExtensionFieldSchema,
  schemaExtensionId
} from './schemas/schema-extension'

const CONTACT_IRI = 'xnet://xnet.fyi/Contact@1.0.0' as SchemaIRI

function createTestStore(): NodeStore {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  return new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: did,
    signingKey: keyPair.privateKey
  })
}

async function declareExtension(
  store: NodeStore,
  authority: string,
  target: string,
  fields: Array<{ name: string; type: string; sortKey: string; config?: Record<string, unknown> }>
): Promise<string> {
  const ext = await store.create({
    id: schemaExtensionId(authority, target),
    schemaId: SchemaExtensionSchema.schema['@id'],
    properties: { targetSchema: target, authority, label: `${authority} fields` }
  })
  for (const field of fields) {
    await store.create({
      schemaId: ExtensionFieldSchema.schema['@id'],
      properties: { extension: ext.id, ...field }
    })
  }
  return ext.id
}

describe('extension-resolver', () => {
  let store: NodeStore

  beforeEach(() => {
    store = createTestStore()
  })

  it('loads extension fields for a target schema, ordered by sortKey', async () => {
    await declareExtension(store, 'acme.com', CONTACT_IRI, [
      { name: 'nextTouch', type: 'date', sortKey: 'b0' },
      { name: 'leadScore', type: 'number', sortKey: 'a0', config: { min: 0 } }
    ])

    const fields = await loadExtensionFields(store, CONTACT_IRI)
    expect(fields.map((f) => f.name)).toEqual(['leadScore', 'nextTouch']) // sorted
    expect(fields[0]).toMatchObject({ authority: 'acme.com', type: 'number', config: { min: 0 } })
  })

  it('matches extensions declared against the unversioned base IRI', async () => {
    await declareExtension(store, 'acme.com', 'xnet://xnet.fyi/Contact', [
      { name: 'leadScore', type: 'number', sortKey: 'a0' }
    ])
    const fields = await loadExtensionFields(store, CONTACT_IRI)
    expect(fields).toHaveLength(1)
  })

  it('composes an effective schema = core (locked) + ext fields', async () => {
    // Register a tiny core schema in the registry for the test.
    const registry = {
      get: async () => ({
        schema: {
          '@id': CONTACT_IRI,
          '@type': 'xnet://xnet.fyi/Schema' as const,
          name: 'Contact',
          namespace: 'xnet://xnet.fyi/',
          version: '1.0.0',
          properties: [{ '@id': '#name', name: 'name', type: 'text' as const, required: true }]
        }
      })
    }
    await declareExtension(store, 'acme.com', CONTACT_IRI, [
      { name: 'leadScore', type: 'number', sortKey: 'a0' }
    ])

    const effective = await resolveEffectiveSchema({ store, registry, schemaId: CONTACT_IRI })
    expect(effective?.properties.map((p) => p.name)).toEqual(['name', 'ext:acme.com/leadScore'])
    expect(effective?.properties.find((p) => p.name === 'name')?.readonly).toBe(true)
  })

  it('returns null when the core schema is unresolvable', async () => {
    const registry = { get: async () => undefined }
    const effective = await resolveEffectiveSchema({
      store,
      registry,
      schemaId: 'xnet://xnet.fyi/DoesNotExist@1.0.0'
    })
    expect(effective).toBeNull()
  })

  it('built-in schemas resolve through the real registry with extensions layered', async () => {
    await declareExtension(store, 'acme.com', CONTACT_IRI, [
      { name: 'leadScore', type: 'number', sortKey: 'a0' }
    ])
    const effective = await resolveEffectiveSchema({
      store,
      registry: schemaRegistry,
      schemaId: 'xnet://xnet.fyi/Task@1.0.0'
    })
    // Task has no extensions declared (we declared Contact's), so it is the
    // canonical core schema, unchanged — proving built-ins flow through.
    expect(effective?.name).toBe('Task')
    expect(effective?.properties.some((p) => p.readonly)).toBe(false)
  })
})

describe('overlay values on nodes', () => {
  it('persist as ordinary node properties (no schema change needed)', async () => {
    const store = createTestStore()
    const key = extKey('acme.com', 'leadScore')
    const node = await store.create({
      schemaId: 'xnet://xnet.fyi/Task@1.0.0',
      properties: { title: 'Call Ada', [key]: 87 }
    })
    const fetched = await store.get(node.id)
    expect(fetched?.properties[key]).toBe(87)

    await store.update(node.id, { properties: { [key]: 95 } })
    const updated = await store.get(node.id)
    expect(updated?.properties[key]).toBe(95)
  })

  it('are filterable through the standard where path (query pushdown)', async () => {
    const store = createTestStore()
    const key = extKey('acme.com', 'leadScore')
    await store.create({
      schemaId: 'xnet://xnet.fyi/Task@1.0.0',
      properties: { title: 'Hot lead', [key]: 90 }
    })
    await store.create({
      schemaId: 'xnet://xnet.fyi/Task@1.0.0',
      properties: { title: 'Cold lead', [key]: 10 }
    })

    const result = await store.query({
      schemaId: 'xnet://xnet.fyi/Task@1.0.0',
      where: { [key]: 90 },
      includeDeleted: false
    })
    expect(result.nodes.map((n) => n.properties.title)).toEqual(['Hot lead'])
  })
})
