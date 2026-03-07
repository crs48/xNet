/**
 * Tests for canonical query descriptors and delta application.
 */

import type { NodeState, SchemaIRI } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  applyNodeChangeToQueryResult,
  createQueryDescriptor,
  serializeQueryDescriptor
} from '../query-descriptor'

const TEST_SCHEMA_ID = 'xnet://test/Task' as SchemaIRI

function createMockNode(
  id: string,
  properties: Record<string, unknown>,
  deleted = false
): NodeState {
  const now = Date.now()

  return {
    id,
    schemaId: TEST_SCHEMA_ID,
    properties,
    timestamps: Object.fromEntries(
      Object.keys(properties).map((key) => [
        key,
        { lamport: { time: 1, author: 'did:key:test' }, wallTime: now }
      ])
    ),
    createdAt: now,
    createdBy: 'did:key:test',
    updatedAt: now,
    updatedBy: 'did:key:test',
    deleted
  }
}

describe('query-descriptor', () => {
  describe('createQueryDescriptor', () => {
    it('should serialize equivalent queries to the same key', () => {
      const left = createQueryDescriptor(TEST_SCHEMA_ID, {
        where: { status: 'done', title: 'Task' },
        orderBy: { updatedAt: 'desc', title: 'asc' }
      })
      const right = createQueryDescriptor(TEST_SCHEMA_ID, {
        where: { title: 'Task', status: 'done' },
        orderBy: { title: 'asc', updatedAt: 'desc' }
      })

      expect(left).toEqual(right)
      expect(serializeQueryDescriptor(left)).toBe(serializeQueryDescriptor(right))
    })
  })

  describe('applyNodeChangeToQueryResult', () => {
    it('should add matching nodes for unbounded queries', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        where: { status: 'done' },
        orderBy: { title: 'asc' }
      })
      const nextNode = createMockNode('done-1', { title: 'Done task', status: 'done' })

      const delta = applyNodeChangeToQueryResult({
        descriptor,
        currentData: [],
        nodeId: nextNode.id,
        nextNode
      })

      expect(delta).toEqual({
        kind: 'set',
        data: [nextNode]
      })
    })

    it('should remove nodes that no longer match a filter', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        where: { status: 'done' }
      })
      const existing = createMockNode('task-1', { title: 'Task', status: 'done' })
      const updated = createMockNode('task-1', { title: 'Task', status: 'todo' })

      const delta = applyNodeChangeToQueryResult({
        descriptor,
        currentData: [existing],
        nodeId: existing.id,
        nextNode: updated
      })

      expect(delta).toEqual({
        kind: 'set',
        data: []
      })
    })

    it('should request a bounded reload for paginated windows', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        orderBy: { title: 'asc' },
        limit: 1
      })
      const existing = createMockNode('task-1', { title: 'A task' })
      const inserted = createMockNode('task-2', { title: 'B task' })

      const delta = applyNodeChangeToQueryResult({
        descriptor,
        currentData: [existing],
        nodeId: inserted.id,
        nextNode: inserted
      })

      expect(delta).toEqual({ kind: 'reload' })
    })
  })
})
