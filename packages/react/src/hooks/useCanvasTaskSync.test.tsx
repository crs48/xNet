import type { DID } from '@xnetjs/core'
import { renderHook, act, waitFor } from '@testing-library/react'
import { MemoryNodeStorageAdapter, TaskSchema } from '@xnetjs/data'
import { generateIdentity, type Identity } from '@xnetjs/identity'
import React, { type ReactNode, useMemo } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { XNetProvider } from '../context'
import { useCanvasTaskSync } from './useCanvasTaskSync'
import { usePageTaskSync } from './usePageTaskSync'
import { useQuery } from './useQuery'

describe('useCanvasTaskSync', () => {
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
          config={{
            nodeStorage: stableStorage,
            authorDID: currentDid,
            signingKey: currentKey,
            disableSyncManager: true
          }}
        >
          {children}
        </XNetProvider>
      )
    }
  }

  it('creates canvas-hosted task nodes from checklist snapshots', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        sync: useCanvasTaskSync({ canvasId: 'canvas-1', debounceMs: 0 }),
        tasks: useQuery(TaskSchema, { where: { canvas: 'canvas-1' } })
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    await act(async () => {
      result.current.sync.handleTasksChange([
        {
          taskId: 'task_canvas_1',
          blockId: 'checklist_object_1',
          title: 'Canvas task',
          completed: false,
          parentTaskId: null,
          sortKey: '0000',
          assignees: [did],
          dueDate: '2026-07-01',
          references: []
        }
      ])
    })

    await waitFor(() => {
      expect(result.current.tasks.data).toHaveLength(1)
    })

    expect(result.current.tasks.data[0]).toMatchObject({
      id: 'task_canvas_1',
      title: 'Canvas task',
      canvas: 'canvas-1',
      anchorBlockId: 'checklist_object_1',
      source: 'canvas',
      assignee: did
    })
  })

  it('claims a page-hosted task when it moves onto a canvas', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        pageSync: usePageTaskSync({ pageId: 'page-1', debounceMs: 0 }),
        canvasSync: useCanvasTaskSync({ canvasId: 'canvas-1', debounceMs: 0 }),
        tasks: useQuery(TaskSchema, { includeDeleted: true })
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    const item = {
      taskId: 'task_migrating',
      blockId: 'block_page',
      title: 'Migrating task',
      completed: false,
      parentTaskId: null,
      sortKey: '0000',
      assignees: [],
      dueDate: null,
      references: []
    }

    await act(async () => {
      result.current.pageSync.handleTasksChange([item])
    })

    await waitFor(() => {
      const task = result.current.tasks.data.find((node) => node.id === 'task_migrating')
      expect(task).toMatchObject({ page: 'page-1', source: 'page' })
    })

    // Cut from the page, paste onto the canvas.
    await act(async () => {
      result.current.pageSync.handleTasksChange([])
      result.current.canvasSync.handleTasksChange([{ ...item, blockId: 'checklist_object_9' }])
    })

    await waitFor(() => {
      const matches = result.current.tasks.data.filter((node) => node.id === 'task_migrating')
      expect(matches).toHaveLength(1)
      expect(matches[0]).toMatchObject({
        canvas: 'canvas-1',
        source: 'canvas',
        anchorBlockId: 'checklist_object_9'
      })
      expect(matches[0]?.deleted).toBeFalsy()
    })
  })
})
