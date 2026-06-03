/**
 * Tests for canonical query descriptors and delta application.
 */

import type { NodeState, SchemaIRI } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  applyNodeChangeToQueryResult,
  applyQueryDescriptor,
  createQueryDescriptor,
  decodeQueryCursor,
  encodeQueryCursor,
  queryDescriptorToOptions,
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

    it('should canonicalize equivalent spatial windows to the same key', () => {
      const left = createQueryDescriptor(TEST_SCHEMA_ID, {
        spatial: {
          kind: 'window',
          rect: { x: -100, y: 20, width: 320, height: 180 },
          fields: { x: 'canvasX', y: 'canvasY', height: 'canvasHeight', width: 'canvasWidth' },
          overscan: 0
        }
      })
      const right = createQueryDescriptor(TEST_SCHEMA_ID, {
        spatial: {
          kind: 'window',
          rect: { x: -100, y: 20, width: 320, height: 180 },
          fields: { x: 'canvasX', y: 'canvasY', width: 'canvasWidth', height: 'canvasHeight' }
        }
      })

      expect(left).toEqual(right)
      expect(serializeQueryDescriptor(left)).toBe(serializeQueryDescriptor(right))
    })

    it('should canonicalize equivalent search filters to the same key', () => {
      const left = createQueryDescriptor(TEST_SCHEMA_ID, {
        search: { text: '  Project Plan  ', fields: ['content', 'title', 'title'] }
      })
      const right = createQueryDescriptor(TEST_SCHEMA_ID, {
        search: { text: 'Project Plan', fields: ['title', 'content'] }
      })

      expect(left).toEqual(right)
      expect(serializeQueryDescriptor(left)).toBe(serializeQueryDescriptor(right))
    })

    it('should canonicalize equivalent materialized view options to the same key', () => {
      const left = createQueryDescriptor(TEST_SCHEMA_ID, {
        materializedView: { viewId: '  view-table  ', maxAgeMs: 60_000 }
      })
      const right = createQueryDescriptor(TEST_SCHEMA_ID, {
        materializedView: { viewId: 'view-table', maxAgeMs: 60_000 }
      })

      expect(left).toEqual(right)
      expect(serializeQueryDescriptor(left)).toBe(serializeQueryDescriptor(right))
    })

    it('should lower page.first to the existing limit descriptor', () => {
      const paged = createQueryDescriptor(TEST_SCHEMA_ID, {
        page: { first: 25 }
      })
      const limited = createQueryDescriptor(TEST_SCHEMA_ID, {
        limit: 25
      })

      expect(paged).toEqual(limited)
      expect(queryDescriptorToOptions(paged)).toEqual({ limit: 25 })
      expect(serializeQueryDescriptor(paged)).toBe(serializeQueryDescriptor(limited))
    })

    it('should preserve explicit limit and offset when page is also provided', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        page: { first: 25 },
        limit: 10,
        offset: 20
      })

      expect(descriptor.limit).toBe(10)
      expect(descriptor.offset).toBe(20)
      expect(queryDescriptorToOptions(descriptor)).toEqual({ limit: 10, offset: 20 })
    })

    it('should preserve cursor page options in the canonical descriptor', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        page: { first: 25, after: 'cursor-1', count: 'estimate' }
      })

      expect(descriptor.limit).toBe(25)
      expect(descriptor.after).toBe('cursor-1')
      expect(descriptor.count).toBe('estimate')
      expect(queryDescriptorToOptions(descriptor)).toEqual({
        limit: 25,
        page: { first: 25, after: 'cursor-1', count: 'estimate' }
      })
    })

    it('should preserve remote execution hints in the canonical descriptor', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        where: { status: 'open' },
        mode: 'local-then-remote',
        source: 'hub'
      })

      expect(descriptor.mode).toBe('local-then-remote')
      expect(descriptor.source).toBe('hub')
      expect(queryDescriptorToOptions(descriptor)).toMatchObject({
        where: { status: 'open' },
        mode: 'local-then-remote',
        source: 'hub'
      })
      expect(serializeQueryDescriptor(descriptor)).toContain('"mode":"local-then-remote"')
      expect(serializeQueryDescriptor(descriptor)).toContain('"source":"hub"')
    })
  })

  describe('query cursors', () => {
    it('should encode versioned opaque cursors from ordered descriptors', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        orderBy: { updatedAt: 'desc' }
      })
      const node = {
        ...createMockNode('task-a', { title: 'Task A' }),
        updatedAt: 10
      }

      const cursor = encodeQueryCursor(descriptor, node)
      const decoded = decodeQueryCursor(cursor)

      expect(cursor).toMatch(/^xnet-query-cursor:/)
      expect(decoded).toEqual({
        version: 1,
        schemaId: TEST_SCHEMA_ID,
        order: [{ field: 'updatedAt', direction: 'desc', value: 10 }],
        nodeId: 'task-a'
      })
      expect(decodeQueryCursor('not-a-cursor')).toBeNull()
    })

    it('should use node ID as the stable tie-breaker for duplicate sort values', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        orderBy: { updatedAt: 'desc' },
        page: { first: 10 }
      })
      const first = {
        ...createMockNode('task-a', { title: 'Task A' }),
        updatedAt: 20
      }
      const second = {
        ...createMockNode('task-b', { title: 'Task B' }),
        updatedAt: 20
      }
      const newer = {
        ...createMockNode('task-c', { title: 'Task C' }),
        updatedAt: 30
      }
      const cursor = encodeQueryCursor(descriptor, first)
      const nextPageDescriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        orderBy: { updatedAt: 'desc' },
        page: { first: 10, after: cursor }
      })

      expect(
        applyQueryDescriptor([second, newer, first], descriptor).map((node) => node.id)
      ).toEqual(['task-c', 'task-a', 'task-b'])
      expect(
        applyQueryDescriptor([second, newer, first], nextPageDescriptor).map((node) => node.id)
      ).toEqual(['task-b'])
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

    it('should request a bounded reload when an insert can shift the visible window', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        orderBy: { title: 'asc' },
        limit: 1
      })
      const visible = createMockNode('task-visible', { title: 'B visible' })
      const insertedBefore = createMockNode('task-inserted', { title: 'A inserted' })

      const delta = applyNodeChangeToQueryResult({
        descriptor,
        currentData: [visible],
        nodeId: insertedBefore.id,
        nextNode: insertedBefore
      })

      expect(delta).toEqual({ kind: 'reload' })
    })

    it('should request a bounded reload when a visible row is deleted', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        orderBy: { title: 'asc' },
        limit: 1
      })
      const visible = createMockNode('task-visible', { title: 'A visible' })

      const delta = applyNodeChangeToQueryResult({
        descriptor,
        currentData: [visible],
        nodeId: visible.id,
        nextNode: null
      })

      expect(delta).toEqual({ kind: 'reload' })
    })

    it('should filter spatial window queries by intersecting geometry', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        spatial: {
          kind: 'window',
          rect: { x: 0, y: 0, width: 200, height: 200 },
          fields: { x: 'x', y: 'y', width: 'width', height: 'height' }
        }
      })
      const nodes = [
        createMockNode('inside', { title: 'Inside', x: 24, y: 40, width: 48, height: 24 }),
        createMockNode('intersects', {
          title: 'Intersects',
          x: 190,
          y: 195,
          width: 40,
          height: 40
        }),
        createMockNode('outside', { title: 'Outside', x: 320, y: 340, width: 30, height: 30 })
      ]

      expect(applyQueryDescriptor(nodes, descriptor).map((node) => node.id)).toEqual([
        'inside',
        'intersects'
      ])
    })

    it('should filter radius queries for future geo-style lookups', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        spatial: {
          kind: 'radius',
          center: { x: 100, y: 100 },
          radius: 60,
          fields: { x: 'longitude', y: 'latitude' }
        }
      })
      const nodes = [
        createMockNode('nearby', { title: 'Nearby', longitude: 130, latitude: 120 }),
        createMockNode('far', { title: 'Far', longitude: 220, latitude: 220 })
      ]

      expect(applyQueryDescriptor(nodes, descriptor).map((node) => node.id)).toEqual(['nearby'])
    })

    it('should filter full-text search queries by token prefixes', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        search: 'proj road'
      })
      const nodes = [
        createMockNode('matching', {
          title: 'Project plan',
          description: 'Roadmap kickoff'
        }),
        createMockNode('partial', {
          title: 'Project plan',
          description: 'Status update'
        })
      ]

      expect(applyQueryDescriptor(nodes, descriptor).map((node) => node.id)).toEqual(['matching'])
    })

    it('should honor search field selection', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        search: { text: 'road', fields: ['title'] }
      })
      const nodes = [
        createMockNode('title-match', {
          title: 'Roadmap',
          description: 'No relevant body'
        }),
        createMockNode('content-match', {
          title: 'Plan',
          description: 'Roadmap details'
        })
      ]

      expect(applyQueryDescriptor(nodes, descriptor).map((node) => node.id)).toEqual([
        'title-match'
      ])
    })

    it('should remove nodes that move outside a spatial window', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        spatial: {
          kind: 'window',
          rect: { x: 0, y: 0, width: 200, height: 200 },
          fields: { x: 'x', y: 'y', width: 'width', height: 'height' }
        }
      })
      const existing = createMockNode('task-1', {
        title: 'Task',
        x: 20,
        y: 20,
        width: 40,
        height: 40
      })
      const updated = createMockNode('task-1', {
        title: 'Task',
        x: 420,
        y: 420,
        width: 40,
        height: 40
      })

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

    it('should remove nodes that stop matching a search query', () => {
      const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
        search: 'road'
      })
      const existing = createMockNode('task-1', {
        title: 'Project',
        description: 'Roadmap'
      })
      const updated = createMockNode('task-1', {
        title: 'Project',
        description: 'Status'
      })

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
  })
})
