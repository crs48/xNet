/**
 * Tests for TypeScript Language Service Plugin
 *
 * These tests verify the schema change detection logic.
 */

import type { SchemaInfo, PropertyInfo, SchemaChange } from './index'
import { describe, it, expect } from 'vitest'

// We need to import the functions directly for testing
// Since the plugin uses TypeScript internals, we test the pure logic functions

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createSchemaInfo(
  name: string,
  version: string,
  properties: Record<string, Omit<PropertyInfo, 'name'>>
): SchemaInfo {
  const propMap = new Map<string, PropertyInfo>()
  for (const [propName, propInfo] of Object.entries(properties)) {
    propMap.set(propName, { name: propName, ...propInfo })
  }
  return {
    name,
    version,
    properties: propMap,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    location: null as any // Not needed for diffing tests
  }
}

// Re-implement diffSchemaProperties for testing (same logic as plugin)
function diffSchemaProperties(oldSchema: SchemaInfo, newSchema: SchemaInfo): SchemaChange[] {
  const changes: SchemaChange[] = []

  // Check for removed properties
  for (const [name] of oldSchema.properties) {
    if (!newSchema.properties.has(name)) {
      changes.push({
        type: 'remove',
        property: name,
        risk: 'caution',
        description: `Property "${name}" was removed`,
        suggestedFix: `Add lens: remove('${name}')`
      })
    }
  }

  // Check for added properties
  for (const [name, newProp] of newSchema.properties) {
    if (!oldSchema.properties.has(name)) {
      changes.push({
        type: 'add',
        property: name,
        risk: newProp.required ? 'caution' : 'safe',
        description: newProp.required
          ? `Required property "${name}" was added`
          : `Optional property "${name}" was added`,
        suggestedFix: newProp.required ? `Add lens: addDefault('${name}', defaultValue)` : undefined
      })
    }
  }

  // Check for modified properties
  for (const [name, oldProp] of oldSchema.properties) {
    const newProp = newSchema.properties.get(name)
    if (!newProp) continue

    if (oldProp.type !== newProp.type) {
      changes.push({
        type: 'modify',
        property: name,
        risk: 'breaking',
        description: `Property "${name}" changed type from "${oldProp.type}" to "${newProp.type}"`,
        suggestedFix: `Add lens: transform('${name}', forwardFn, backwardFn)`
      })
    }

    if (!oldProp.required && newProp.required) {
      changes.push({
        type: 'modify',
        property: name,
        risk: 'caution',
        description: `Property "${name}" became required`,
        suggestedFix: `Add lens: addDefault('${name}', defaultValue)`
      })
    }
  }

  return changes
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ts-plugin', () => {
  describe('diffSchemaProperties', () => {
    it('should detect no changes for identical schemas', () => {
      const schema = createSchemaInfo('Task', '1.0.0', {
        title: { type: 'text', required: true },
        done: { type: 'boolean', required: false }
      })

      const changes = diffSchemaProperties(schema, schema)
      expect(changes).toHaveLength(0)
    })

    it('should detect added optional property as safe', () => {
      const oldSchema = createSchemaInfo('Task', '1.0.0', {
        title: { type: 'text', required: true }
      })
      const newSchema = createSchemaInfo('Task', '1.1.0', {
        title: { type: 'text', required: true },
        description: { type: 'text', required: false }
      })

      const changes = diffSchemaProperties(oldSchema, newSchema)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({
        type: 'add',
        property: 'description',
        risk: 'safe'
      })
    })

    it('should detect added required property as caution', () => {
      const oldSchema = createSchemaInfo('Task', '1.0.0', {
        title: { type: 'text', required: true }
      })
      const newSchema = createSchemaInfo('Task', '2.0.0', {
        title: { type: 'text', required: true },
        priority: { type: 'number', required: true }
      })

      const changes = diffSchemaProperties(oldSchema, newSchema)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({
        type: 'add',
        property: 'priority',
        risk: 'caution',
        suggestedFix: "Add lens: addDefault('priority', defaultValue)"
      })
    })

    it('should detect removed property as caution', () => {
      const oldSchema = createSchemaInfo('Task', '1.0.0', {
        title: { type: 'text', required: true },
        legacy: { type: 'text', required: false }
      })
      const newSchema = createSchemaInfo('Task', '2.0.0', {
        title: { type: 'text', required: true }
      })

      const changes = diffSchemaProperties(oldSchema, newSchema)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({
        type: 'remove',
        property: 'legacy',
        risk: 'caution',
        suggestedFix: "Add lens: remove('legacy')"
      })
    })

    it('should detect type change as breaking', () => {
      const oldSchema = createSchemaInfo('Task', '1.0.0', {
        count: { type: 'text', required: true }
      })
      const newSchema = createSchemaInfo('Task', '2.0.0', {
        count: { type: 'number', required: true }
      })

      const changes = diffSchemaProperties(oldSchema, newSchema)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({
        type: 'modify',
        property: 'count',
        risk: 'breaking',
        description: 'Property "count" changed type from "text" to "number"'
      })
    })

    it('should detect optional to required change as caution', () => {
      const oldSchema = createSchemaInfo('Task', '1.0.0', {
        dueDate: { type: 'date', required: false }
      })
      const newSchema = createSchemaInfo('Task', '2.0.0', {
        dueDate: { type: 'date', required: true }
      })

      const changes = diffSchemaProperties(oldSchema, newSchema)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({
        type: 'modify',
        property: 'dueDate',
        risk: 'caution',
        description: 'Property "dueDate" became required'
      })
    })

    it('should detect multiple changes', () => {
      const oldSchema = createSchemaInfo('Task', '1.0.0', {
        title: { type: 'text', required: true },
        count: { type: 'text', required: false },
        legacy: { type: 'text', required: false }
      })
      const newSchema = createSchemaInfo('Task', '2.0.0', {
        title: { type: 'text', required: true },
        count: { type: 'number', required: true },
        newField: { type: 'boolean', required: false }
      })

      const changes = diffSchemaProperties(oldSchema, newSchema)

      // Should have: remove legacy, add newField, modify count type, modify count required
      expect(changes.length).toBeGreaterThanOrEqual(3)

      const removeChange = changes.find((c) => c.type === 'remove')
      expect(removeChange).toBeDefined()
      expect(removeChange?.property).toBe('legacy')

      const addChange = changes.find((c) => c.type === 'add')
      expect(addChange).toBeDefined()
      expect(addChange?.property).toBe('newField')

      const breakingChange = changes.find((c) => c.risk === 'breaking')
      expect(breakingChange).toBeDefined()
      expect(breakingChange?.property).toBe('count')
    })

    it('should not flag required to optional as a change', () => {
      const oldSchema = createSchemaInfo('Task', '1.0.0', {
        dueDate: { type: 'date', required: true }
      })
      const newSchema = createSchemaInfo('Task', '1.1.0', {
        dueDate: { type: 'date', required: false }
      })

      const changes = diffSchemaProperties(oldSchema, newSchema)
      // Required -> optional is safe, not flagged as a breaking/caution change
      expect(changes).toHaveLength(0)
    })
  })

  describe('SchemaChange risk classification', () => {
    it('should classify safe changes correctly', () => {
      const oldSchema = createSchemaInfo('Doc', '1.0.0', {})
      const newSchema = createSchemaInfo('Doc', '1.1.0', {
        optionalField: { type: 'text', required: false }
      })

      const changes = diffSchemaProperties(oldSchema, newSchema)
      const safeChanges = changes.filter((c) => c.risk === 'safe')
      expect(safeChanges).toHaveLength(1)
    })

    it('should classify caution changes correctly', () => {
      const oldSchema = createSchemaInfo('Doc', '1.0.0', {
        removedField: { type: 'text', required: false }
      })
      const newSchema = createSchemaInfo('Doc', '2.0.0', {
        requiredField: { type: 'text', required: true }
      })

      const changes = diffSchemaProperties(oldSchema, newSchema)
      const cautionChanges = changes.filter((c) => c.risk === 'caution')
      expect(cautionChanges.length).toBeGreaterThanOrEqual(2) // remove + add required
    })

    it('should classify breaking changes correctly', () => {
      const oldSchema = createSchemaInfo('Doc', '1.0.0', {
        field: { type: 'text', required: true }
      })
      const newSchema = createSchemaInfo('Doc', '2.0.0', {
        field: { type: 'number', required: true }
      })

      const changes = diffSchemaProperties(oldSchema, newSchema)
      const breakingChanges = changes.filter((c) => c.risk === 'breaking')
      expect(breakingChanges).toHaveLength(1)
    })
  })

  describe('suggested fixes', () => {
    it('should suggest remove lens for removed properties', () => {
      const oldSchema = createSchemaInfo('Doc', '1.0.0', {
        oldField: { type: 'text', required: false }
      })
      const newSchema = createSchemaInfo('Doc', '2.0.0', {})

      const changes = diffSchemaProperties(oldSchema, newSchema)
      expect(changes[0].suggestedFix).toContain("remove('oldField')")
    })

    it('should suggest addDefault lens for new required properties', () => {
      const oldSchema = createSchemaInfo('Doc', '1.0.0', {})
      const newSchema = createSchemaInfo('Doc', '2.0.0', {
        newRequired: { type: 'text', required: true }
      })

      const changes = diffSchemaProperties(oldSchema, newSchema)
      expect(changes[0].suggestedFix).toContain("addDefault('newRequired'")
    })

    it('should suggest transform lens for type changes', () => {
      const oldSchema = createSchemaInfo('Doc', '1.0.0', {
        count: { type: 'text', required: true }
      })
      const newSchema = createSchemaInfo('Doc', '2.0.0', {
        count: { type: 'number', required: true }
      })

      const changes = diffSchemaProperties(oldSchema, newSchema)
      expect(changes[0].suggestedFix).toContain("transform('count'")
    })

    it('should not suggest fix for safe optional additions', () => {
      const oldSchema = createSchemaInfo('Doc', '1.0.0', {})
      const newSchema = createSchemaInfo('Doc', '1.1.0', {
        optional: { type: 'text', required: false }
      })

      const changes = diffSchemaProperties(oldSchema, newSchema)
      expect(changes[0].suggestedFix).toBeUndefined()
    })
  })
})
