/**
 * Tests for useSavedView hook.
 */

import type { QueryFilter, SavedViewSchemaRegistry } from '..'
import type { DataBridge, QueryDescriptor, QueryMetadata } from '@xnetjs/data-bridge'
import { renderHook, waitFor } from '@testing-library/react'
import {
  count,
  defineNodeQueryAST,
  defineQuerySetAST,
  defineSavedViewDescriptor,
  defineSchema,
  number,
  queryOperators,
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
import { useSavedView } from './useSavedView'

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
    }),
    privacyClass: select({
      options: [
        { id: 'public', name: 'Public' },
        { id: 'private-message', name: 'Private Message' }
      ] as const,
      default: 'public'
    })
  }
})

const ProjectSchema = defineSchema({
  name: 'Project',
  namespace: 'xnet://test/',
  properties: {
    title: text({ required: true })
  }
})

function createTaskNode(
  id: string,
  title: string,
  status: 'todo' | 'done',
  estimate = 1,
  privacyClass: 'public' | 'private-message' = 'public'
): NodeState {
  const now = Date.now()

  return {
    id,
    schemaId: TaskSchema._schemaId,
    properties: { title, status, estimate, privacyClass },
    timestamps: {},
    createdAt: now,
    createdBy: 'did:key:test',
    updatedAt: now,
    updatedBy: 'did:key:test',
    deleted: false
  }
}

function createProjectNode(id: string, title: string): NodeState {
  const now = Date.now()

  return {
    id,
    schemaId: ProjectSchema._schemaId,
    properties: { title },
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

const registry = [TaskSchema, ProjectSchema] as SavedViewSchemaRegistry

describe('useSavedView', () => {
  it('parses and executes persisted node query descriptors', async () => {
    const task = queryOperators<(typeof TaskSchema)['_properties']>()
    const mock = createMockBridge()
    const filter: QueryFilter<(typeof TaskSchema)['_properties']> = {
      where: { status: 'done' },
      orderBy: { title: 'asc' },
      page: { first: 10, count: 'exact' }
    }
    mock.setSnapshot(TaskSchema, filter, [
      createTaskNode('task-1', 'Closed task', 'done', 3, 'private-message')
    ])

    const descriptor = defineSavedViewDescriptor({
      title: 'Done Tasks',
      query: defineNodeQueryAST(TaskSchema, {
        where: task.eq('status', 'done'),
        orderBy: { title: 'asc' },
        page: { first: 10, count: 'exact' },
        aggregates: [count('visibleTasks')]
      })
    })

    const { result } = renderHook(() => useSavedView(JSON.stringify(descriptor), registry), {
      wrapper: wrapperFor(mock.bridge)
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.kind).toBe('node')
    expect(result.current.primary?.canExecute).toBe(true)
    expect(result.current.primary?.rowRole).toBe('Task')
    expect(result.current.primary?.data.map((node) => node.title)).toEqual(['Closed task'])
    expect(result.current.primary?.aggregates?.results.visibleTasks.value).toBe(1)
    expect(result.current.privacy.sensitiveCount).toBe(1)
    expect(mock.getQueryCount()).toBe(1)
  })

  it('executes query-set descriptors as multiple named query results', async () => {
    const task = queryOperators<(typeof TaskSchema)['_properties']>()
    const mock = createMockBridge()
    mock.setSnapshot(TaskSchema, { where: { status: 'todo' } }, [
      createTaskNode('task-1', 'Open task', 'todo')
    ])
    mock.setSnapshot(ProjectSchema, {}, [createProjectNode('project-1', 'Launch')])

    const descriptor = defineSavedViewDescriptor({
      title: 'Planning Dashboard',
      query: defineQuerySetAST({
        tasks: defineNodeQueryAST(TaskSchema, {
          where: task.eq('status', 'todo')
        }),
        projects: defineNodeQueryAST(ProjectSchema)
      })
    })

    const { result } = renderHook(() => useSavedView(descriptor, registry), {
      wrapper: wrapperFor(mock.bridge)
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.kind).toBe('query-set')
    expect(result.current.queryIds).toEqual(['tasks', 'projects'])
    expect(result.current.queries.tasks.data.map((node) => node.title)).toEqual(['Open task'])
    expect(result.current.queries.projects.data.map((node) => node.title)).toEqual(['Launch'])
    expect(mock.getQueryCount()).toBe(2)
  })

  it('executes saved lenses with client-side predicates after equality pushdown', async () => {
    const task = queryOperators<(typeof TaskSchema)['_properties']>()
    const mock = createMockBridge()
    const filter: QueryFilter<(typeof TaskSchema)['_properties']> = {
      where: { status: 'todo' },
      orderBy: { title: 'asc' }
    }
    mock.setSnapshot(TaskSchema, filter, [
      createTaskNode('task-1', 'One point', 'todo', 1),
      createTaskNode('task-2', 'Three points', 'todo', 3),
      createTaskNode('task-3', 'Four points', 'todo', 4),
      createTaskNode('task-4', 'Done task', 'done', 3)
    ])

    const descriptor = defineSavedViewDescriptor({
      title: 'Estimated Todo Lens',
      query: defineNodeQueryAST(TaskSchema, {
        where: [task.eq('status', 'todo'), task.between('estimate', 2, 5)],
        orderBy: { title: 'asc' },
        page: { first: 1, count: 'exact' }
      })
    })

    const { result } = renderHook(() => useSavedView(descriptor, registry), {
      wrapper: wrapperFor(mock.bridge)
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.status).toBe('success')
    expect(result.current.primary?.canExecute).toBe(true)
    expect(result.current.primary?.data.map((node) => node.title)).toEqual(['Three points'])
    expect(result.current.primary?.totalCount).toBe(2)
    expect(result.current.primary?.hasMore).toBe(true)
    expect(result.current.primary?.warnings).toContain('usesavedview-client-filter-applied')
    expect(mock.getQueryCount()).toBe(1)
  })
})
