import { describe, it, expect } from 'vitest'
import type { Schema } from './types'
import type { SchemaIRI } from './node'
import {
  buildEffectiveSchema,
  canModifyColumn,
  findLockedColumns,
  lockedPropertyKeys,
  type EffectiveExtensionField
} from './effective-schema'

const core: Schema = {
  '@id': 'xnet://xnet.fyi/Contact@1.0.0' as SchemaIRI,
  '@type': 'xnet://xnet.fyi/Schema',
  name: 'Contact',
  namespace: 'xnet://xnet.fyi/',
  version: '1.0.0',
  properties: [
    { '@id': 'xnet://xnet.fyi/Contact@1.0.0#name', name: 'name', type: 'text', required: true },
    { '@id': 'xnet://xnet.fyi/Contact@1.0.0#email', name: 'email', type: 'email', required: false }
  ]
}

const extensions: EffectiveExtensionField[] = [
  { authority: 'acme.com', name: 'leadScore', type: 'number' },
  { authority: 'acme.com', name: 'nextTouch', type: 'date', config: { includeTime: false } }
]

describe('buildEffectiveSchema', () => {
  it('returns the core schema unchanged when there are no extensions', () => {
    expect(buildEffectiveSchema(core, [])).toBe(core)
  })

  it('locks core properties and appends namespaced extension fields', () => {
    const effective = buildEffectiveSchema(core, extensions)
    expect(effective.properties).toHaveLength(4)

    const [name, email, leadScore, nextTouch] = effective.properties
    expect(name).toMatchObject({ name: 'name', readonly: true })
    expect(email).toMatchObject({ name: 'email', readonly: true })

    expect(leadScore).toMatchObject({
      name: 'ext:acme.com/leadScore',
      type: 'number',
      readonly: false,
      required: false
    })
    expect(leadScore['@id']).toBe('xnet://xnet.fyi/Contact@1.0.0#ext:acme.com/leadScore')

    expect(nextTouch).toMatchObject({
      name: 'ext:acme.com/nextTouch',
      type: 'date',
      config: { includeTime: false }
    })
  })

  it('does not mutate the core schema', () => {
    buildEffectiveSchema(core, extensions)
    expect(core.properties).toHaveLength(2)
    expect(core.properties[0].readonly).toBeUndefined()
  })
})

describe('column locking helpers', () => {
  const effective = buildEffectiveSchema(core, extensions)

  it('reports locked core keys', () => {
    expect(lockedPropertyKeys(effective).sort()).toEqual(['email', 'name'])
  })

  it('allows column ops on extension fields, blocks them on core', () => {
    expect(canModifyColumn(effective, 'name')).toBe(false)
    expect(canModifyColumn(effective, 'ext:acme.com/leadScore')).toBe(true)
    expect(canModifyColumn(effective, 'does-not-exist')).toBe(false)
  })

  it('finds locked columns among a set of requested ops', () => {
    expect(findLockedColumns(effective, ['ext:acme.com/leadScore'])).toEqual([])
    expect(findLockedColumns(effective, ['name', 'ext:acme.com/leadScore', 'email'])).toEqual([
      'name',
      'email'
    ])
  })
})
