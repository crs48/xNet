import { describe, expect, it } from 'vitest'
import {
  LAB_SCHEMA_IRI,
  LabSchema,
  isLabLanguage,
  isLabRuntimeTier
} from '../schema'

describe('LabSchema', () => {
  it('builds the versioned Lab IRI', () => {
    expect(LabSchema.schema['@id']).toBe(LAB_SCHEMA_IRI)
    expect(LabSchema.schema.name).toBe('Lab')
  })

  it('defines the core Lab properties', () => {
    const names = LabSchema.schema.properties.map((property) => property.name)
    for (const key of ['title', 'language', 'runtime', 'code', 'lastOutput', 'lastError']) {
      expect(names).toContain(key)
    }
  })

  it('guards languages and runtime tiers', () => {
    expect(isLabLanguage('rust')).toBe(true)
    expect(isLabLanguage('cobol')).toBe(false)
    expect(isLabRuntimeTier('sandbox')).toBe(true)
    expect(isLabRuntimeTier('quantum')).toBe(false)
  })
})
