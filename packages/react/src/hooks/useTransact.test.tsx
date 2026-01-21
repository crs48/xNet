/**
 * Tests for useTransact hook
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React, { type ReactNode, useMemo } from 'react'
import { defineSchema, text, select, MemoryNodeStorageAdapter } from '@xnet/data'
import { generateIdentity, type Identity } from '@xnet/identity'
import type { DID } from '@xnet/core'
import { NodeStoreProvider } from './useNodeStore'
import { useTransact, createOp } from './useTransact'
import { useSchema } from './useSchema'

// Test schemas
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
    })
  }
})

const ProjectSchema = defineSchema({
  name: 'Project',
  namespace: 'xnet://test/',
  properties: {
    name: text({ required: true })
  }
})

describe('useTransact', () => {
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
        <NodeStoreProvider storage={stableStorage} authorDID={currentDid} signingKey={currentKey}>
          {children}
        </NodeStoreProvider>
      )
    }
  }

  it('should create multiple nodes atomically', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        transact: useTransact(),
        tasks: useSchema(TaskSchema)
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    let txResult: unknown
    await act(async () => {
      txResult = await result.current.transact.transact([
        {
          type: 'create',
          schemaId: TaskSchema._schemaId,
          properties: { title: 'Task 1', status: 'todo' }
        },
        {
          type: 'create',
          schemaId: TaskSchema._schemaId,
          properties: { title: 'Task 2', status: 'done' }
        }
      ])
    })

    expect(txResult).not.toBeNull()

    // Reload to verify data was persisted
    await act(async () => {
      await result.current.tasks.reload()
    })

    expect(result.current.tasks.nodes).toHaveLength(2)
  })

  it('should create nodes across different schemas', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        transact: useTransact(),
        tasks: useSchema(TaskSchema),
        projects: useSchema(ProjectSchema)
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
      expect(result.current.projects.loading).toBe(false)
    })

    let txResult: unknown
    await act(async () => {
      txResult = await result.current.transact.transact([
        { type: 'create', schemaId: TaskSchema._schemaId, properties: { title: 'Task 1' } },
        { type: 'create', schemaId: ProjectSchema._schemaId, properties: { name: 'Project 1' } }
      ])
    })

    expect(txResult).not.toBeNull()

    // Reload both to verify
    await act(async () => {
      await result.current.tasks.reload()
      await result.current.projects.reload()
    })

    expect(result.current.tasks.nodes).toHaveLength(1)
    expect(result.current.projects.nodes).toHaveLength(1)
    expect(result.current.tasks.nodes[0].properties.title).toBe('Task 1')
    expect(result.current.projects.nodes[0].properties.name).toBe('Project 1')
  })

  it('should support typed createOp helper', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        transact: useTransact(),
        tasks: useSchema(TaskSchema)
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    let txResult: unknown
    await act(async () => {
      txResult = await result.current.transact.transact([
        createOp(TaskSchema, { title: 'Typed Task', status: 'todo' })
      ])
    })

    expect(txResult).not.toBeNull()

    await act(async () => {
      await result.current.tasks.reload()
    })

    expect(result.current.tasks.nodes).toHaveLength(1)
    expect(result.current.tasks.nodes[0].properties.title).toBe('Typed Task')
  })

  it('should support update and delete operations', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        transact: useTransact(),
        tasks: useSchema(TaskSchema)
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    // First create a task directly
    let taskId: string
    await act(async () => {
      const task = await result.current.tasks.create({ title: 'Original', status: 'todo' })
      taskId = task!.id
    })

    expect(result.current.tasks.nodes).toHaveLength(1)

    // Update and create in one transaction
    let txResult: unknown
    await act(async () => {
      txResult = await result.current.transact.transact([
        { type: 'update', nodeId: taskId!, properties: { status: 'done' } },
        createOp(TaskSchema, { title: 'New Task', status: 'todo' })
      ])
    })

    expect(txResult).not.toBeNull()

    await act(async () => {
      await result.current.tasks.reload()
    })

    expect(result.current.tasks.nodes).toHaveLength(2)

    const updated = result.current.tasks.nodes.find((n) => n.id === taskId)
    expect(updated?.properties.status).toBe('done')
  })

  it('should return null for empty operations', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useTransact(), { wrapper })

    const emptyResult = await result.current.transact([])
    expect(emptyResult).toBeNull()
  })
})
