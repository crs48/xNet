import type { DID, SchemaIRI } from '../node'
import { bytesToBase64, generateSigningKeyPair, sign } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import {
  PresenceSummarySchema,
  SchemaCompatibilitySchema,
  SchemaDefinitionSchema,
  SyncPolicySchema,
  buildSystemNamespace,
  buildSystemNodeId,
  computeSchemaDefinitionContentHash,
  createSchemaDefinitionSigningPayload,
  isSystemNamespaceResource,
  isSystemSchemaIri,
  parseSystemNamespaceResource,
  resolveSchemaAuthority,
  validateSchemaDefinitionNode
} from './system'
import { builtInSchemas } from './index'

const createSignedSchemaDefinition = () => {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  const schemaIri = `xnet://${did}/Recipe@1.0.0` as SchemaIRI
  const definition = {
    '@id': schemaIri,
    '@type': 'xnet://xnet.fyi/Schema',
    name: 'Recipe',
    namespace: `xnet://${did}/`,
    version: '1.0.0',
    properties: [
      {
        '@id': `${schemaIri}#title`,
        name: 'title',
        type: 'text',
        required: true
      }
    ]
  }
  const definitionBytes = JSON.stringify(definition)
  const contentHash = computeSchemaDefinitionContentHash(definitionBytes)
  const publishedAt = 1710000000000
  const status = 'published'
  const payload = createSchemaDefinitionSigningPayload({
    schemaIri,
    version: '1.0.0',
    authority: did,
    contentHash,
    publishedAt,
    status
  })
  const signature = bytesToBase64(sign(payload, keyPair.privateKey))
  const node = SchemaDefinitionSchema.create(
    {
      schemaIri,
      version: '1.0.0',
      authority: did,
      definitionBytes,
      contentHash,
      publishedAt,
      status,
      signature,
      signingKeyId: `${did}#ed25519`
    },
    { createdBy: did, createdAt: publishedAt }
  )

  return { did, keyPair, node, schemaIri }
}

describe('system schemas', () => {
  it('registers system control-plane schemas as built-ins', () => {
    expect(SchemaDefinitionSchema.schema['@id']).toBe('xnet://xnet.fyi/SchemaDefinition@1.0.0')
    expect(SchemaCompatibilitySchema.schema['@id']).toBe(
      'xnet://xnet.fyi/SchemaCompatibility@1.0.0'
    )
    expect(SyncPolicySchema.schema['@id']).toBe('xnet://xnet.fyi/SyncPolicy@1.0.0')
    expect(PresenceSummarySchema.schema['@id']).toBe('xnet://xnet.fyi/PresenceSummary@1.0.0')
    expect(builtInSchemas).toHaveProperty('xnet://xnet.fyi/SchemaDefinition@1.0.0')
    expect(builtInSchemas).toHaveProperty('xnet://xnet.fyi/PresenceSummary')
  })

  it('parses and builds reserved sys namespace resources', () => {
    const { did } = createSignedSchemaDefinition()
    const namespace = buildSystemNamespace(did, 'schema')
    const nodeId = buildSystemNodeId(did, 'schema', '/Recipe@1.0.0')
    const parsed = parseSystemNamespaceResource(nodeId)

    expect(namespace).toBe(`xnet://${did}/sys/schema/`)
    expect(nodeId).toBe(`xnet://${did}/sys/schema/Recipe@1.0.0`)
    expect(parsed).toEqual({
      subjectDid: did,
      kind: 'schema',
      namespace,
      localId: 'Recipe@1.0.0'
    })
    expect(isSystemNamespaceResource(nodeId)).toBe(true)
    expect(isSystemNamespaceResource(`xnet://${did}/user/page/1`)).toBe(false)
  })

  it('identifies system schema IRIs', () => {
    expect(isSystemSchemaIri(SchemaDefinitionSchema.schema['@id'])).toBe(true)
    expect(isSystemSchemaIri('xnet://xnet.fyi/Grant')).toBe(true)
    expect(isSystemSchemaIri('xnet://xnet.fyi/Page@1.0.0')).toBe(false)
  })

  it('validates a signed DID-authority SchemaDefinition node', () => {
    const { node } = createSignedSchemaDefinition()

    const result = validateSchemaDefinitionNode(node)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects SchemaDefinition nodes with mismatched content hashes', () => {
    const { node } = createSignedSchemaDefinition()

    const result = validateSchemaDefinitionNode({
      ...node,
      contentHash: 'cid:blake3:0000000000000000000000000000000000000000000000000000000000000000'
    })

    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.path)).toContain('contentHash')
  })

  it('rejects SchemaDefinition nodes signed by the wrong key', () => {
    const { node } = createSignedSchemaDefinition()
    const wrongKeyPair = generateSigningKeyPair()
    const signature = bytesToBase64(
      sign(
        createSchemaDefinitionSigningPayload({
          schemaIri: node.schemaIri ?? '',
          version: node.version ?? '',
          authority: node.authority ?? '',
          contentHash: node.contentHash ?? '',
          publishedAt: node.publishedAt ?? 0,
          status: node.status ?? 'draft'
        }),
        wrongKeyPair.privateKey
      )
    )

    const result = validateSchemaDefinitionNode({ ...node, signature })

    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.path)).toContain('signature')
  })

  it('requires DID authority publishers to match the schema authority', () => {
    const { did, schemaIri } = createSignedSchemaDefinition()
    const otherDid = createDID(generateSigningKeyPair().publicKey) as DID

    const result = resolveSchemaAuthority({
      schemaIri,
      authority: did,
      publisherDid: otherDid
    })

    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.path)).toContain('publisherDid')
  })

  it('requires explicit linkage for domain authority schemas', () => {
    const blocked = resolveSchemaAuthority({
      schemaIri: 'xnet://example.com/Recipe@1.0.0',
      authority: 'example.com'
    })
    const allowed = resolveSchemaAuthority({
      schemaIri: 'xnet://example.com/Recipe@1.0.0',
      authority: 'example.com',
      allowDomainAuthority: true,
      domainLinkageProof: 'https://example.com/.well-known/xnet-schema-authority.json'
    })

    expect(blocked.valid).toBe(false)
    expect(blocked.kind).toBe('domain')
    expect(allowed.valid).toBe(true)
  })
})
