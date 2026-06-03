import type { DID, NodeState, PropertyBuilder, Schema, SystemSchemaIndexStore } from '@xnetjs/data'
import { bytesToBase64, generateSigningKeyPair, sign } from '@xnetjs/crypto'
import {
  SchemaDefinitionSchema,
  computeSchemaDefinitionContentHash,
  createSchemaDefinitionSigningPayload,
  defineSchema,
  text
} from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { createSchemaDiscovery } from './discovery'

type TestDiscoveryStore = SystemSchemaIndexStore & {
  nodes: NodeState[]
  listener: Parameters<SystemSchemaIndexStore['subscribe']>[0] | null
}

const createTestStore = (nodes: NodeState[]): TestDiscoveryStore => ({
  nodes,
  listener: null,
  async list(options) {
    return options?.includeDeleted ? this.nodes : this.nodes.filter((node) => !node.deleted)
  },
  subscribe(listener) {
    this.listener = listener
    return () => {
      this.listener = null
    }
  }
})

const createRemoteSchemaFixture = (
  name: string,
  version: string,
  properties: Record<string, PropertyBuilder>
) => {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  const schema = defineSchema({
    name,
    namespace: `xnet://${did}/`,
    version,
    properties
  })

  return {
    schema,
    node: createSchemaDefinitionNode(schema.schema, did, keyPair.privateKey)
  }
}

const createSchemaDefinitionNode = (
  definition: Schema,
  did: DID,
  signingKey: Uint8Array,
  createdAt = 1710000000000
): NodeState => {
  const schemaIri = definition['@id']
  const definitionBytes = JSON.stringify(definition)
  const contentHash = computeSchemaDefinitionContentHash(definitionBytes)
  const signature = bytesToBase64(
    sign(
      createSchemaDefinitionSigningPayload({
        schemaIri,
        version: definition.version,
        authority: did,
        contentHash,
        publishedAt: createdAt,
        status: 'published'
      }),
      signingKey
    )
  )

  return {
    id: `schema-${definition.name}-${definition.version}`,
    schemaId: SchemaDefinitionSchema.schema['@id'],
    properties: {
      schemaIri,
      version: definition.version,
      authority: did,
      definitionBytes,
      contentHash,
      publishedAt: createdAt,
      status: 'published',
      signature,
      signingKeyId: `${did}#ed25519`
    },
    timestamps: {},
    deleted: false,
    createdAt,
    createdBy: did,
    updatedAt: createdAt,
    updatedBy: did
  }
}

describe('createSchemaDiscovery', () => {
  it('resolves schema definitions from the node graph through a registry', async () => {
    const { schema, node } = createRemoteSchemaFixture('SdkRemote', '1.0.0', {
      title: text({ required: true })
    })
    const discovery = await createSchemaDiscovery({
      store: createTestStore([node])
    })

    const resolved = await discovery.resolveSchema(schema.schema['@id'])

    expect(resolved?.schema['@id']).toBe(schema.schema['@id'])
    expect(discovery.listSchemas().map((record) => record.schemaIri)).toContain(
      schema.schema['@id']
    )
    expect(discovery.getDiagnostics()).toHaveLength(0)

    discovery.dispose()
  })

  it('surfaces diagnostics for invalid schema definitions', async () => {
    const { schema, node } = createRemoteSchemaFixture('SdkInvalidRemote', '1.0.0', {
      title: text({ required: true })
    })
    node.properties.contentHash =
      'cid:blake3:0000000000000000000000000000000000000000000000000000000000000000'

    const discovery = await createSchemaDiscovery({
      store: createTestStore([node])
    })

    await expect(discovery.resolveSchema(schema.schema['@id'])).resolves.toBeUndefined()
    expect(discovery.listSchemas()).toEqual([])
    expect(discovery.getDiagnostics()[0].result.errors.map((error) => error.path)).toContain(
      'contentHash'
    )

    discovery.dispose()
  })
})
