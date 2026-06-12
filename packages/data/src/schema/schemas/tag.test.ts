import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import {
  MAX_TAG_NAME_LENGTH,
  TAG_SCHEMA_IRI,
  TagSchema,
  isValidTagName,
  normalizeTagName
} from './tag'

const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

describe('TagSchema', () => {
  it('has the expected schema identity', () => {
    expect(TagSchema.schema['@id']).toBe(TAG_SCHEMA_IRI)
    expect(TagSchema.schema.name).toBe('Tag')
    expect(TagSchema.schema.document).toBeUndefined()
  })

  it('creates a tag with name, color, and description', () => {
    const tag = TagSchema.create(
      { name: 'design', color: 'blue', description: 'Design work' },
      { createdBy: testDID }
    )
    expect(tag.name).toBe('design')
    expect(tag.archived).toBe(false)
    expect(TagSchema.validate(tag).valid).toBe(true)
  })

  it('requires a name', () => {
    const tag = TagSchema.create({} as never, { createdBy: testDID })
    expect(TagSchema.validate(tag).valid).toBe(false)
  })
})

describe('normalizeTagName', () => {
  it('strips a leading # and lowercases', () => {
    expect(normalizeTagName('#Design')).toBe('design')
    expect(normalizeTagName('##DESIGN')).toBe('design')
  })

  it('collapses whitespace to single hyphens', () => {
    expect(normalizeTagName('design  system ideas')).toBe('design-system-ideas')
  })

  it('keeps letters, numbers, hyphen, underscore, dot, slash', () => {
    expect(normalizeTagName('v1.2/beta_x')).toBe('v1.2/beta_x')
  })

  it('drops emoji and punctuation that breaks inline rendering', () => {
    expect(normalizeTagName('bug!?🔥')).toBe('bug')
  })

  it('supports unicode letters', () => {
    expect(normalizeTagName('Müller')).toBe('müller')
    expect(normalizeTagName('日本語')).toBe('日本語')
  })

  it('collapses repeated hyphens', () => {
    expect(normalizeTagName('a - - b')).toBe('a-b')
  })

  it('clamps to the maximum length', () => {
    expect(normalizeTagName('x'.repeat(200))).toHaveLength(MAX_TAG_NAME_LENGTH)
  })

  it('returns empty for unusable input', () => {
    expect(normalizeTagName('#')).toBe('')
    expect(normalizeTagName('  ')).toBe('')
    expect(normalizeTagName('!!!')).toBe('')
  })
})

describe('isValidTagName', () => {
  it('accepts normalized names', () => {
    expect(isValidTagName('design')).toBe(true)
    expect(isValidTagName('design-system')).toBe(true)
  })

  it('rejects empty and non-normalized names', () => {
    expect(isValidTagName('')).toBe(false)
    expect(isValidTagName('Design')).toBe(false)
    expect(isValidTagName('#design')).toBe(false)
    expect(isValidTagName('a b')).toBe(false)
  })
})
