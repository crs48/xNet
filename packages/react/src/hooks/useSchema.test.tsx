/**
 * Tests for useSchema and useSingleNode hooks
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React, { type ReactNode, useMemo } from 'react'
import { defineSchema, text, select, checkbox, MemoryNodeStorageAdapter } from '@xnet/data'
import { generateIdentity, type Identity } from '@xnet/identity'
import type { DID } from '@xnet/core'
import { NodeStoreProvider } from './useNodeStore'
import { useSchema, useSingleNode } from './useSchema'

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
    }),
    completed: checkbox()
  }
})

describe('useSchema', () => {
  // Each test gets fresh identity and storage
  let identityResult: { identity: Identity; privateKey: Uint8Array }
  let did: DID
  let storage: MemoryNodeStorageAdapter

  beforeEach(() => {
    identityResult = generateIdentity()
    did = identityResult.identity.did as DID
    storage = new MemoryNodeStorageAdapter()
  })

  function createWrapper() {
    // Capture current values from closure
    const currentStorage = storage
    const currentDid = did
    const currentKey = identityResult.privateKey

    return function Wrapper({ children }: { children: ReactNode }) {
      // Memoize storage to prevent re-creation on re-renders
      const stableStorage = useMemo(() => currentStorage, [])

      return (
        <NodeStoreProvider storage={stableStorage} authorDID={currentDid} signingKey={currentKey}>
          {children}
        </NodeStoreProvider>
      )
    }
  }

  it('should start with empty nodes array', async () => {
    const { result } = renderHook(() => useSchema(TaskSchema), {
      wrapper: createWrapper()
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.nodes).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('should create a typed node', async () => {
    const { result } = renderHook(() => useSchema(TaskSchema), {
      wrapper: createWrapper()
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let created: Awaited<ReturnType<typeof result.current.create>>

    await act(async () => {
      created = await result.current.create({
        title: 'Test Task',
        status: 'todo',
        completed: false
      })
    })

    expect(created).not.toBeNull()
    expect(created?.properties.title).toBe('Test Task')
    expect(created?.properties.status).toBe('todo')

    // Should be in the nodes array
    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].properties.title).toBe('Test Task')
  })

  it('should update a node', async () => {
    const { result } = renderHook(() => useSchema(TaskSchema), {
      wrapper: createWrapper()
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Create a task
    let task: Awaited<ReturnType<typeof result.current.create>>
    await act(async () => {
      task = await result.current.create({
        title: 'Test Task',
        status: 'todo'
      })
    })

    // Update it
    await act(async () => {
      await result.current.update(task!.id, { status: 'done' })
    })

    expect(result.current.nodes[0].properties.status).toBe('done')
  })

  it('should delete a node', async () => {
    const { result } = renderHook(() => useSchema(TaskSchema), {
      wrapper: createWrapper()
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Create a task
    let task: Awaited<ReturnType<typeof result.current.create>>
    await act(async () => {
      task = await result.current.create({
        title: 'Test Task',
        status: 'todo'
      })
    })

    expect(result.current.nodes).toHaveLength(1)

    // Delete it
    await act(async () => {
      await result.current.remove(task!.id)
    })

    // Should be removed from nodes (default excludes deleted)
    expect(result.current.nodes).toHaveLength(0)
  })

  it('should execute a transaction', async () => {
    const { result } = renderHook(() => useSchema(TaskSchema), {
      wrapper: createWrapper()
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Execute transaction to create multiple tasks
    await act(async () => {
      await result.current.transaction([
        { type: 'create', properties: { title: 'Task 1', status: 'todo' } },
        { type: 'create', properties: { title: 'Task 2', status: 'in-progress' } },
        { type: 'create', properties: { title: 'Task 3', status: 'done' } }
      ])
    })

    expect(result.current.nodes).toHaveLength(3)
  })

  it('should get node by ID', async () => {
    const { result } = renderHook(() => useSchema(TaskSchema), {
      wrapper: createWrapper()
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let task: Awaited<ReturnType<typeof result.current.create>>
    await act(async () => {
      task = await result.current.create({
        title: 'Test Task',
        status: 'todo'
      })
    })

    const found = result.current.getById(task!.id)
    expect(found).toBeDefined()
    expect(found?.properties.title).toBe('Test Task')
  })
})

describe('useSingleNode', () => {
  // Each test gets fresh identity and storage
  let identityResult: { identity: Identity; privateKey: Uint8Array }
  let did: DID
  let storage: MemoryNodeStorageAdapter

  beforeEach(() => {
    identityResult = generateIdentity()
    did = identityResult.identity.did as DID
    storage = new MemoryNodeStorageAdapter()
  })

  function createWrapper() {
    // Capture current values from closure
    const currentStorage = storage
    const currentDid = did
    const currentKey = identityResult.privateKey

    return function Wrapper({ children }: { children: ReactNode }) {
      // Memoize storage to prevent re-creation on re-renders
      const stableStorage = useMemo(() => currentStorage, [])

      return (
        <NodeStoreProvider storage={stableStorage} authorDID={currentDid} signingKey={currentKey}>
          {children}
        </NodeStoreProvider>
      )
    }
  }

  it('should return null for non-existent node', async () => {
    const { result } = renderHook(() => useSingleNode(TaskSchema, 'non-existent-id'), {
      wrapper: createWrapper()
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.node).toBeNull()
  })

  it('should return null for null nodeId', async () => {
    const { result } = renderHook(() => useSingleNode(TaskSchema, null), {
      wrapper: createWrapper()
    })

    // Should not be loading if nodeId is null
    expect(result.current.node).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('should load and update an existing node', async () => {
    // Create wrapper once to share between hooks
    const wrapper = createWrapper()

    // First create a task using useSchema
    const { result: schemaResult } = renderHook(() => useSchema(TaskSchema), {
      wrapper
    })

    await waitFor(() => {
      expect(schemaResult.current.loading).toBe(false)
    })

    let taskId: string
    await act(async () => {
      const task = await schemaResult.current.create({
        title: 'Update Test',
        status: 'todo'
      })
      taskId = task!.id
    })

    // Use single node hook with the same wrapper (same store)
    const { result } = renderHook(() => useSingleNode(TaskSchema, taskId!), {
      wrapper
    })

    await waitFor(() => {
      expect(result.current.node).not.toBeNull()
    })

    expect(result.current.node?.properties.title).toBe('Update Test')

    // Update via single node hook
    await act(async () => {
      await result.current.update({ status: 'done', completed: true })
    })

    expect(result.current.node?.properties.status).toBe('done')
    expect(result.current.node?.properties.completed).toBe(true)
  })
})
