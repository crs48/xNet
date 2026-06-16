import { describe, it, expect } from 'vitest'
import { schemaRegistry } from '../registry'
import {
  SchemaExtensionSchema,
  ExtensionFieldSchema,
  SCHEMA_EXTENSION_SCHEMA_IRI,
  EXTENSION_FIELD_SCHEMA_IRI,
  schemaExtensionId
} from './schema-extension'

const DID = 'did:key:z6MkExampleAuthor'

describe('SchemaExtension / ExtensionField schemas', () => {
  it('have the expected canonical IRIs', () => {
    expect(SchemaExtensionSchema.schema['@id']).toBe(SCHEMA_EXTENSION_SCHEMA_IRI)
    expect(ExtensionFieldSchema.schema['@id']).toBe(EXTENSION_FIELD_SCHEMA_IRI)
  })

  it('create valid SchemaExtension nodes', () => {
    const ext = SchemaExtensionSchema.create(
      {
        targetSchema: 'xnet://xnet.fyi/Contact@1.0.0',
        authority: 'acme.com',
        label: 'Acme CRM fields'
      },
      { createdBy: DID, id: schemaExtensionId('acme.com', 'xnet://xnet.fyi/Contact@1.0.0') }
    )
    expect(SchemaExtensionSchema.validate(ext).valid).toBe(true)
    expect(ext.id).toBe('schemaext:acme.com:xnet://xnet.fyi/Contact@1.0.0')
  })

  it('create valid ExtensionField nodes', () => {
    const field = ExtensionFieldSchema.create(
      {
        extension: 'schemaext:acme.com:xnet://xnet.fyi/Contact@1.0.0',
        name: 'leadScore',
        type: 'number',
        config: { min: 0, max: 100 },
        sortKey: 'a0'
      },
      { createdBy: DID }
    )
    expect(ExtensionFieldSchema.validate(field).valid).toBe(true)
    expect(field.name).toBe('leadScore')
  })

  it('are resolvable through the global registry (registered as built-ins)', async () => {
    const ext = await schemaRegistry.get(SCHEMA_EXTENSION_SCHEMA_IRI)
    const field = await schemaRegistry.get(EXTENSION_FIELD_SCHEMA_IRI)
    expect(ext?.schema.name).toBe('SchemaExtension')
    expect(field?.schema.name).toBe('ExtensionField')
  })
})
