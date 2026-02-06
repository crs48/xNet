/**
 * Tests for the Schema Lens System.
 */

import type { SchemaIRI } from './node'
import { describe, it, expect, beforeEach } from 'vitest'
import { LensRegistry, MigrationError, type SchemaLens } from './lens'
import {
  rename,
  convert,
  addDefault,
  remove,
  transform,
  copy,
  merge,
  when,
  composeLens,
  createOperations,
  identity
} from './lens-builders'

// ─── Test Schema IRIs ─────────────────────────────────────────────────────────

const TASK_V1 = 'xnet://xnet.fyi/Task@1.0.0' as SchemaIRI
const TASK_V2 = 'xnet://xnet.fyi/Task@2.0.0' as SchemaIRI
const TASK_V3 = 'xnet://xnet.fyi/Task@3.0.0' as SchemaIRI
const TASK_V4 = 'xnet://xnet.fyi/Task@4.0.0' as SchemaIRI

// ─── LensRegistry Tests ───────────────────────────────────────────────────────

describe('LensRegistry', () => {
  let registry: LensRegistry

  beforeEach(() => {
    registry = new LensRegistry()
  })

  describe('register', () => {
    it('should register a lens and its reverse', () => {
      const lens: SchemaLens = {
        source: TASK_V1,
        target: TASK_V2,
        forward: (data) => ({ ...data, version: 2 }),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        backward: ({ version, ...rest }) => rest,
        lossless: true
      }

      registry.register(lens)

      expect(registry.has(TASK_V1, TASK_V2)).toBe(true)
      expect(registry.has(TASK_V2, TASK_V1)).toBe(true)
    })

    it('should allow getting a registered lens', () => {
      const lens: SchemaLens = {
        source: TASK_V1,
        target: TASK_V2,
        forward: (data) => ({ ...data, migrated: true }),
        backward: (data) => data,
        lossless: false
      }

      registry.register(lens)

      const retrieved = registry.get(TASK_V1, TASK_V2)
      expect(retrieved).toBeDefined()
      expect(retrieved?.source).toBe(TASK_V1)
      expect(retrieved?.target).toBe(TASK_V2)
    })
  })

  describe('unregister', () => {
    it('should unregister a lens and its reverse', () => {
      const lens = identity(TASK_V1, TASK_V2)
      registry.register(lens)

      expect(registry.has(TASK_V1, TASK_V2)).toBe(true)

      registry.unregister(TASK_V1, TASK_V2)

      expect(registry.has(TASK_V1, TASK_V2)).toBe(false)
      expect(registry.has(TASK_V2, TASK_V1)).toBe(false)
    })

    it('should return false when unregistering non-existent lens', () => {
      expect(registry.unregister(TASK_V1, TASK_V2)).toBe(false)
    })
  })

  describe('findPath', () => {
    it('should return empty array for same source and target', () => {
      const path = registry.findPath(TASK_V1, TASK_V1)
      expect(path).toEqual([])
    })

    it('should find direct path between registered schemas', () => {
      registry.register(identity(TASK_V1, TASK_V2))

      const path = registry.findPath(TASK_V1, TASK_V2)
      expect(path).toHaveLength(1)
      expect(path![0].source).toBe(TASK_V1)
      expect(path![0].target).toBe(TASK_V2)
    })

    it('should find multi-step path through intermediate versions', () => {
      registry.register(identity(TASK_V1, TASK_V2))
      registry.register(identity(TASK_V2, TASK_V3))

      const path = registry.findPath(TASK_V1, TASK_V3)
      expect(path).toHaveLength(2)
      expect(path![0].source).toBe(TASK_V1)
      expect(path![0].target).toBe(TASK_V2)
      expect(path![1].source).toBe(TASK_V2)
      expect(path![1].target).toBe(TASK_V3)
    })

    it('should find shortest path when multiple paths exist', () => {
      // Create a longer path: V1 -> V2 -> V3 -> V4
      registry.register(identity(TASK_V1, TASK_V2))
      registry.register(identity(TASK_V2, TASK_V3))
      registry.register(identity(TASK_V3, TASK_V4))
      // Create a shorter path: V1 -> V4
      registry.register(identity(TASK_V1, TASK_V4))

      const path = registry.findPath(TASK_V1, TASK_V4)
      expect(path).toHaveLength(1) // Should find direct path
    })

    it('should return null when no path exists', () => {
      registry.register(identity(TASK_V1, TASK_V2))
      // V3 is disconnected

      const path = registry.findPath(TASK_V1, TASK_V3)
      expect(path).toBeNull()
    })

    it('should cache paths for performance', () => {
      registry.register(identity(TASK_V1, TASK_V2))
      registry.register(identity(TASK_V2, TASK_V3))

      // First call computes path
      const path1 = registry.findPath(TASK_V1, TASK_V3)
      // Second call should return cached result
      const path2 = registry.findPath(TASK_V1, TASK_V3)

      expect(path1).toEqual(path2)
    })
  })

  describe('transform', () => {
    it('should return same data for same source and target', () => {
      const data = { title: 'Test' }
      const result = registry.transform(data, TASK_V1, TASK_V1)
      expect(result).toBe(data) // Same reference
    })

    it('should apply single lens transformation', () => {
      const lens = composeLens(TASK_V1, TASK_V2, addDefault('status', 'todo'))
      registry.register(lens)

      const result = registry.transform({ title: 'Test' }, TASK_V1, TASK_V2)
      expect(result).toEqual({ title: 'Test', status: 'todo' })
    })

    it('should apply multi-step transformation', () => {
      registry.register(composeLens(TASK_V1, TASK_V2, rename('complete', 'done')))
      registry.register(composeLens(TASK_V2, TASK_V3, addDefault('priority', 'medium')))

      const result = registry.transform({ title: 'Test', complete: true }, TASK_V1, TASK_V3)
      expect(result).toEqual({ title: 'Test', done: true, priority: 'medium' })
    })

    it('should throw MigrationError when no path exists', () => {
      expect(() => {
        registry.transform({ title: 'Test' }, TASK_V1, TASK_V3)
      }).toThrow(MigrationError)
    })
  })

  describe('transformWithDetails', () => {
    it('should return detailed migration result', () => {
      registry.register(composeLens(TASK_V1, TASK_V2, rename('complete', 'status')))
      registry.register(composeLens(TASK_V2, TASK_V3, addDefault('priority', 'medium')))

      const result = registry.transformWithDetails(
        { title: 'Test', complete: true },
        TASK_V1,
        TASK_V3
      )

      expect(result.data).toEqual({ title: 'Test', status: true, priority: 'medium' })
      expect(result.path).toHaveLength(2)
      expect(result.lossless).toBe(false) // addDefault is lossy
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('Lossy')
    })

    it('should report lossless for all lossless transforms', () => {
      registry.register(composeLens(TASK_V1, TASK_V2, rename('complete', 'done')))
      registry.register(composeLens(TASK_V2, TASK_V3, rename('done', 'finished')))

      const result = registry.transformWithDetails({ complete: true }, TASK_V1, TASK_V3)

      expect(result.lossless).toBe(true)
      expect(result.warnings).toHaveLength(0)
    })
  })

  describe('canMigrate', () => {
    it('should return true for same schema', () => {
      expect(registry.canMigrate(TASK_V1, TASK_V1)).toBe(true)
    })

    it('should return true when path exists', () => {
      registry.register(identity(TASK_V1, TASK_V2))
      expect(registry.canMigrate(TASK_V1, TASK_V2)).toBe(true)
    })

    it('should return false when no path exists', () => {
      expect(registry.canMigrate(TASK_V1, TASK_V2)).toBe(false)
    })
  })

  describe('isLossless', () => {
    it('should return true for lossless path', () => {
      registry.register(composeLens(TASK_V1, TASK_V2, rename('a', 'b')))
      expect(registry.isLossless(TASK_V1, TASK_V2)).toBe(true)
    })

    it('should return false for lossy path', () => {
      registry.register(composeLens(TASK_V1, TASK_V2, addDefault('x', 1)))
      expect(registry.isLossless(TASK_V1, TASK_V2)).toBe(false)
    })

    it('should return false when no path exists', () => {
      expect(registry.isLossless(TASK_V1, TASK_V2)).toBe(false)
    })
  })

  describe('getSchemas', () => {
    it('should return all registered schema IRIs', () => {
      registry.register(identity(TASK_V1, TASK_V2))
      registry.register(identity(TASK_V2, TASK_V3))

      const schemas = registry.getSchemas()
      expect(schemas).toContain(TASK_V1)
      expect(schemas).toContain(TASK_V2)
      expect(schemas).toContain(TASK_V3)
    })
  })

  describe('clear', () => {
    it('should remove all lenses', () => {
      registry.register(identity(TASK_V1, TASK_V2))
      registry.clear()

      expect(registry.has(TASK_V1, TASK_V2)).toBe(false)
      expect(registry.getSchemas()).toHaveLength(0)
    })
  })
})

// ─── Lens Builder Tests ───────────────────────────────────────────────────────

describe('Lens Builders', () => {
  describe('rename', () => {
    it('should rename a property forward', () => {
      const op = rename('oldName', 'newName')
      const result = op.forward({ oldName: 'value', other: 1 })
      expect(result).toEqual({ newName: 'value', other: 1 })
    })

    it('should rename a property backward', () => {
      const op = rename('oldName', 'newName')
      const result = op.backward({ newName: 'value', other: 1 })
      expect(result).toEqual({ oldName: 'value', other: 1 })
    })

    it('should handle missing property', () => {
      const op = rename('missing', 'newName')
      const result = op.forward({ other: 1 })
      expect(result).toEqual({ other: 1 })
    })

    it('should be lossless', () => {
      expect(rename('a', 'b').lossless).toBe(true)
    })
  })

  describe('convert', () => {
    it('should convert property values forward', () => {
      const op = convert('status', { true: 'done', false: 'todo' }, { done: true, todo: false })
      const result = op.forward({ status: true })
      expect(result).toEqual({ status: 'done' })
    })

    it('should convert property values backward', () => {
      const op = convert('status', { true: 'done', false: 'todo' }, { done: true, todo: false })
      const result = op.backward({ status: 'done' })
      expect(result).toEqual({ status: true })
    })

    it('should handle unmapped values', () => {
      const op = convert('status', { a: 'A' }, { A: 'a' })
      const result = op.forward({ status: 'unmapped' })
      expect(result).toEqual({ status: 'unmapped' }) // unchanged
    })

    it('should be lossless', () => {
      expect(convert('x', {}, {}).lossless).toBe(true)
    })
  })

  describe('addDefault', () => {
    it('should add default value when property missing', () => {
      const op = addDefault('priority', 'medium')
      const result = op.forward({ title: 'Test' })
      expect(result).toEqual({ title: 'Test', priority: 'medium' })
    })

    it('should preserve existing value', () => {
      const op = addDefault('priority', 'medium')
      const result = op.forward({ priority: 'high' })
      expect(result).toEqual({ priority: 'high' })
    })

    it('should remove property on backward', () => {
      const op = addDefault('priority', 'medium')
      const result = op.backward({ title: 'Test', priority: 'high' })
      expect(result).toEqual({ title: 'Test' })
    })

    it('should be lossy (data lost in backward)', () => {
      expect(addDefault('x', 1).lossless).toBe(false)
    })
  })

  describe('remove', () => {
    it('should remove property forward', () => {
      const op = remove('legacy')
      const result = op.forward({ legacy: 'old', current: 'new' })
      expect(result).toEqual({ current: 'new' })
    })

    it('should not restore property backward', () => {
      const op = remove('legacy')
      const result = op.backward({ current: 'new' })
      expect(result).toEqual({ current: 'new' })
    })

    it('should be lossy', () => {
      expect(remove('x').lossless).toBe(false)
    })
  })

  describe('transform', () => {
    it('should transform property value forward', () => {
      const op = transform(
        'count',
        (v) => (v as number) * 100,
        (v) => (v as number) / 100
      )
      const result = op.forward({ count: 5 })
      expect(result).toEqual({ count: 500 })
    })

    it('should transform property value backward', () => {
      const op = transform(
        'count',
        (v) => (v as number) * 100,
        (v) => (v as number) / 100
      )
      const result = op.backward({ count: 500 })
      expect(result).toEqual({ count: 5 })
    })

    it('should handle missing property', () => {
      const op = transform(
        'count',
        (v) => (v as number) * 100,
        (v) => (v as number) / 100
      )
      const result = op.forward({ other: 1 })
      expect(result).toEqual({ other: 1 })
    })

    it('should be lossless by default', () => {
      expect(
        transform(
          'x',
          (v) => v,
          (v) => v
        ).lossless
      ).toBe(true)
    })

    it('should allow marking as lossy', () => {
      expect(
        transform(
          'x',
          (v) => v,
          (v) => v,
          { lossless: false }
        ).lossless
      ).toBe(false)
    })
  })

  describe('copy', () => {
    it('should copy property forward', () => {
      const op = copy('name', 'displayName')
      const result = op.forward({ name: 'John' })
      expect(result).toEqual({ name: 'John', displayName: 'John' })
    })

    it('should remove copied property backward', () => {
      const op = copy('name', 'displayName')
      const result = op.backward({ name: 'John', displayName: 'John' })
      expect(result).toEqual({ name: 'John' })
    })

    it('should be lossless', () => {
      expect(copy('a', 'b').lossless).toBe(true)
    })
  })

  describe('merge', () => {
    it('should merge properties forward', () => {
      const op = merge(['firstName', 'lastName'], 'fullName', (first, last) => `${first} ${last}`)
      const result = op.forward({ firstName: 'John', lastName: 'Doe' })
      expect(result).toEqual({ firstName: 'John', lastName: 'Doe', fullName: 'John Doe' })
    })

    it('should split property backward when splitFn provided', () => {
      const op = merge(
        ['firstName', 'lastName'],
        'fullName',
        (first, last) => `${first} ${last}`,
        (full) => (full as string).split(' ')
      )
      const result = op.backward({ fullName: 'John Doe' })
      expect(result).toEqual({ firstName: 'John', lastName: 'Doe' })
    })

    it('should just remove merged property backward without splitFn', () => {
      const op = merge(['firstName', 'lastName'], 'fullName', (first, last) => `${first} ${last}`)
      const result = op.backward({ firstName: 'John', lastName: 'Doe', fullName: 'John Doe' })
      expect(result).toEqual({ firstName: 'John', lastName: 'Doe' })
    })

    it('should be lossless only when splitFn provided', () => {
      const withSplit = merge(
        ['a'],
        'b',
        (a) => a,
        (b) => [b]
      )
      const withoutSplit = merge(['a'], 'b', (a) => a)
      expect(withSplit.lossless).toBe(true)
      expect(withoutSplit.lossless).toBe(false)
    })
  })

  describe('when', () => {
    it('should apply operation when condition is true', () => {
      const op = when((data) => data.type === 'task', addDefault('priority', 'medium'))
      const result = op.forward({ type: 'task' })
      expect(result).toEqual({ type: 'task', priority: 'medium' })
    })

    it('should not apply operation when condition is false', () => {
      const op = when((data) => data.type === 'task', addDefault('priority', 'medium'))
      const result = op.forward({ type: 'page' })
      expect(result).toEqual({ type: 'page' })
    })

    it('should preserve lossless status of inner operation', () => {
      const lossyWhen = when(() => true, addDefault('x', 1))
      const losslessWhen = when(() => true, rename('a', 'b'))
      expect(lossyWhen.lossless).toBe(false)
      expect(losslessWhen.lossless).toBe(true)
    })
  })

  describe('composeLens', () => {
    it('should compose multiple operations forward', () => {
      const lens = composeLens(
        TASK_V1,
        TASK_V2,
        rename('complete', 'status'),
        addDefault('priority', 'medium')
      )

      const result = lens.forward({ complete: true, title: 'Test' })
      expect(result).toEqual({ status: true, title: 'Test', priority: 'medium' })
    })

    it('should compose multiple operations backward in reverse order', () => {
      const lens = composeLens(
        TASK_V1,
        TASK_V2,
        rename('complete', 'status'),
        addDefault('priority', 'medium')
      )

      const result = lens.backward({ status: true, title: 'Test', priority: 'high' })
      expect(result).toEqual({ complete: true, title: 'Test' })
    })

    it('should be lossless only when all operations are lossless', () => {
      const lossless = composeLens(TASK_V1, TASK_V2, rename('a', 'b'), rename('c', 'd'))
      const lossy = composeLens(TASK_V1, TASK_V2, rename('a', 'b'), addDefault('x', 1))

      expect(lossless.lossless).toBe(true)
      expect(lossy.lossless).toBe(false)
    })

    it('should set source and target IRIs', () => {
      const lens = composeLens(TASK_V1, TASK_V2, rename('a', 'b'))
      expect(lens.source).toBe(TASK_V1)
      expect(lens.target).toBe(TASK_V2)
    })
  })

  describe('createOperations', () => {
    it('should compose operations without IRIs', () => {
      const ops = createOperations(rename('old', 'new'), addDefault('x', 1))

      const result = ops.forward({ old: 'value' })
      expect(result).toEqual({ new: 'value', x: 1 })
      expect(ops.lossless).toBe(false)
    })
  })

  describe('identity', () => {
    it('should pass through data unchanged', () => {
      const lens = identity(TASK_V1, TASK_V2)
      const data = { foo: 'bar' }

      expect(lens.forward(data)).toBe(data)
      expect(lens.backward(data)).toBe(data)
    })

    it('should be lossless', () => {
      expect(identity(TASK_V1, TASK_V2).lossless).toBe(true)
    })
  })
})

// ─── MigrationError Tests ─────────────────────────────────────────────────────

describe('MigrationError', () => {
  it('should include source and target in error', () => {
    const error = new MigrationError('No path found', TASK_V1, TASK_V2)
    expect(error.message).toBe('No path found')
    expect(error.source).toBe(TASK_V1)
    expect(error.target).toBe(TASK_V2)
    expect(error.name).toBe('MigrationError')
  })
})

// ─── Integration Tests ────────────────────────────────────────────────────────

describe('Integration: Task Schema Migration', () => {
  let registry: LensRegistry

  beforeEach(() => {
    registry = new LensRegistry()

    // V1 -> V2: Rename complete to status, convert boolean to string
    registry.register(
      composeLens(
        TASK_V1,
        TASK_V2,
        rename('complete', 'status'),
        convert('status', { true: 'done', false: 'todo' }, { done: true, todo: false })
      )
    )

    // V2 -> V3: Add priority field
    registry.register(composeLens(TASK_V2, TASK_V3, addDefault('priority', 'medium')))
  })

  it('should migrate Task from V1 to V3', () => {
    const v1Task = {
      id: 'task-1',
      title: 'Buy groceries',
      complete: true
    }

    const v3Task = registry.transform(v1Task, TASK_V1, TASK_V3)

    expect(v3Task).toEqual({
      id: 'task-1',
      title: 'Buy groceries',
      status: 'done',
      priority: 'medium'
    })
  })

  it('should migrate Task backward from V3 to V1', () => {
    const v3Task = {
      id: 'task-1',
      title: 'Buy groceries',
      status: 'todo',
      priority: 'high'
    }

    const v1Task = registry.transform(v3Task, TASK_V3, TASK_V1)

    expect(v1Task).toEqual({
      id: 'task-1',
      title: 'Buy groceries',
      complete: false
      // priority is lost (lossy transformation)
    })
  })

  it('should report lossy migration from V1 to V3', () => {
    const result = registry.transformWithDetails({ title: 'Test' }, TASK_V1, TASK_V3)

    expect(result.lossless).toBe(false)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('Lossy')
    expect(result.warnings[0]).toContain(TASK_V2) // The lossy step is V2 -> V3
    expect(result.warnings[0]).toContain(TASK_V3)
  })
})
