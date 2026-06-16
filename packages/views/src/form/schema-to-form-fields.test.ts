import type { Schema } from '@xnetjs/data'
import { buildEffectiveSchema } from '@xnetjs/data'
import { describe, it, expect } from 'vitest'
import { schemaToFormFields } from './schema-to-form-fields'

const deal: Schema = {
  '@id': 'xnet://xnet.fyi/Deal@1.0.0',
  '@type': 'xnet://xnet.fyi/Schema',
  name: 'Deal',
  namespace: 'xnet://xnet.fyi/',
  version: '1.0.0',
  properties: [
    { '@id': '#title', name: 'title', type: 'text', required: true },
    { '@id': '#amount', name: 'amount', type: 'number', required: false },
    {
      '@id': '#stage',
      name: 'stage',
      type: 'select',
      required: false,
      config: { options: [{ id: 'open', name: 'Open' }] }
    },
    { '@id': '#source', name: 'source', type: 'select', required: false },
    { '@id': '#sortKey', name: 'sortKey', type: 'text', required: false },
    { '@id': '#created', name: 'createdAt', type: 'created', required: false }
  ]
}

describe('schemaToFormFields', () => {
  it('hides internal and auto fields by default', () => {
    const fields = schemaToFormFields(deal)
    expect(fields.map((f) => f.id)).toEqual(['title', 'amount', 'stage'])
  })

  it('keeps internal/auto fields when opted out', () => {
    const fields = schemaToFormFields(deal, { hideInternal: false, hideAutoFields: false })
    expect(fields.map((f) => f.id)).toContain('sortKey')
    expect(fields.map((f) => f.id)).toContain('createdAt')
  })

  it('marks highlight fields', () => {
    const fields = schemaToFormFields(deal, { highlights: ['title', 'amount'] })
    expect(fields.find((f) => f.id === 'title')?.highlight).toBe(true)
    expect(fields.find((f) => f.id === 'stage')?.highlight).toBeUndefined()
  })

  it('applies group labels', () => {
    const fields = schemaToFormFields(deal, { groups: { amount: 'Money' } })
    expect(fields.find((f) => f.id === 'amount')?.group).toBe('Money')
  })

  it('reorders by the order list, unlisted fields keep schema order', () => {
    const fields = schemaToFormFields(deal, { order: ['stage', 'title'] })
    expect(fields.map((f) => f.id)).toEqual(['stage', 'title', 'amount'])
  })

  it('carries readonly + extension fields through from an effective schema', () => {
    const effective = buildEffectiveSchema(deal, [
      { authority: 'acme.com', name: 'leadScore', type: 'number' }
    ])
    const fields = schemaToFormFields(effective)
    expect(fields.find((f) => f.id === 'title')?.readonly).toBe(true)
    expect(fields.some((f) => f.id.includes('leadScore'))).toBe(true)
  })
})
