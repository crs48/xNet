import { describe, it, expect } from 'vitest'
import type { Schema } from '@xnetjs/data'
import { buildEffectiveSchema } from '@xnetjs/data'
import { schemaToGridFields, displayLabelForProperty } from './schema-to-grid-fields'

const contact: Schema = {
  '@id': 'xnet://xnet.fyi/Contact@1.0.0',
  '@type': 'xnet://xnet.fyi/Schema',
  name: 'Contact',
  namespace: 'xnet://xnet.fyi/',
  version: '1.0.0',
  properties: [
    { '@id': '#name', name: 'name', type: 'text', required: true },
    {
      '@id': '#stage',
      name: 'stage',
      type: 'select',
      required: false,
      config: {
        options: [
          { id: 'lead', name: 'Lead', color: 'blue' },
          { id: 'won', name: 'Won', color: 'green' }
        ]
      }
    },
    { '@id': '#created', name: 'createdAt', type: 'created', required: false }
  ]
}

describe('schemaToGridFields', () => {
  it('maps properties to grid columns using the property key as id', () => {
    const fields = schemaToGridFields(contact)
    expect(fields.map((f) => f.id)).toEqual(['name', 'stage', 'createdAt'])
    expect(fields[0]).toMatchObject({ id: 'name', name: 'name', type: 'text' })
  })

  it('marks the first text/name property as the title column', () => {
    const fields = schemaToGridFields(contact)
    expect(fields.find((f) => f.isTitle)?.id).toBe('name')
  })

  it('resolves select options from config', () => {
    const stage = schemaToGridFields(contact).find((f) => f.id === 'stage')
    expect(stage?.options).toEqual([
      { id: 'lead', name: 'Lead', color: 'blue' },
      { id: 'won', name: 'Won', color: 'green' }
    ])
  })

  it('can hide auto-populated fields', () => {
    const fields = schemaToGridFields(contact, { hideAutoFields: true })
    expect(fields.map((f) => f.id)).toEqual(['name', 'stage'])
  })

  it('carries readonly + extension labels through from an effective schema', () => {
    const effective = buildEffectiveSchema(contact, [
      { authority: 'acme.com', name: 'leadScore', type: 'number' }
    ])
    const fields = schemaToGridFields(effective)
    const core = fields.find((f) => f.id === 'name')
    const ext = fields.find((f) => f.id === 'ext:acme.com/leadScore')

    expect(core?.readonly).toBe(true)
    expect(ext?.readonly).toBeUndefined() // not locked
    expect(ext?.name).toBe('leadScore') // display label = field token, not full key
  })

  it('displayLabelForProperty unwraps extension keys', () => {
    expect(displayLabelForProperty({ '@id': '#x', name: 'title', type: 'text', required: false })).toBe(
      'title'
    )
    expect(
      displayLabelForProperty({
        '@id': '#x',
        name: 'ext:acme.com/leadScore',
        type: 'number',
        required: false
      })
    ).toBe('leadScore')
  })
})
