import type { DID } from '@xnetjs/core'
import { renderHook, act, waitFor } from '@testing-library/react'
import { MemoryNodeStorageAdapter } from '@xnetjs/data'
import { generateIdentity, type Identity } from '@xnetjs/identity'
import React, { type ReactNode, useMemo } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { XNetProvider } from '../context'
import { usePageTaskSync } from './usePageTaskSync'
import { useTasks } from './useTasks'

describe('useTasks', () => {
  let identityResult: { identity: Identity; privateKey: Uint8Array }
  let did: DID
  let otherDid: DID
  let storage: MemoryNodeStorageAdapter

  beforeEach(() => {
    identityResult = generateIdentity()
    did = identityResult.identity.did as DID
    otherDid = generateIdentity().identity.did as DID
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

  it('filters tasks by page and assignee while preserving task hierarchy', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        syncPage1: usePageTaskSync({ pageId: 'page-1', debounceMs: 0 }),
        syncPage2: usePageTaskSync({ pageId: 'page-2', debounceMs: 0 }),
        pageTasks: useTasks({ pageId: 'page-1' }),
        myTasks: useTasks({ assigneeDid: did, includeCompleted: false })
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.pageTasks.loading).toBe(false)
      expect(result.current.myTasks.loading).toBe(false)
    })

    await act(async () => {
      result.current.syncPage1.handleTasksChange([
        {
          taskId: 'task_parent',
          blockId: 'block_parent',
          title: 'Parent',
          completed: false,
          parentTaskId: null,
          sortKey: '0000',
          assignees: [did],
          dueDate: null,
          references: []
        },
        {
          taskId: 'task_child',
          blockId: 'block_child',
          title: 'Child',
          completed: false,
          parentTaskId: 'task_parent',
          sortKey: '0000.0000',
          assignees: [otherDid],
          dueDate: null,
          references: []
        }
      ])
      result.current.syncPage2.handleTasksChange([
        {
          taskId: 'task_shared',
          blockId: 'block_shared',
          title: 'Shared',
          completed: false,
          parentTaskId: null,
          sortKey: '0000',
          assignees: [otherDid, did],
          dueDate: '2026-03-21',
          references: []
        }
      ])
    })

    await waitFor(() => {
      expect(result.current.pageTasks.data).toHaveLength(2)
      expect(result.current.myTasks.data).toHaveLength(2)
    })

    expect(result.current.pageTasks.data.map((task) => task.id)).toEqual([
      'task_parent',
      'task_child'
    ])
    expect(result.current.pageTasks.tree).toHaveLength(1)
    expect(result.current.pageTasks.tree[0]?.task.id).toBe('task_parent')
    expect(result.current.pageTasks.tree[0]?.children.map((child) => child.task.id)).toEqual([
      'task_child'
    ])

    expect(result.current.myTasks.data.map((task) => task.id)).toEqual([
      'task_shared',
      'task_parent'
    ])
  })

  it('updates subscribed task views when page task completion changes', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        sync: usePageTaskSync({ pageId: 'page-1', debounceMs: 0 }),
        myTasks: useTasks({ assigneeDid: did, includeCompleted: false })
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.myTasks.loading).toBe(false)
    })

    await act(async () => {
      result.current.sync.handleTasksChange([
        {
          taskId: 'task-1',
          blockId: 'block-1',
          title: 'Task 1',
          completed: false,
          parentTaskId: null,
          sortKey: '0000',
          assignees: [did],
          dueDate: '2026-03-19',
          references: []
        }
      ])
    })

    await waitFor(() => {
      expect(result.current.myTasks.data.map((task) => task.id)).toEqual(['task-1'])
    })

    await act(async () => {
      result.current.sync.handleTasksChange([
        {
          taskId: 'task-1',
          blockId: 'block-1',
          title: 'Task 1',
          completed: true,
          parentTaskId: null,
          sortKey: '0000',
          assignees: [did],
          dueDate: '2026-03-19',
          references: []
        }
      ])
    })

    await waitFor(() => {
      expect(result.current.myTasks.data).toHaveLength(0)
    })
  })

  it('filters tasks by due date presets', async () => {
    const now = new Date('2026-03-05T12:00:00.000Z').valueOf()
    const originalNow = Date.now
    Date.now = () => now

    try {
      const wrapper = createWrapper()

      const { result } = renderHook(
        () => ({
          sync: usePageTaskSync({ pageId: 'page-1', debounceMs: 0 }),
          overdue: useTasks({ dueDateFilter: 'overdue' }),
          today: useTasks({ dueDateFilter: 'today' }),
          upcoming: useTasks({ dueDateFilter: 'next-7-days' }),
          noDueDate: useTasks({ dueDateFilter: 'none' })
        }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.overdue.loading).toBe(false)
        expect(result.current.today.loading).toBe(false)
        expect(result.current.upcoming.loading).toBe(false)
        expect(result.current.noDueDate.loading).toBe(false)
      })

      await act(async () => {
        result.current.sync.handleTasksChange([
          {
            taskId: 'task-overdue',
            blockId: 'block-overdue',
            title: 'Overdue',
            completed: false,
            parentTaskId: null,
            sortKey: '0000',
            assignees: [],
            dueDate: '2026-03-04',
            references: []
          },
          {
            taskId: 'task-today',
            blockId: 'block-today',
            title: 'Today',
            completed: false,
            parentTaskId: null,
            sortKey: '0001',
            assignees: [],
            dueDate: '2026-03-05',
            references: []
          },
          {
            taskId: 'task-upcoming',
            blockId: 'block-upcoming',
            title: 'Upcoming',
            completed: false,
            parentTaskId: null,
            sortKey: '0002',
            assignees: [],
            dueDate: '2026-03-09',
            references: []
          },
          {
            taskId: 'task-no-due-date',
            blockId: 'block-no-due-date',
            title: 'No due date',
            completed: false,
            parentTaskId: null,
            sortKey: '0003',
            assignees: [],
            dueDate: null,
            references: []
          }
        ])
      })

      await waitFor(() => {
        expect(result.current.overdue.data.map((task) => task.id)).toEqual(['task-overdue'])
        expect(result.current.today.data.map((task) => task.id)).toEqual(['task-today'])
        expect(result.current.upcoming.data.map((task) => task.id)).toEqual([
          'task-today',
          'task-upcoming'
        ])
        expect(result.current.noDueDate.data.map((task) => task.id)).toEqual(['task-no-due-date'])
      })
    } finally {
      Date.now = originalNow
    }
  })

  it('computes hierarchy depth independently of task sort order', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        sync: usePageTaskSync({ pageId: 'page-1', debounceMs: 0 }),
        tasks: useTasks({ includeCompleted: true })
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    await act(async () => {
      result.current.sync.handleTasksChange([
        {
          taskId: 'task-parent',
          blockId: 'block-parent',
          title: 'Parent',
          completed: false,
          parentTaskId: null,
          sortKey: '0001',
          assignees: [did],
          dueDate: '2026-03-20',
          references: []
        },
        {
          taskId: 'task-child',
          blockId: 'block-child',
          title: 'Child',
          completed: false,
          parentTaskId: 'task-parent',
          sortKey: '0000',
          assignees: [did],
          dueDate: '2026-03-05',
          references: []
        }
      ])
    })

    await waitFor(() => {
      expect(result.current.tasks.data).toHaveLength(2)
    })

    expect(result.current.tasks.tree).toHaveLength(1)
    expect(result.current.tasks.tree[0]?.task.id).toBe('task-parent')
    expect(result.current.tasks.tree[0]?.depth).toBe(0)
    expect(result.current.tasks.tree[0]?.children[0]?.task.id).toBe('task-child')
    expect(result.current.tasks.tree[0]?.children[0]?.depth).toBe(1)
  })
})
