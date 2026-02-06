/**
 * Tests for schema-diff utility
 */

import type { Schema, SchemaIRI, PropertyType } from '@xnet/data'
import { describe, it, expect } from 'vitest'
import { diffSchemas, type ExtendedPropertyDefinition } from './schema-diff.js'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function prop(
  name: string,
  type: PropertyType,
  options?: { required?: boolean; selectOptions?: Array<{ value: string }> }
): ExtendedPropertyDefinition {
  return {
    '@id': `#${name}`,
    name,
    type,
    required: options?.required ?? false,
    options: options?.selectOptions
  }
}

function createSchema(
  name: string,
  version: string,
  properties: ExtendedPropertyDefinition[]
): Schema {
  return {
    '@id': `xnet://xnet.fyi/${name}@${version}` as SchemaIRI,
    '@type': 'xnet://xnet.fyi/Schema',
    name,
    namespace: 'xnet://xnet.fyi/',
    version,
    // Cast is safe - ExtendedPropertyDefinition is a superset of PropertyDefinition
    properties: properties as Schema['properties']
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('diffSchemas', () => {
  describe('no changes', () => {
    it('returns empty changes for identical schemas', () => {
      const schema = createSchema('Task', '1.0.0', [
        prop('title', 'text', { required: true }),
        prop('done', 'checkbox')
      ])

      const result = diffSchemas(schema, schema)

      expect(result.changes).toHaveLength(0)
      expect(result.overallRisk).toBe('safe')
      expect(result.autoMigratable).toBe(true)
    })
  })

  describe('adding properties', () => {
    it('detects added optional property as safe', () => {
      const v1 = createSchema('Task', '1.0.0', [prop('title', 'text', { required: true })])
      const v2 = createSchema('Task', '2.0.0', [
        prop('title', 'text', { required: true }),
        prop('description', 'text')
      ])

      const result = diffSchemas(v1, v2)

      expect(result.changes).toHaveLength(1)
      expect(result.changes[0].type).toBe('add')
      expect(result.changes[0].property).toBe('description')
      expect(result.changes[0].risk).toBe('safe')
      expect(result.summary.safe).toBe(1)
    })

    it('detects added required property as caution', () => {
      const v1 = createSchema('Task', '1.0.0', [prop('title', 'text', { required: true })])
      const v2 = createSchema('Task', '2.0.0', [
        prop('title', 'text', { required: true }),
        prop('priority', 'text', { required: true })
      ])

      const result = diffSchemas(v1, v2)

      expect(result.changes).toHaveLength(1)
      expect(result.changes[0].type).toBe('add')
      expect(result.changes[0].property).toBe('priority')
      expect(result.changes[0].risk).toBe('caution')
      expect(result.changes[0].suggestedLens).toContain('addDefault')
    })
  })

  describe('removing properties', () => {
    it('detects removed property as caution', () => {
      const v1 = createSchema('Task', '1.0.0', [
        prop('title', 'text', { required: true }),
        prop('legacyField', 'text')
      ])
      const v2 = createSchema('Task', '2.0.0', [prop('title', 'text', { required: true })])

      const result = diffSchemas(v1, v2)

      expect(result.changes).toHaveLength(1)
      expect(result.changes[0].type).toBe('remove')
      expect(result.changes[0].property).toBe('legacyField')
      expect(result.changes[0].risk).toBe('caution')
      expect(result.changes[0].suggestedLens).toContain('remove')
    })
  })

  describe('renaming properties', () => {
    it('detects potential rename when types match', () => {
      const v1 = createSchema('Task', '1.0.0', [
        prop('title', 'text', { required: true }),
        prop('complete', 'checkbox')
      ])
      const v2 = createSchema('Task', '2.0.0', [
        prop('title', 'text', { required: true }),
        prop('done', 'checkbox')
      ])

      const result = diffSchemas(v1, v2)

      // Should detect rename since types match
      const renameChange = result.changes.find((c) => c.type === 'rename')
      expect(renameChange).toBeDefined()
      expect(renameChange?.property).toBe('complete')
      expect(renameChange?.newProperty).toBe('done')
      expect(renameChange?.risk).toBe('breaking')
      expect(renameChange?.suggestedLens).toContain('rename')
    })
  })

  describe('type changes', () => {
    it('detects type change as breaking', () => {
      const v1 = createSchema('Task', '1.0.0', [
        prop('title', 'text', { required: true }),
        prop('count', 'text')
      ])
      const v2 = createSchema('Task', '2.0.0', [
        prop('title', 'text', { required: true }),
        prop('count', 'number')
      ])

      const result = diffSchemas(v1, v2)

      const typeChange = result.changes.find((c) => c.property === 'count')
      expect(typeChange).toBeDefined()
      expect(typeChange?.type).toBe('modify')
      expect(typeChange?.risk).toBe('breaking')
      expect(result.overallRisk).toBe('breaking')
    })
  })

  describe('select options', () => {
    it('detects added select options as safe', () => {
      const v1 = createSchema('Task', '1.0.0', [
        prop('status', 'select', { selectOptions: [{ value: 'todo' }, { value: 'done' }] })
      ])
      const v2 = createSchema('Task', '2.0.0', [
        prop('status', 'select', {
          selectOptions: [{ value: 'todo' }, { value: 'in-progress' }, { value: 'done' }]
        })
      ])

      const result = diffSchemas(v1, v2)

      const optionsChange = result.changes.find((c) => c.property === 'status')
      expect(optionsChange).toBeDefined()
      expect(optionsChange?.risk).toBe('safe')
    })

    it('detects removed select options as breaking', () => {
      const v1 = createSchema('Task', '1.0.0', [
        prop('status', 'select', {
          selectOptions: [{ value: 'todo' }, { value: 'blocked' }, { value: 'done' }]
        })
      ])
      const v2 = createSchema('Task', '2.0.0', [
        prop('status', 'select', { selectOptions: [{ value: 'todo' }, { value: 'done' }] })
      ])

      const result = diffSchemas(v1, v2)

      const optionsChange = result.changes.find((c) => c.property === 'status')
      expect(optionsChange).toBeDefined()
      expect(optionsChange?.risk).toBe('breaking')
      expect(optionsChange?.description).toContain('blocked')
    })
  })

  describe('required status changes', () => {
    it('detects making optional property required as caution', () => {
      const v1 = createSchema('Task', '1.0.0', [prop('priority', 'text', { required: false })])
      const v2 = createSchema('Task', '2.0.0', [prop('priority', 'text', { required: true })])

      const result = diffSchemas(v1, v2)

      const change = result.changes.find((c) => c.property === 'priority')
      expect(change).toBeDefined()
      expect(change?.type).toBe('modify')
      expect(change?.risk).toBe('caution')
      expect(change?.suggestedLens).toContain('addDefault')
    })

    it('detects making required property optional as safe', () => {
      const v1 = createSchema('Task', '1.0.0', [prop('priority', 'text', { required: true })])
      const v2 = createSchema('Task', '2.0.0', [prop('priority', 'text', { required: false })])

      const result = diffSchemas(v1, v2)

      const change = result.changes.find((c) => c.property === 'priority')
      expect(change).toBeDefined()
      expect(change?.type).toBe('modify')
      expect(change?.risk).toBe('safe')
    })
  })

  describe('summary and metadata', () => {
    it('computes correct summary counts', () => {
      const v1 = createSchema('Task', '1.0.0', [
        prop('title', 'text', { required: true }),
        prop('oldField', 'checkbox') // Use different type to avoid rename detection
      ])
      const v2 = createSchema('Task', '2.0.0', [
        prop('title', 'text', { required: true }),
        prop('newOptional', 'text'),
        prop('newRequired', 'number', { required: true }) // Different types
      ])

      const result = diffSchemas(v1, v2)

      // oldField removed (caution), newOptional added (safe), newRequired added (caution)
      expect(result.summary.safe).toBe(1)
      expect(result.summary.caution).toBe(2)
      expect(result.summary.breaking).toBe(0)
      expect(result.overallRisk).toBe('caution')
    })

    it('sets autoMigratable correctly', () => {
      // Simple case with auto-migratable changes
      const v1 = createSchema('Task', '1.0.0', [prop('title', 'text', { required: true })])
      const v2 = createSchema('Task', '2.0.0', [
        prop('title', 'text', { required: true }),
        prop('description', 'text') // optional - safe, no lens needed
      ])

      const result = diffSchemas(v1, v2)
      expect(result.autoMigratable).toBe(true)
    })

    it('returns correct version strings', () => {
      const v1 = createSchema('Task', '1.0.0', [prop('title', 'text')])
      const v2 = createSchema('Task', '2.0.0', [prop('title', 'text')])

      const result = diffSchemas(v1, v2)

      expect(result.fromVersion).toBe('1.0.0')
      expect(result.toVersion).toBe('2.0.0')
    })
  })
})
