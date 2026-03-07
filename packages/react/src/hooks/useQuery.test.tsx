/**
 * Tests for useQuery hook
 */
import type { DID } from '@xnetjs/core'
import type { DataBridge, QueryDescriptor } from '@xnetjs/data-bridge'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  defineSchema,
  text,
  select,
  MemoryNodeStorageAdapter,
  type DefinedSchema,
  type NodeState,
  type PropertyBuilder
} from '@xnetjs/data'
import { createQueryDescriptor, serializeQueryDescriptor } from '@xnetjs/data-bridge'
import { generateIdentity, type Identity } from '@xnetjs/identity'
import React, { type ReactNode, useMemo } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DataBridgeContext, XNetProvider } from '../context'
import { useMutate } from './useMutate'
import { useQuery } from './useQuery'

// Test schema
const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://test/',
  properties: {
    title: text({ required: true }),
    status: select({
      options: [
        { id: 'todo', name: 'To Do' },
        { id: 'in-progress', name: 'In Progress' },
        { id: 'done', name: 'Done' }
      ] as const
    })
  }
})

describe('useQuery', () => {
  let identityResult: { identity: Identity; privateKey: Uint8Array }
  let did: DID
  let storage: MemoryNodeStorageAdapter

  beforeEach(() => {
    identityResult = generateIdentity()
    did = identityResult.identity.did as DID
    storage = new MemoryNodeStorageAdapter()
  })

  function createWrapper() {
    const currentStorage = storage
    const currentDid = did
    const currentKey = identityResult.privateKey

    return function Wrapper({ children }: { children: ReactNode }) {
      const stableStorage = useMemo(() => currentStorage, [])

      return (
        <XNetProvider
          config={{ nodeStorage: stableStorage, authorDID: currentDid, signingKey: currentKey }}
        >
          {children}
        </XNetProvider>
      )
    }
  }

  function createTaskNode(
    id: string,
    title: string,
    status: 'todo' | 'in-progress' | 'done'
  ): NodeState {
    const now = Date.now()

    return {
      id,
      schemaId: TaskSchema._schemaId,
      properties: { title, status },
      timestamps: {
        title: { lamport: { time: 1, author: did }, wallTime: now },
        status: { lamport: { time: 1, author: did }, wallTime: now }
      },
      createdAt: now,
      createdBy: did,
      updatedAt: now,
      updatedBy: did,
      deleted: false
    }
  }

  function createMockBridge() {
    const snapshots = new Map<string, NodeState[] | null>()
    const listeners = new Map<string, Set<() => void>>()
    const pendingReloads = new Map<string, NodeState[]>()

    const notify = (queryId: string) => {
      for (const listener of listeners.get(queryId) ?? []) {
        listener()
      }
    }

    const getQueryId = <P extends Record<string, PropertyBuilder>>(
      schema: DefinedSchema<P>,
      filter?: string | Record<string, unknown>
    ) => {
      const options =
        typeof filter === 'string'
          ? { nodeId: filter }
          : (filter as Record<string, unknown> | undefined)

      return serializeQueryDescriptor(
        createQueryDescriptor(
          schema._schemaId,
          options as Parameters<typeof createQueryDescriptor>[1]
        )
      )
    }

    const reloadQuery = vi.fn(async (descriptor: QueryDescriptor) => {
      const queryId = serializeQueryDescriptor(descriptor)
      snapshots.set(queryId, pendingReloads.get(queryId) ?? [])
      notify(queryId)
    })

    const bridge: DataBridge = {
      query(schema, options) {
        const descriptor = createQueryDescriptor(schema._schemaId, options)
        const queryId = serializeQueryDescriptor(descriptor)

        if (!snapshots.has(queryId)) {
          snapshots.set(queryId, [])
        }

        return {
          getSnapshot: () => snapshots.get(queryId) ?? null,
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
      reloadQuery,
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
      destroy() {},
      status: 'connected',
      on() {
        return () => {}
      }
    }

    return {
      bridge,
      reloadQuery,
      setSnapshot<P extends Record<string, PropertyBuilder>>(
        schema: DefinedSchema<P>,
        filter: string | Record<string, unknown> | undefined,
        data: NodeState[] | null
      ) {
        snapshots.set(getQueryId(schema, filter), data)
      },
      setReloadResult<P extends Record<string, PropertyBuilder>>(
        schema: DefinedSchema<P>,
        filter: string | Record<string, unknown> | undefined,
        data: NodeState[]
      ) {
        pendingReloads.set(getQueryId(schema, filter), data)
      }
    }
  }

  describe('list query', () => {
    it('should return empty array initially', async () => {
      const wrapper = createWrapper()

      const { result } = renderHook(() => useQuery(TaskSchema), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.data).toEqual([])
      expect(result.current.error).toBeNull()
    })

    it('should return all nodes of schema', async () => {
      const wrapper = createWrapper()

      const { result } = renderHook(
        () => ({
          query: useQuery(TaskSchema),
          mutate: useMutate()
        }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.query.loading).toBe(false)
      })

      // Create tasks
      await act(async () => {
        await result.current.mutate.create(TaskSchema, { title: 'Task 1', status: 'todo' })
        await result.current.mutate.create(TaskSchema, { title: 'Task 2', status: 'done' })
      })

      await act(async () => {
        await result.current.query.reload()
      })

      expect(result.current.query.data).toHaveLength(2)
    })
  })

  describe('single query', () => {
    it('should return null for non-existent ID', async () => {
      const wrapper = createWrapper()

      const { result } = renderHook(() => useQuery(TaskSchema, 'non-existent'), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.data).toBeNull()
    })

    it('should return node by ID', async () => {
      const wrapper = createWrapper()

      const { result } = renderHook(
        () => ({
          list: useQuery(TaskSchema),
          mutate: useMutate()
        }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.list.loading).toBe(false)
      })

      // Create a task
      await act(async () => {
        await result.current.mutate.create(TaskSchema, {
          title: 'Test Task',
          status: 'todo'
        })
      })

      await act(async () => {
        await result.current.list.reload()
      })

      let taskId: string | undefined
      await waitFor(() => {
        const created = result.current.list.data.find((task) => task.title === 'Test Task')
        expect(created).toBeDefined()
        taskId = created?.id
      })

      // Now query by ID in a new hook
      const { result: queryResult } = renderHook(() => useQuery(TaskSchema, taskId!), { wrapper })

      await waitFor(() => {
        expect(queryResult.current.loading).toBe(false)
      })

      await act(async () => {
        await queryResult.current.reload()
      })

      expect(queryResult.current.data).not.toBeNull()
      expect(queryResult.current.data?.title).toBe('Test Task')
    })
  })

  describe('filtered query', () => {
    it('should filter by where clause', async () => {
      const wrapper = createWrapper()

      const { result } = renderHook(
        () => ({
          all: useQuery(TaskSchema),
          done: useQuery(TaskSchema, { where: { status: 'done' } }),
          mutate: useMutate()
        }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.all.loading).toBe(false)
      })

      // Create tasks with different statuses
      await act(async () => {
        await result.current.mutate.create(TaskSchema, { title: 'Task 1', status: 'todo' })
        await result.current.mutate.create(TaskSchema, { title: 'Task 2', status: 'done' })
        await result.current.mutate.create(TaskSchema, { title: 'Task 3', status: 'done' })
      })

      await act(async () => {
        await result.current.all.reload()
        await result.current.done.reload()
      })

      expect(result.current.all.data).toHaveLength(3)
      expect(result.current.done.data).toHaveLength(2)
    })
  })

  describe('reload', () => {
    it('should call bridge.reloadQuery with the canonical descriptor and refresh data', async () => {
      const mock = createMockBridge()
      const doneNode = createTaskNode('done-1', 'Done Task', 'done')
      mock.setSnapshot(TaskSchema, { where: { status: 'done' } }, [])
      mock.setReloadResult(TaskSchema, { where: { status: 'done' } }, [doneNode])

      const wrapper = ({ children }: { children: ReactNode }) => (
        <DataBridgeContext.Provider value={mock.bridge}>{children}</DataBridgeContext.Provider>
      )

      const { result } = renderHook(() => useQuery(TaskSchema, { where: { status: 'done' } }), {
        wrapper
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      act(() => {
        result.current.reload()
      })

      await waitFor(() => {
        expect(result.current.data).toHaveLength(1)
      })

      expect(mock.reloadQuery).toHaveBeenCalledWith(
        createQueryDescriptor(TaskSchema._schemaId, {
          where: { status: 'done' }
        })
      )
      expect(result.current.data[0]?.title).toBe('Done Task')
    })
  })
})
