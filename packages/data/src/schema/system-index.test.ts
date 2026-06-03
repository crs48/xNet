import type { DID, SchemaIRI } from './node'
import type { PropertyBuilder, Schema } from './types'
import type { NodeChangeEvent, NodeState } from '../store/types'
import { bytesToBase64, generateSigningKeyPair, sign } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { defineSchema } from './define'
import { text } from './properties'
import { SchemaRegistry } from './registry'
import {
  SchemaDefinitionSchema,
  computeSchemaDefinitionContentHash,
  createSchemaDefinitionSigningPayload
} from './schemas/system'
import { SystemSchemaIndex, createNodeGraphSchemaResolver } from './system-index'

type TestSystemStore = {
  nodes: NodeState[]
  listener: ((event: NodeChangeEvent) => void) | null
  list(options?: { includeDeleted?: boolean }): Promise<NodeState[]>
  subscribe(listener: (event: NodeChangeEvent) => void): () => void
}

const createTestStore = (nodes: NodeState[]): TestSystemStore => ({
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

describe('SystemSchemaIndex', () => {
  it('resolves published SchemaDefinition nodes by exact and base IRI', async () => {
    const { schema: RemoteSchemaV1, node: nodeV1 } = createRemoteSchemaFixture('Remote', '1.0.0', {
      title: text({ required: true })
    })
    const { schema: RemoteSchemaV2, node: nodeV2 } = createRemoteSchemaFixture('Remote', '2.0.0', {
      title: text({ required: true }),
      summary: text({})
    })
    const store = createTestStore([nodeV1, nodeV2])
    const index = new SystemSchemaIndex(store)

    await index.initialize()

    expect(index.resolve(RemoteSchemaV1.schema['@id'])?.version).toBe('1.0.0')
    expect(
      index.resolve(RemoteSchemaV2.schema['@id'].replace('@2.0.0', '') as SchemaIRI)?.version
    ).toBe('2.0.0')
    expect(index.getDiagnostics()).toHaveLength(0)
  })

  it('backs SchemaRegistry remote resolution from the node graph', async () => {
    const { schema: RemoteSchema, node } = createRemoteSchemaFixture('RemoteRegistry', '1.0.0', {
      title: text({ required: true })
    })
    const store = createTestStore([node])
    const index = new SystemSchemaIndex(store)
    const registry = new SchemaRegistry()

    await index.initialize()
    registry.setRemoteResolver(createNodeGraphSchemaResolver(index))

    const resolved = await registry.get(RemoteSchema.schema['@id'])

    expect(resolved?.schema['@id']).toBe(RemoteSchema.schema['@id'])
  })

  it('records diagnostics and skips invalid SchemaDefinition nodes', async () => {
    const { schema: RemoteSchema, node: invalid } = createRemoteSchemaFixture(
      'InvalidRemote',
      '1.0.0',
      {
        title: text({ required: true })
      }
    )
    invalid.properties.contentHash =
      'cid:blake3:0000000000000000000000000000000000000000000000000000000000000000'
    const store = createTestStore([invalid])
    const index = new SystemSchemaIndex(store)

    await index.initialize()

    expect(index.resolve(RemoteSchema.schema['@id'])).toBeNull()
    expect(index.getDiagnostics()).toHaveLength(1)
    expect(index.getDiagnostics()[0].result.errors.map((error) => error.path)).toContain(
      'contentHash'
    )
  })
})
