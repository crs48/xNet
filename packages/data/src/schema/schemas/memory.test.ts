import { describe, expect, it } from 'vitest'
import { getAuthMode } from '../../auth'
import { MEMORY_ITEM_SCHEMA_IRI, MEMORY_KINDS, MemoryItemSchema } from './memory'

describe('memory schema pack (exploration 0211)', () => {
  it('has a canonical versioned IRI matching the constant', () => {
    expect(MemoryItemSchema.schema['@id']).toBe(MEMORY_ITEM_SCHEMA_IRI)
    expect(MEMORY_ITEM_SCHEMA_IRI).toMatch(/^xnet:\/\/xnet\.fyi\/MemoryItem@1\.0\.0$/)
  })

  it('is private by default (never the legacy owner-only fallback)', () => {
    // presets.private() must register as a real authorization block so the
    // policy engine treats it as deliberately owner-only, not "undeclared".
    expect(getAuthMode(MemoryItemSchema.schema)).not.toBe('legacy')
  })

  it('exposes the expected properties including evidence + salience', () => {
    const propIds = MemoryItemSchema.schema.properties.map((p) => p['@id'])
    const id = MemoryItemSchema.schema['@id']
    for (const prop of ['kind', 'text', 'salience', 'lastUsedAt', 'decay', 'evidence']) {
      expect(propIds, prop).toContain(`${id}#${prop}`)
    }
  })

  it('requires the remembered text', () => {
    const textProp = MemoryItemSchema.schema.properties.find((p) => p['@id'].endsWith('#text'))
    expect(textProp?.required).toBe(true)
  })

  it('enumerates the three memory kinds with a fact default', () => {
    expect(MEMORY_KINDS.map((k) => k.id)).toEqual(['fact', 'preference', 'episode'])
  })
})
