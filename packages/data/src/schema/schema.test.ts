import { describe, it, expect } from 'vitest'
import { defineSchema } from './define'
import { text, number, checkbox, select, date } from './properties'
import { isNode, createNodeId } from './node'
import type { DID, Node, InferNode } from './index'

describe('Schema System', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

  describe('defineSchema', () => {
    it('creates a schema with correct IRI', () => {
      const TaskSchema = defineSchema({
        name: 'Task',
        namespace: 'xnet://xnet.dev/',
        properties: {
          title: text({ required: true })
        }
      })

      expect(TaskSchema.schema['@id']).toBe('xnet://xnet.dev/Task')
      expect(TaskSchema.schema['@type']).toBe('xnet://xnet.dev/Schema')
      expect(TaskSchema.schema.name).toBe('Task')
    })

    it('builds property definitions with IRIs', () => {
      const TaskSchema = defineSchema({
        name: 'Task',
        namespace: 'xnet://xnet.dev/',
        properties: {
          title: text({ required: true }),
          priority: number({})
        }
      })

      expect(TaskSchema.schema.properties).toHaveLength(2)
      expect(TaskSchema.schema.properties[0]['@id']).toBe('xnet://xnet.dev/Task#title')
      expect(TaskSchema.schema.properties[0].required).toBe(true)
      expect(TaskSchema.schema.properties[1]['@id']).toBe('xnet://xnet.dev/Task#priority')
      expect(TaskSchema.schema.properties[1].required).toBe(false)
    })

    it('sets document type correctly', () => {
      const PageSchema = defineSchema({
        name: 'Page',
        namespace: 'xnet://xnet.dev/',
        properties: {
          title: text({ required: true })
        },
        document: 'yjs'
      })

      expect(PageSchema.schema.document).toBe('yjs')
    })
  })

  describe('schema.create', () => {
    const TaskSchema = defineSchema({
      name: 'Task',
      namespace: 'xnet://xnet.dev/',
      properties: {
        title: text({ required: true }),
        completed: checkbox({ default: false }),
        priority: number({})
      }
    })

    it('creates a node with required fields', () => {
      const task = TaskSchema.create({ title: 'Fix the bug' }, { createdBy: testDID })

      expect(task.id).toBeDefined()
      expect(task.schemaId).toBe('xnet://xnet.dev/Task')
      expect(task.createdAt).toBeGreaterThan(0)
      expect(task.createdBy).toBe(testDID)
      expect(task.title).toBe('Fix the bug')
    })

    it('allows custom id and timestamp', () => {
      const task = TaskSchema.create(
        { title: 'Test' },
        { id: 'custom-id', createdBy: testDID, createdAt: 1000 }
      )

      expect(task.id).toBe('custom-id')
      expect(task.createdAt).toBe(1000)
    })

    it('coerces values', () => {
      const task = TaskSchema.create(
        { title: 123 as unknown as string, priority: '5' as unknown as number },
        { createdBy: testDID }
      )

      expect(task.title).toBe('123')
      expect(task.priority).toBe(5)
    })

    it('applies default values', () => {
      const task = TaskSchema.create({ title: 'Test' }, { createdBy: testDID })

      expect(task.completed).toBe(false)
    })
  })

  describe('schema.validate', () => {
    const TaskSchema = defineSchema({
      name: 'Task',
      namespace: 'xnet://xnet.dev/',
      properties: {
        title: text({ required: true, maxLength: 100 }),
        priority: number({ min: 1, max: 5 })
      }
    })

    it('validates a correct node', () => {
      const task = TaskSchema.create({ title: 'Valid task', priority: 3 }, { createdBy: testDID })

      const result = TaskSchema.validate(task)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('rejects missing required field', () => {
      const invalid = {
        id: 'test',
        schemaId: 'xnet://xnet.dev/Task',
        createdAt: Date.now(),
        createdBy: testDID
        // title is missing
      }

      const result = TaskSchema.validate(invalid)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.path === 'title')).toBe(true)
    })

    it('rejects invalid property value', () => {
      const invalid = {
        id: 'test',
        schemaId: 'xnet://xnet.dev/Task',
        createdAt: Date.now(),
        createdBy: testDID,
        title: 'Valid',
        priority: 10 // max is 5
      }

      const result = TaskSchema.validate(invalid)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.path === 'priority')).toBe(true)
    })

    it('rejects wrong schemaId', () => {
      const wrong = {
        id: 'test',
        schemaId: 'xnet://xnet.dev/Other',
        createdAt: Date.now(),
        createdBy: testDID,
        title: 'Valid'
      }

      const result = TaskSchema.validate(wrong)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.path === 'schemaId')).toBe(true)
    })
  })

  describe('schema.is', () => {
    const TaskSchema = defineSchema({
      name: 'Task',
      namespace: 'xnet://xnet.dev/',
      properties: {
        title: text({ required: true })
      }
    })

    const PageSchema = defineSchema({
      name: 'Page',
      namespace: 'xnet://xnet.dev/',
      properties: {
        title: text({ required: true })
      }
    })

    it('returns true for matching schema', () => {
      const task = TaskSchema.create({ title: 'Test' }, { createdBy: testDID })
      expect(TaskSchema.is(task)).toBe(true)
    })

    it('returns false for different schema', () => {
      const page = PageSchema.create({ title: 'Test' }, { createdBy: testDID })
      expect(TaskSchema.is(page)).toBe(false)
    })
  })

  describe('select property with literal types', () => {
    const TaskSchema = defineSchema({
      name: 'Task',
      namespace: 'xnet://test/',
      properties: {
        status: select({
          options: [
            { id: 'todo', name: 'To Do', color: 'gray' },
            { id: 'in-progress', name: 'In Progress', color: 'blue' },
            { id: 'done', name: 'Done', color: 'green' }
          ] as const,
          required: true,
          default: 'todo'
        })
      }
    })

    it('validates valid option', () => {
      const task = TaskSchema.create({ status: 'in-progress' }, { createdBy: testDID })
      expect(task.status).toBe('in-progress')

      const result = TaskSchema.validate(task)
      expect(result.valid).toBe(true)
    })

    it('rejects invalid option', () => {
      const invalid = {
        id: 'test',
        schemaId: 'xnet://test/Task',
        createdAt: Date.now(),
        createdBy: testDID,
        status: 'invalid'
      }

      const result = TaskSchema.validate(invalid)
      expect(result.valid).toBe(false)
    })

    it('coerces by name', () => {
      const task = TaskSchema.create(
        { status: 'To Do' as unknown as 'todo' },
        { createdBy: testDID }
      )
      expect(task.status).toBe('todo')
    })
  })

  describe('date property', () => {
    const EventSchema = defineSchema({
      name: 'Event',
      namespace: 'xnet://test/',
      properties: {
        startDate: date({ required: true }),
        endDate: date({})
      }
    })

    it('accepts timestamp', () => {
      const now = Date.now()
      const event = EventSchema.create({ startDate: now }, { createdBy: testDID })
      expect(event.startDate).toBe(now)
    })

    it('coerces ISO string', () => {
      const event = EventSchema.create(
        { startDate: '2026-01-21T12:00:00Z' as unknown as number },
        { createdBy: testDID }
      )
      expect(typeof event.startDate).toBe('number')
      expect(event.startDate).toBe(Date.parse('2026-01-21T12:00:00Z'))
    })
  })

  describe('Node utilities', () => {
    it('isNode validates node structure', () => {
      const valid: Node = {
        id: 'test',
        schemaId: 'xnet://xnet.dev/Task',
        createdAt: Date.now(),
        createdBy: testDID
      }
      expect(isNode(valid)).toBe(true)

      expect(isNode(null)).toBe(false)
      expect(isNode({})).toBe(false)
      expect(isNode({ id: 'test' })).toBe(false)
    })

    it('createNodeId generates unique IDs', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(createNodeId())
      }
      expect(ids.size).toBe(100)
    })

    it('createNodeId generates URL-safe nanoid', () => {
      const id = createNodeId()
      // Default nanoid is 21 chars, URL-safe
      expect(id.length).toBe(21)
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('createNodeId supports custom length', () => {
      const shortId = createNodeId(10)
      expect(shortId.length).toBe(10)

      const longId = createNodeId(32)
      expect(longId.length).toBe(32)
    })
  })
})
