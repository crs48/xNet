import { describe, expect, it } from 'vitest'
import { toSchemaData } from './ai-schemas'

describe('toSchemaData', () => {
  it('flattens a defined schema into iri/name/properties-keyed-by-name', () => {
    const data = toSchemaData({
      schema: {
        '@id': 'xnet://xnet.fyi/Task',
        name: 'Task',
        properties: [{ name: 'title' }, { name: 'done' }]
      }
    })
    expect(data.iri).toBe('xnet://xnet.fyi/Task')
    expect(data.name).toBe('Task')
    expect(Object.keys(data.properties)).toEqual(['title', 'done'])
    expect(data.properties.title).toEqual({ name: 'title' })
  })

  it('handles a schema with no properties', () => {
    const data = toSchemaData({
      schema: { '@id': 'xnet://x/Empty', name: 'Empty', properties: [] }
    })
    expect(data.properties).toEqual({})
  })
})
