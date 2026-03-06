import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import { ExternalReferenceSchema } from './external-reference'

describe('ExternalReferenceSchema', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

  describe('schema definition', () => {
    it('has correct schema IRI', () => {
      expect(ExternalReferenceSchema.schema['@id']).toBe('xnet://xnet.fyi/ExternalReference@1.0.0')
      expect(ExternalReferenceSchema.schema.name).toBe('ExternalReference')
      expect(ExternalReferenceSchema.schema.version).toBe('1.0.0')
    })

    it('defines normalized reference properties', () => {
      const propIds = ExternalReferenceSchema.schema.properties.map((p) => p['@id'])

      expect(propIds).toContain('xnet://xnet.fyi/ExternalReference@1.0.0#url')
      expect(propIds).toContain('xnet://xnet.fyi/ExternalReference@1.0.0#provider')
      expect(propIds).toContain('xnet://xnet.fyi/ExternalReference@1.0.0#kind')
      expect(propIds).toContain('xnet://xnet.fyi/ExternalReference@1.0.0#refId')
      expect(propIds).toContain('xnet://xnet.fyi/ExternalReference@1.0.0#title')
      expect(propIds).toContain('xnet://xnet.fyi/ExternalReference@1.0.0#embedUrl')
      expect(propIds).toContain('xnet://xnet.fyi/ExternalReference@1.0.0#metadata')
    })
  })

  describe('create', () => {
    it('creates a GitHub issue reference', () => {
      const reference = ExternalReferenceSchema.create(
        {
          url: 'https://github.com/openai/openai/issues/123',
          provider: 'github',
          kind: 'issue',
          refId: 'openai/openai#123',
          title: 'openai#123',
          subtitle: 'openai',
          icon: 'GH',
          metadata: JSON.stringify({ owner: 'openai', repo: 'openai', number: '123' })
        },
        { createdBy: testDID }
      )

      expect(reference.provider).toBe('github')
      expect(reference.kind).toBe('issue')
      expect(reference.refId).toBe('openai/openai#123')
      expect(reference.title).toBe('openai#123')
    })
  })

  describe('validate', () => {
    it('accepts a valid external reference', () => {
      const reference = ExternalReferenceSchema.create(
        {
          url: 'https://www.figma.com/file/abc123def',
          provider: 'figma',
          kind: 'design',
          refId: 'file/abc123def',
          title: 'Figma file',
          embedUrl:
            'https://www.figma.com/embed?embed_host=xnet&url=https://www.figma.com/file/abc123def'
        },
        { createdBy: testDID }
      )

      const result = ExternalReferenceSchema.validate(reference)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })
})
