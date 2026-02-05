import { describe, it, expect, vi } from 'vitest'
import { defineSchema } from './define'
import { relation, text } from './properties'
import { SchemaRegistry } from './registry'

describe('SchemaRegistry remote resolver', () => {
  it('loads remote schema and caches it', async () => {
    const registry = new SchemaRegistry()
    const RemoteSchema = defineSchema({
      name: 'Remote',
      namespace: 'xnet://did:key:z6MkRemote/',
      properties: {
        title: text({ required: true }),
        parent: relation({})
      }
    })

    const resolver = vi.fn().mockResolvedValue(RemoteSchema.schema)
    registry.setRemoteResolver(resolver)

    const first = await registry.get(RemoteSchema.schema['@id'])
    expect(first?.schema['@id']).toBe(RemoteSchema.schema['@id'])
    expect(resolver).toHaveBeenCalledTimes(1)

    const second = await registry.get(RemoteSchema.schema['@id'])
    expect(second?.schema['@id']).toBe(RemoteSchema.schema['@id'])
    expect(resolver).toHaveBeenCalledTimes(1)
  })
})
