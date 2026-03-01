/**
 * Tests for useMutate hook
 */
import type { DID } from '@xnet/core'
import type { DataBridge, QueryOptions, QuerySubscription, SyncStatus } from '@xnet/data-bridge'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  defineSchema,
  text,
  select,
  relation,
  MemoryNodeStorageAdapter,
  type DefinedSchema,
  type PropertyBuilder,
  type NodeState
} from '@xnet/data'
import { generateIdentity, type Identity } from '@xnet/identity'
import React, { type ReactNode, useMemo } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { XNetProvider } from '../context'
import { useMutate } from './useMutate'
import { useQuery } from './useQuery'

// Test schemas
const ProjectSchema = defineSchema({
  name: 'Project',
  namespace: 'xnet://test/',
  properties: {
    name: text({ required: true })
  }
})

const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://test/',
  properties: {
    title: text({ required: true }),
    status: select({
      options: [
        { id: 'todo', name: 'To Do' },
        { id: 'done', name: 'Done' }
      ] as const
    }),
    projectId: relation({ target: ProjectSchema._schemaId })
  }
})

describe('useMutate', () => {
  let identityResult: { identity: Identity; privateKey: Uint8Array }
  let did: DID
  let storage: MemoryNodeStorageAdapter

  beforeEach(() => {
    identityResult = generateIdentity()
    did = identityResult.identity.did as DID
    storage = new MemoryNodeStorageAdapter()
  })

  function createWrapper(customDataBridge?: DataBridge) {
    const currentStorage = storage
    const currentDid = did
    const currentKey = identityResult.privateKey

    return function Wrapper({ children }: { children: ReactNode }) {
      const stableStorage = useMemo(() => currentStorage, [])

      return (
        <XNetProvider
          config={{
            nodeStorage: stableStorage,
            authorDID: currentDid,
            signingKey: currentKey,
            disableSyncManager: true,
            dataBridge: customDataBridge
          }}
        >
          {children}
        </XNetProvider>
      )
    }
  }

  describe('create', () => {
    it('should create a node with typed schema', async () => {
      const wrapper = createWrapper()

      const { result } = renderHook(
        () => ({
          mutate: useMutate(),
          query: useQuery(TaskSchema)
        }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.query.loading).toBe(false)
      })

      let created: Awaited<ReturnType<typeof result.current.mutate.create>> | null = null
      await act(async () => {
        created = await result.current.mutate.create(TaskSchema, {
          title: 'New Task',
          status: 'todo'
        })
      })

      expect(created).not.toBeNull()
      expect(created!.title).toBe('New Task')
      expect(created!.status).toBe('todo')

      // Verify via reload
      await act(async () => {
        await result.current.query.reload()
      })

      expect(result.current.query.data).toHaveLength(1)
    })
  })

  describe('update', () => {
    it('should update a node by ID', async () => {
      const wrapper = createWrapper()

      const { result } = renderHook(
        () => ({
          mutate: useMutate(),
          query: useQuery(TaskSchema)
        }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.query.loading).toBe(false)
      })

      // Create first
      let taskId: string
      await act(async () => {
        const task = await result.current.mutate.create(TaskSchema, {
          title: 'Original',
          status: 'todo'
        })
        taskId = task!.id
      })

      // Update
      await act(async () => {
        await result.current.mutate.update(TaskSchema, taskId!, { status: 'done' })
      })

      // Verify
      await act(async () => {
        await result.current.query.reload()
      })

      expect(result.current.query.data[0].status).toBe('done')
    })
  })

  describe('remove', () => {
    it('should soft delete a node', async () => {
      const wrapper = createWrapper()

      const { result } = renderHook(
        () => ({
          mutate: useMutate(),
          query: useQuery(TaskSchema)
        }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.query.loading).toBe(false)
      })

      // Create
      let taskId: string
      await act(async () => {
        const task = await result.current.mutate.create(TaskSchema, {
          title: 'To Delete',
          status: 'todo'
        })
        taskId = task!.id
      })

      await act(async () => {
        await result.current.query.reload()
      })
      expect(result.current.query.data).toHaveLength(1)

      // Delete
      await act(async () => {
        await result.current.mutate.remove(taskId!)
      })

      // Verify - deleted nodes not returned by default
      await act(async () => {
        await result.current.query.reload()
      })

      expect(result.current.query.data).toHaveLength(0)
    })
  })

  describe('restore', () => {
    it('should restore a deleted node', async () => {
      const wrapper = createWrapper()

      const { result } = renderHook(
        () => ({
          mutate: useMutate(),
          query: useQuery(TaskSchema)
        }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.query.loading).toBe(false)
      })

      // Create and delete
      let taskId: string
      await act(async () => {
        const task = await result.current.mutate.create(TaskSchema, {
          title: 'To Restore',
          status: 'todo'
        })
        taskId = task!.id
        await result.current.mutate.remove(taskId!)
      })

      await act(async () => {
        await result.current.query.reload()
      })
      expect(result.current.query.data).toHaveLength(0)

      // Restore
      await act(async () => {
        await result.current.mutate.restore(taskId!)
      })

      await act(async () => {
        await result.current.query.reload()
      })

      expect(result.current.query.data).toHaveLength(1)
    })
  })

  describe('mutate (transactions)', () => {
    it('should execute multiple operations atomically', async () => {
      const wrapper = createWrapper()

      const { result } = renderHook(
        () => ({
          mutate: useMutate(),
          tasks: useQuery(TaskSchema),
          projects: useQuery(ProjectSchema)
        }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.tasks.loading).toBe(false)
        expect(result.current.projects.loading).toBe(false)
      })

      // Create across schemas in one transaction
      let txResult: Awaited<ReturnType<typeof result.current.mutate.mutate>> | null = null
      await act(async () => {
        txResult = await result.current.mutate.mutate([
          { type: 'create', schema: TaskSchema, data: { title: 'Task 1', status: 'todo' } },
          { type: 'create', schema: TaskSchema, data: { title: 'Task 2', status: 'done' } },
          { type: 'create', schema: ProjectSchema, data: { name: 'Project 1' } }
        ])
      })

      expect(txResult).not.toBeNull()
      expect(txResult!.results).toHaveLength(3)

      await act(async () => {
        await result.current.tasks.reload()
        await result.current.projects.reload()
      })

      expect(result.current.tasks.data).toHaveLength(2)
      expect(result.current.projects.data).toHaveLength(1)
    })

    it('should support update and delete in transactions', async () => {
      const wrapper = createWrapper()

      const { result } = renderHook(
        () => ({
          mutate: useMutate(),
          tasks: useQuery(TaskSchema)
        }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.tasks.loading).toBe(false)
      })

      // Create initial tasks
      let task1Id: string
      let task2Id: string
      await act(async () => {
        const t1 = await result.current.mutate.create(TaskSchema, {
          title: 'Task 1',
          status: 'todo'
        })
        const t2 = await result.current.mutate.create(TaskSchema, {
          title: 'Task 2',
          status: 'todo'
        })
        task1Id = t1!.id
        task2Id = t2!.id
      })

      // Update one, delete another, create a new one
      await act(async () => {
        await result.current.mutate.mutate([
          { type: 'update', id: task1Id!, data: { status: 'done' } },
          { type: 'delete', id: task2Id! },
          { type: 'create', schema: TaskSchema, data: { title: 'Task 3', status: 'todo' } }
        ])
      })

      await act(async () => {
        await result.current.tasks.reload()
      })

      // Should have 2 tasks (task1 updated, task2 deleted, task3 new)
      expect(result.current.tasks.data).toHaveLength(2)

      const task1 = result.current.tasks.data.find((t: { id: string }) => t.id === task1Id)
      expect(task1?.status).toBe('done')
    })

    it('should return temp ID mappings when transaction backend is available', async () => {
      const wrapper = createWrapper()

      const { result } = renderHook(
        () => ({
          mutate: useMutate(),
          tasks: useQuery(TaskSchema),
          projects: useQuery(ProjectSchema)
        }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.tasks.loading).toBe(false)
        expect(result.current.projects.loading).toBe(false)
      })

      let txResult: Awaited<ReturnType<typeof result.current.mutate.mutate>> | null = null
      await act(async () => {
        txResult = await result.current.mutate.mutate([
          {
            type: 'create',
            id: '~project',
            schema: ProjectSchema,
            data: { name: 'Alpha' }
          },
          {
            type: 'create',
            schema: TaskSchema,
            data: { title: 'Linked task', status: 'todo', projectId: '~project' }
          }
        ])
      })

      expect(txResult).not.toBeNull()
      expect(txResult!.batchId).toBeTruthy()
      expect(txResult!.tempIds).toBeDefined()
      expect(txResult!.tempIds?.['~project']).toBeDefined()

      const projectId = txResult!.tempIds!['~project']
      const taskNode = txResult!.results[1]
      expect(taskNode?.properties.projectId).toBe(projectId)
    })

    it('should throw when temp IDs are used without transaction backend support', async () => {
      const fakeBridge = createSequentialBridgeWithoutTransactions()
      const wrapper = createWrapper(fakeBridge)

      const { result } = renderHook(
        () => ({
          mutate: useMutate(),
          query: useQuery(TaskSchema)
        }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.query.loading).toBe(false)
      })

      await expect(
        result.current.mutate.mutate([
          {
            type: 'create',
            id: '~task',
            schema: TaskSchema,
            data: { title: 'Task with temp id', status: 'todo' }
          }
        ])
      ).rejects.toThrow('Temp IDs in useMutate.mutate() require a transaction-capable bridge')
    })
  })
})

function createSequentialBridgeWithoutTransactions(): DataBridge {
  const nodes = new Map<string, NodeState>()
  let currentStatus: SyncStatus = 'connected'
  const emptySnapshot: NodeState[] = []

  function unsupportedQuery<P extends Record<string, PropertyBuilder>>(): QuerySubscription<P> {
    return {
      getSnapshot: () => emptySnapshot,
      subscribe: () => () => {}
    }
  }

  return {
    get status() {
      return currentStatus
    },
    query<P extends Record<string, PropertyBuilder>>(
      _schema: DefinedSchema<P>,
      _options?: QueryOptions<P>
    ): QuerySubscription<P> {
      return unsupportedQuery<P>()
    },
    async create<P extends Record<string, PropertyBuilder>>(
      schema: DefinedSchema<P>,
      data: Record<string, unknown>,
      id?: string
    ): Promise<NodeState> {
      const nodeId = id ?? `node-${nodes.size + 1}`
      const now = Date.now()
      const node: NodeState = {
        id: nodeId,
        schemaId: schema._schemaId,
        properties: data,
        timestamps: {},
        deleted: false,
        createdAt: now,
        createdBy: 'did:key:test',
        updatedAt: now,
        updatedBy: 'did:key:test'
      }
      nodes.set(nodeId, node)
      return node
    },
    async update(nodeId: string, changes: Record<string, unknown>): Promise<NodeState> {
      const existing = nodes.get(nodeId)
      if (!existing) throw new Error(`Node not found: ${nodeId}`)
      const updated: NodeState = {
        ...existing,
        properties: { ...existing.properties, ...changes },
        updatedAt: Date.now()
      }
      nodes.set(nodeId, updated)
      return updated
    },
    async delete(nodeId: string): Promise<void> {
      const existing = nodes.get(nodeId)
      if (!existing) throw new Error(`Node not found: ${nodeId}`)
      nodes.set(nodeId, { ...existing, deleted: true, updatedAt: Date.now() })
    },
    async restore(nodeId: string): Promise<NodeState> {
      const existing = nodes.get(nodeId)
      if (!existing) throw new Error(`Node not found: ${nodeId}`)
      const restored: NodeState = { ...existing, deleted: false, updatedAt: Date.now() }
      nodes.set(nodeId, restored)
      return restored
    },
    destroy(): void {
      nodes.clear()
    },
    on(_event: 'status', _handler: (status: SyncStatus) => void): () => void {
      return () => {
        currentStatus = 'disconnected'
      }
    }
  }
}
