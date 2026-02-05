import type { DID, Node } from './index'
import { describe, it, expect, vi } from 'vitest'
import { defineSchema } from './define'
import { isNode, createNodeId } from './node'
import { text, number, checkbox, select, date, relation } from './properties'

describe('Schema System', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

  describe('defineSchema', () => {
    it('creates a schema with correct IRI', () => {
      const TaskSchema = defineSchema({
        name: 'Task',
        namespace: 'xnet://xnet.fyi/',
        properties: {
          title: text({ required: true })
        }
      })

      expect(TaskSchema.schema['@id']).toBe('xnet://xnet.fyi/Task')
      expect(TaskSchema.schema['@type']).toBe('xnet://xnet.fyi/Schema')
      expect(TaskSchema.schema.name).toBe('Task')
    })

    it('builds property definitions with IRIs', () => {
      const TaskSchema = defineSchema({
        name: 'Task',
        namespace: 'xnet://xnet.fyi/',
        properties: {
          title: text({ required: true }),
          priority: number({})
        }
      })

      expect(TaskSchema.schema.properties).toHaveLength(2)
      expect(TaskSchema.schema.properties[0]['@id']).toBe('xnet://xnet.fyi/Task#title')
      expect(TaskSchema.schema.properties[0].required).toBe(true)
      expect(TaskSchema.schema.properties[1]['@id']).toBe('xnet://xnet.fyi/Task#priority')
      expect(TaskSchema.schema.properties[1].required).toBe(false)
    })

    it('sets document type correctly', () => {
      const PageSchema = defineSchema({
        name: 'Page',
        namespace: 'xnet://xnet.fyi/',
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
      namespace: 'xnet://xnet.fyi/',
      properties: {
        title: text({ required: true }),
        completed: checkbox({ default: false }),
        priority: number({})
      }
    })

    it('creates a node with required fields', () => {
      const task = TaskSchema.create({ title: 'Fix the bug' }, { createdBy: testDID })

      expect(task.id).toBeDefined()
      expect(task.schemaId).toBe('xnet://xnet.fyi/Task')
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
      namespace: 'xnet://xnet.fyi/',
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
        schemaId: 'xnet://xnet.fyi/Task',
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
        schemaId: 'xnet://xnet.fyi/Task',
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
        schemaId: 'xnet://xnet.fyi/Other',
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
      namespace: 'xnet://xnet.fyi/',
      properties: {
        title: text({ required: true })
      }
    })

    const PageSchema = defineSchema({
      name: 'Page',
      namespace: 'xnet://xnet.fyi/',
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

  describe('relation property', () => {
    it('creates typed relation with target schema', () => {
      const Schema = defineSchema({
        name: 'Child',
        namespace: 'xnet://test/',
        properties: {
          parent: relation({ target: 'xnet://test/Parent' as const, required: true })
        }
      })

      const child = Schema.create({ parent: 'parent-123' }, { createdBy: testDID })
      expect(child.parent).toBe('parent-123')

      const prop = Schema.schema.properties[0]
      expect(prop.type).toBe('relation')
      expect(prop.config?.target).toBe('xnet://test/Parent')
    })

    it('creates untyped relation without target schema', () => {
      const Schema = defineSchema({
        name: 'Comment',
        namespace: 'xnet://test/',
        properties: {
          target: relation({ required: true }),
          inReplyTo: relation({})
        }
      })

      const comment = Schema.create(
        { target: 'any-node-123', inReplyTo: 'root-456' },
        { createdBy: testDID }
      )
      expect(comment.target).toBe('any-node-123')
      expect(comment.inReplyTo).toBe('root-456')

      // Untyped relation has no target in config
      const targetProp = Schema.schema.properties[0]
      expect(targetProp.type).toBe('relation')
      expect(targetProp.config?.target).toBeUndefined()
    })

    it('validates untyped relation accepts any non-empty string', () => {
      const Schema = defineSchema({
        name: 'Ref',
        namespace: 'xnet://test/',
        properties: {
          target: relation({ required: true })
        }
      })

      const valid = {
        id: 'test',
        schemaId: 'xnet://test/Ref',
        createdAt: Date.now(),
        createdBy: testDID,
        target: 'some-node-id'
      }
      expect(Schema.validate(valid).valid).toBe(true)

      const empty = { ...valid, target: '' }
      expect(Schema.validate(empty).valid).toBe(false)

      const missing = { ...valid, target: undefined }
      expect(Schema.validate(missing).valid).toBe(false)
    })

    it('supports multiple untyped relations', () => {
      const Schema = defineSchema({
        name: 'Collection',
        namespace: 'xnet://test/',
        properties: {
          items: relation({ multiple: true })
        }
      })

      const col = Schema.create({ items: ['a', 'b', 'c'] }, { createdBy: testDID })
      expect(col.items).toEqual(['a', 'b', 'c'])
    })

    it('coerces null to empty array for multiple relations', () => {
      const Schema = defineSchema({
        name: 'Collection',
        namespace: 'xnet://test/',
        properties: {
          items: relation({ multiple: true })
        }
      })

      const col = Schema.create({}, { createdBy: testDID })
      expect(col.items).toEqual([])
    })
  })

  describe('defineSchema warnings', () => {
    it('warns when text() property name looks like a reference', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      defineSchema({
        name: 'Bad',
        namespace: 'xnet://test/',
        properties: {
          target: text({}),
          inReplyTo: text({}),
          replyToCommentId: text({})
        }
      })

      expect(warnSpy).toHaveBeenCalledTimes(3)
      expect(warnSpy.mock.calls[0][0]).toContain('Bad.target')
      expect(warnSpy.mock.calls[1][0]).toContain('Bad.inReplyTo')
      expect(warnSpy.mock.calls[2][0]).toContain('Bad.replyToCommentId')

      warnSpy.mockRestore()
    })

    it('does not warn for legitimate text() properties', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      defineSchema({
        name: 'Good',
        namespace: 'xnet://test/',
        properties: {
          title: text({ required: true }),
          description: text({}),
          pluginId: text({}),
          source: text({})
        }
      })

      expect(warnSpy).not.toHaveBeenCalled()

      warnSpy.mockRestore()
    })

    it('does not warn when relation() is used correctly', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      defineSchema({
        name: 'Comment',
        namespace: 'xnet://test/',
        properties: {
          target: relation({ required: true }),
          inReplyTo: relation({})
        }
      })

      expect(warnSpy).not.toHaveBeenCalled()

      warnSpy.mockRestore()
    })
  })

  describe('Node utilities', () => {
    it('isNode validates node structure', () => {
      const valid: Node = {
        id: 'test',
        schemaId: 'xnet://xnet.fyi/Task',
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
