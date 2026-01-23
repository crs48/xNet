/**
 * Tests for useQuery hook
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React, { type ReactNode, useMemo } from 'react'
import { defineSchema, text, select, MemoryNodeStorageAdapter } from '@xnet/data'
import { generateIdentity, type Identity } from '@xnet/identity'
import type { DID } from '@xnet/core'
import { XNetProvider } from '../context'
import { useQuery } from './useQuery'
import { useMutate } from './useMutate'

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
          mutate: useMutate(),
          // We'll query by ID after creating
          queryById: (id: string) => useQuery(TaskSchema, id)
        }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.mutate.isPending).toBe(false)
      })

      // Create a task
      let taskId: string
      await act(async () => {
        const task = await result.current.mutate.create(TaskSchema, {
          title: 'Test Task',
          status: 'todo'
        })
        taskId = task!.id
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
})
