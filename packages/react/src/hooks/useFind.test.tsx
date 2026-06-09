/**
 * Tests for useFind hook.
 */

import type { QueryFilter } from './useQuery'
import type { DataBridge, QueryDescriptor, QueryMetadata } from '@xnetjs/data-bridge'
import { renderHook, waitFor } from '@testing-library/react'
import {
  count,
  defineNodeQueryAST,
  defineQuerySetAST,
  defineSchema,
  queryOperators,
  sum,
  number,
  select,
  text,
  type DefinedSchema,
  type NodeState,
  type PropertyBuilder
} from '@xnetjs/data'
import { createQueryDescriptor, serializeQueryDescriptor } from '@xnetjs/data-bridge'
import { type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DataBridgeContext } from '../context'
import { useFind } from './useFind'

const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://test/',
  properties: {
    title: text({ required: true }),
    estimate: number({}),
    status: select({
      options: [
        { id: 'todo', name: 'To Do' },
        { id: 'done', name: 'Done' }
      ] as const
    })
  }
})

function createTaskNode(
  id: string,
  title: string,
  status: 'todo' | 'done',
  estimate = 1
): NodeState {
  const now = Date.now()

  return {
    id,
    schemaId: TaskSchema._schemaId,
    properties: { title, status, estimate },
    timestamps: {},
    createdAt: now,
    createdBy: 'did:key:test',
    updatedAt: now,
    updatedBy: 'did:key:test',
    deleted: false
  }
}

function createMockBridge() {
  const snapshots = new Map<string, NodeState[] | null>()
  const metadata = new Map<string, QueryMetadata | null>()
  const listeners = new Map<string, Set<() => void>>()
  let queryCount = 0

  const getQueryId = <P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    filter?: QueryFilter<P> | Record<string, unknown>
  ) =>
    serializeQueryDescriptor(
      createQueryDescriptor(schema._schemaId, filter as Parameters<typeof createQueryDescriptor>[1])
    )

  const bridge: DataBridge = {
    query(schema, options) {
      queryCount += 1
      const queryId = getQueryId(schema, options)

      return {
        getSnapshot: () => snapshots.get(queryId) ?? null,
        getMetadata: () => metadata.get(queryId) ?? null,
        subscribe: (listener) => {
          const queryListeners = listeners.get(queryId) ?? new Set()
          queryListeners.add(listener)
          listeners.set(queryId, queryListeners)

          return () => {
            queryListeners.delete(listener)
            if (queryListeners.size === 0) {
              listeners.delete(queryId)
            }
          }
        }
      }
    },
    reloadQuery: vi.fn(async (_descriptor: QueryDescriptor) => {}),
    async create() {
      throw new Error('Not implemented in mock bridge')
    },
    async update() {
      throw new Error('Not implemented in mock bridge')
    },
    async delete() {
      throw new Error('Not implemented in mock bridge')
    },
    async restore() {
      throw new Error('Not implemented in mock bridge')
    },
    async bulkWrite() {
      throw new Error('Not implemented in mock bridge')
    },
    destroy() {},
    status: 'connected',
    on() {
      return () => {}
    }
  }

  return {
    bridge,
    getQueryCount: () => queryCount,
    setSnapshot<P extends Record<string, PropertyBuilder>>(
      schema: DefinedSchema<P>,
      filter: QueryFilter<P> | Record<string, unknown>,
      data: NodeState[] | null
    ) {
      snapshots.set(getQueryId(schema, filter), data)
    }
  }
}

function wrapperFor(bridge: DataBridge) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <DataBridgeContext.Provider value={bridge}>{children}</DataBridgeContext.Provider>
  }
}

describe('useFind', () => {
  it('lowers executable node query ASTs into useQuery descriptors', async () => {
    const task = queryOperators<(typeof TaskSchema)['_properties']>()
    const mock = createMockBridge()
    const filter: QueryFilter<(typeof TaskSchema)['_properties']> = {
      where: { status: 'done' },
      orderBy: { title: 'asc' },
      page: { first: 10, count: 'exact' }
    }
    mock.setSnapshot(TaskSchema, filter, [createTaskNode('task-1', 'Closed task', 'done')])

    const ast = defineNodeQueryAST(TaskSchema, {
      where: task.eq('status', 'done'),
      orderBy: { title: 'asc' },
      page: { first: 10, count: 'exact' }
    })

    const { result } = renderHook(() => useFind(TaskSchema, ast), {
      wrapper: wrapperFor(mock.bridge)
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.canExecute).toBe(true)
    expect(result.current.blockers).toEqual([])
    expect(result.current.error).toBeNull()
    expect(result.current.data.map((node) => node.title)).toEqual(['Closed task'])
    expect(mock.getQueryCount()).toBe(1)
  })

  it('executes aggregate metadata over the loaded query snapshot', async () => {
    const mock = createMockBridge()
    mock.setSnapshot(TaskSchema, {}, [
      createTaskNode('task-1', 'First task', 'todo', 2),
      createTaskNode('task-2', 'Second task', 'todo', 3)
    ])
    const ast = defineNodeQueryAST(TaskSchema, {
      aggregates: [count('visibleTasks'), sum('estimate', 'estimateSum')]
    })

    const { result } = renderHook(() => useFind(TaskSchema, ast), {
      wrapper: wrapperFor(mock.bridge)
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.canExecute).toBe(true)
    expect(result.current.status).toBe('success')
    expect(result.current.error).toBeNull()
    expect(result.current.plannerGate.validation.valid).toBe(true)
    expect(result.current.aggregates?.scope).toBe('loaded-snapshot')
    expect(result.current.aggregates?.results.visibleTasks.value).toBe(2)
    expect(result.current.aggregates?.results.estimateSum.value).toBe(5)
    expect(mock.getQueryCount()).toBe(1)
  })

  it('blocks AST features that do not have a React executor yet', async () => {
    const mock = createMockBridge()
    const ast = defineQuerySetAST({
      openTasks: defineNodeQueryAST(TaskSchema, {
        aggregates: [count()]
      })
    })

    const { result } = renderHook(() => useFind(TaskSchema, ast), {
      wrapper: wrapperFor(mock.bridge)
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.canExecute).toBe(false)
    expect(result.current.status).toBe('error')
    expect(result.current.error?.message).toContain('usefind-query-sets-not-executable')
    expect(result.current.data).toEqual([])
    expect(result.current.aggregates).toBeNull()
    expect(mock.getQueryCount()).toBe(0)
  })
})
