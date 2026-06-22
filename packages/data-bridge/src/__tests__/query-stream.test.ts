/**
 * Tests for query stream event reducers.
 */

import type { NodeState, SchemaIRI } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  createQueryStreamState,
  reduceQueryStreamEvent,
  reduceQueryStreamEvents
} from '../query-stream'

const TEST_SCHEMA_ID = 'xnet://test/Task' as SchemaIRI

function createMockNode(id: string, title = id): NodeState {
  const now = Date.now()

  return {
    id,
    schemaId: TEST_SCHEMA_ID,
    properties: { title },
    timestamps: {
      title: { lamport: 1, author: 'did:key:test', wallTime: now }
    },
    createdAt: now,
    createdBy: 'did:key:test',
    updatedAt: now,
    updatedBy: 'did:key:test',
    deleted: false
  }
}

describe('query-stream', () => {
  it('should reduce snapshot events into ready data', () => {
    const first = createMockNode('task-1')
    const second = createMockNode('task-2')

    const state = reduceQueryStreamEvent(createQueryStreamState(), {
      type: 'snapshot',
      nodes: [first, second]
    })

    expect(state).toMatchObject({
      data: [first, second],
      error: null,
      status: 'ready'
    })
  })

  it('should insert nodes deterministically and dedupe by id', () => {
    const first = createMockNode('task-1', 'First')
    const second = createMockNode('task-2', 'Second')
    const replacement = createMockNode('task-1', 'Replacement')

    const state = reduceQueryStreamEvents(createQueryStreamState(), [
      { type: 'snapshot', nodes: [first] },
      { type: 'insert', node: second, index: 0 },
      { type: 'insert', node: replacement }
    ])

    expect(state.data?.map((node) => node.properties.title)).toEqual(['Second', 'Replacement'])
  })

  it('should update and delete existing nodes', () => {
    const first = createMockNode('task-1', 'First')
    const second = createMockNode('task-2', 'Second')
    const updated = createMockNode('task-2', 'Updated')

    const state = reduceQueryStreamEvents(createQueryStreamState(), [
      { type: 'snapshot', nodes: [first, second] },
      { type: 'update', nodeId: 'task-2', node: updated },
      { type: 'delete', nodeId: 'task-1' }
    ])

    expect(state.data?.map((node) => node.properties.title)).toEqual(['Updated'])
  })

  it('should reset to loading or replacement snapshots', () => {
    const first = createMockNode('task-1', 'First')
    const replacement = createMockNode('task-2', 'Replacement')
    const ready = reduceQueryStreamEvent(createQueryStreamState(), {
      type: 'snapshot',
      nodes: [first]
    })

    const loading = reduceQueryStreamEvent(ready, {
      type: 'reset',
      reason: 'reconnect'
    })
    const replaced = reduceQueryStreamEvent(loading, {
      type: 'reset',
      reason: 'server-reset',
      nodes: [replacement]
    })

    expect(loading).toMatchObject({
      data: null,
      status: 'loading',
      error: null
    })
    expect(replaced).toMatchObject({
      data: [replacement],
      status: 'ready'
    })
  })

  it('should preserve data while recording progress events', () => {
    const first = createMockNode('task-1', 'First')
    const state = reduceQueryStreamEvents(createQueryStreamState(), [
      { type: 'snapshot', nodes: [first] },
      {
        type: 'progress',
        progress: {
          phase: 'catching-up',
          loaded: 5,
          total: 10
        }
      }
    ])

    expect(state).toMatchObject({
      data: [first],
      progress: {
        phase: 'catching-up',
        loaded: 5,
        total: 10
      },
      status: 'ready'
    })
  })

  it('should keep recoverable errors non-terminal and non-recoverable errors terminal', () => {
    const first = createMockNode('task-1', 'First')
    const ready = reduceQueryStreamEvent(createQueryStreamState(), {
      type: 'snapshot',
      nodes: [first]
    })
    const recoverable = reduceQueryStreamEvent(ready, {
      type: 'error',
      error: 'temporarily offline',
      recoverable: true
    })
    const terminal = reduceQueryStreamEvent(recoverable, {
      type: 'error',
      error: 'permission denied',
      code: 'AUTH_DENIED'
    })

    expect(recoverable).toMatchObject({
      data: [first],
      error: 'temporarily offline',
      status: 'ready'
    })
    expect(terminal).toMatchObject({
      data: [first],
      error: 'permission denied',
      status: 'error'
    })
  })
})
