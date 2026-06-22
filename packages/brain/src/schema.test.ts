import { describe, expect, it } from 'vitest'
import { relationFieldsResolver, schemaRelationFields, type SchemaLike } from './schema'

const deal: SchemaLike = {
  schema: {
    '@id': 'xnet://xnet.fyi/Deal@1.0.0',
    properties: [
      { name: 'name', type: 'text' },
      { name: 'contact', type: 'relation' },
      { name: 'items', type: 'relation' },
      { name: 'amount', type: 'number' }
    ]
  }
}

const page: SchemaLike = {
  schema: { '@id': 'xnet://xnet.fyi/Page@1.0.0', properties: [{ name: 'title', type: 'text' }] }
}

describe('schemaRelationFields', () => {
  it('returns only the relation-typed property names', () => {
    expect(schemaRelationFields(deal)).toEqual(['contact', 'items'])
  })

  it('returns empty when there are no relations', () => {
    expect(schemaRelationFields(page)).toEqual([])
  })
})

describe('relationFieldsResolver', () => {
  it('resolves relation fields per schema id', () => {
    const resolve = relationFieldsResolver([deal, page])
    expect(resolve('xnet://xnet.fyi/Deal@1.0.0')).toEqual(['contact', 'items'])
    expect(resolve('xnet://xnet.fyi/Page@1.0.0')).toEqual([])
  })

  it('returns empty for unknown schemas', () => {
    const resolve = relationFieldsResolver([deal])
    expect(resolve('xnet://xnet.fyi/Unknown@1.0.0')).toEqual([])
  })
})
