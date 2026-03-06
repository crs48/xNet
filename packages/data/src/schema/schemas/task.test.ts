import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import { TaskSchema } from './task'

describe('TaskSchema', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

  describe('schema definition', () => {
    it('has correct schema IRI', () => {
      expect(TaskSchema.schema['@id']).toBe('xnet://xnet.fyi/Task@1.0.0')
      expect(TaskSchema.schema['@type']).toBe('xnet://xnet.fyi/Schema')
      expect(TaskSchema.schema.name).toBe('Task')
      expect(TaskSchema.schema.version).toBe('1.0.0')
    })

    it('has all task metadata properties needed for page-backed tasks', () => {
      const propIds = TaskSchema.schema.properties.map((p) => p['@id'])

      expect(propIds).toContain('xnet://xnet.fyi/Task@1.0.0#title')
      expect(propIds).toContain('xnet://xnet.fyi/Task@1.0.0#completed')
      expect(propIds).toContain('xnet://xnet.fyi/Task@1.0.0#assignee')
      expect(propIds).toContain('xnet://xnet.fyi/Task@1.0.0#assignees')
      expect(propIds).toContain('xnet://xnet.fyi/Task@1.0.0#page')
      expect(propIds).toContain('xnet://xnet.fyi/Task@1.0.0#anchorBlockId')
      expect(propIds).toContain('xnet://xnet.fyi/Task@1.0.0#sortKey')
      expect(propIds).toContain('xnet://xnet.fyi/Task@1.0.0#source')
      expect(propIds).toContain('xnet://xnet.fyi/Task@1.0.0#references')
    })
  })

  describe('create', () => {
    it('creates a task with assignees, page binding, and references', () => {
      const task = TaskSchema.create(
        {
          title: 'Review the PR',
          assignees: [testDID],
          page: 'page-123',
          anchorBlockId: 'block-456',
          sortKey: 'a0',
          source: 'page',
          references: ['ref-1', 'ref-2']
        },
        { createdBy: testDID }
      )

      expect(task.title).toBe('Review the PR')
      expect(task.assignees).toEqual([testDID])
      expect(task.page).toBe('page-123')
      expect(task.anchorBlockId).toBe('block-456')
      expect(task.sortKey).toBe('a0')
      expect(task.source).toBe('page')
      expect(task.references).toEqual(['ref-1', 'ref-2'])
      expect(task.completed).toBe(false)
      expect(task.status).toBe('todo')
      expect(task.priority).toBe('medium')
    })
  })

  describe('validate', () => {
    it('accepts a valid task with new fields', () => {
      const task = TaskSchema.create(
        {
          title: 'Watch walkthrough',
          assignees: [testDID],
          references: ['ref-1'],
          source: 'page'
        },
        { createdBy: testDID }
      )

      const result = TaskSchema.validate(task)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })
})
