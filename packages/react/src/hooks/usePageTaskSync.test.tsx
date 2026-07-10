import type { DID } from '@xnetjs/core'
import { renderHook, act, waitFor } from '@testing-library/react'
import { ExternalReferenceSchema, MemoryNodeStorageAdapter, TaskSchema } from '@xnetjs/data'
import { generateIdentity, type Identity } from '@xnetjs/identity'
import React, { type ReactNode, useMemo } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { XNetProvider } from '../context'
import { useMutate } from './useMutate'
import { usePageTaskSync } from './usePageTaskSync'
import { useQuery } from './useQuery'

describe('usePageTaskSync', () => {
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

  it('creates, updates, and archives page-backed tasks from editor snapshots', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        sync: usePageTaskSync({ pageId: 'page-1', debounceMs: 0 }),
        tasks: useQuery(TaskSchema, { where: { page: 'page-1' } }),
        references: useQuery(ExternalReferenceSchema)
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
      expect(result.current.references.loading).toBe(false)
    })

    await act(async () => {
      result.current.sync.handleTasksChange([
        {
          taskId: 'task_parent',
          blockId: 'block_parent',
          title: 'Parent task',
          completed: false,
          parentTaskId: null,
          sortKey: '0000',
          assignees: [did],
          dueDate: '2026-03-19',
          references: []
        },
        {
          taskId: 'task_child',
          blockId: 'block_child',
          title: 'Child task',
          completed: true,
          parentTaskId: 'task_parent',
          sortKey: '0000.0000',
          assignees: [did, otherDid],
          dueDate: '2026-03-20',
          references: [
            {
              url: 'https://github.com/openai/openai/issues/123',
              provider: 'github',
              kind: 'issue',
              refId: 'openai/openai#123',
              title: 'Issue #123',
              subtitle: 'openai/openai',
              icon: 'GH',
              embedUrl: null,
              metadata: '{"repo":"openai/openai"}'
            }
          ]
        }
      ])
    })

    await waitFor(() => {
      expect(result.current.tasks.data).toHaveLength(2)
    })

    const childTask = result.current.tasks.data.find((task) => task.id === 'task_child')

    expect(childTask).toMatchObject({
      completed: true,
      status: 'done',
      page: 'page-1',
      parent: 'task_parent',
      anchorBlockId: 'block_child',
      sortKey: '0000.0000',
      assignee: did,
      assignees: [did, otherDid],
      dueDate: Date.UTC(2026, 2, 20)
    })

    await waitFor(() => {
      expect(result.current.references.data).toHaveLength(1)
    })

    await act(async () => {
      result.current.sync.handleTasksChange([
        {
          taskId: 'task_parent',
          blockId: 'block_parent',
          title: 'Parent task renamed',
          completed: true,
          parentTaskId: null,
          sortKey: '0000',
          assignees: [otherDid],
          dueDate: '2026-03-25',
          references: []
        }
      ])
    })

    await waitFor(() => {
      const parentTask = result.current.tasks.data.find((task) => task.id === 'task_parent')
      const removedChild = result.current.tasks.data.find((task) => task.id === 'task_child')

      expect(parentTask).toMatchObject({
        title: 'Parent task renamed',
        completed: true,
        status: 'done',
        assignee: otherDid,
        assignees: [otherDid],
        dueDate: Date.UTC(2026, 2, 25)
      })
      expect(removedChild).toBeUndefined()
      expect(result.current.tasks.data).toHaveLength(1)
    })
  })

  it('restores the same node when a removed item is re-added', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        sync: usePageTaskSync({ pageId: 'page-1', debounceMs: 0 }),
        tasks: useQuery(TaskSchema, { where: { page: 'page-1' }, includeDeleted: true })
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    const snapshot = {
      taskId: 'task_revive',
      blockId: 'block_revive',
      title: 'Revivable task',
      completed: false,
      parentTaskId: null,
      sortKey: '0000',
      assignees: [],
      dueDate: null,
      references: []
    }

    await act(async () => {
      result.current.sync.handleTasksChange([snapshot])
    })

    await waitFor(() => {
      expect(result.current.tasks.data.filter((task) => !task.deleted)).toHaveLength(1)
    })

    // Remove the item from the page: the node is archived, never hard-deleted.
    await act(async () => {
      result.current.sync.handleTasksChange([])
    })

    await waitFor(() => {
      const archived = result.current.tasks.data.find((task) => task.id === 'task_revive')
      expect(archived?.deleted).toBe(true)
    })

    // Re-adding the same item (undo / paste-back) resurrects the same node.
    await act(async () => {
      result.current.sync.handleTasksChange([snapshot])
    })

    await waitFor(() => {
      const revived = result.current.tasks.data.find((task) => task.id === 'task_revive')
      expect(revived?.deleted).toBeFalsy()
      expect(revived).toMatchObject({ title: 'Revivable task', page: 'page-1' })
      expect(result.current.tasks.data).toHaveLength(1)
    })
  })

  it('converges concurrent editor title edits with board status changes', async () => {
    // Validation scenario from exploration 0161: title edited in the page
    // editor while the status changes from the board on another surface —
    // both writes land on the same node with no duplicates and no revert.
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        sync: usePageTaskSync({ pageId: 'page-1', debounceMs: 0 }),
        mutate: useMutate(),
        tasks: useQuery(TaskSchema, { where: { page: 'page-1' } })
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    const item = {
      taskId: 'task_concurrent',
      blockId: 'block_concurrent',
      title: 'Original title',
      completed: false,
      parentTaskId: null,
      sortKey: '0000',
      assignees: [],
      dueDate: null,
      references: []
    }

    await act(async () => {
      result.current.sync.handleTasksChange([item])
    })

    await waitFor(() => {
      expect(result.current.tasks.data).toHaveLength(1)
    })

    // Board surface moves the workflow status while the editor retitles.
    await act(async () => {
      await result.current.mutate.update(TaskSchema, 'task_concurrent', {
        status: 'in-progress'
      })
      result.current.sync.handleTasksChange([{ ...item, title: 'Renamed in editor' }])
    })

    await waitFor(() => {
      const tasks = result.current.tasks.data.filter((task) => task.id === 'task_concurrent')
      expect(tasks).toHaveLength(1)
      expect(tasks[0]).toMatchObject({
        title: 'Renamed in editor',
        status: 'in-progress',
        completed: false
      })
    })
  })

  it('moves a task between pages without duplicating it', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        syncA: usePageTaskSync({ pageId: 'page-a', debounceMs: 0 }),
        syncB: usePageTaskSync({ pageId: 'page-b', debounceMs: 0 }),
        tasks: useQuery(TaskSchema, { includeDeleted: true })
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    const item = {
      taskId: 'task_move',
      blockId: 'block_a',
      title: 'Moving task',
      completed: false,
      parentTaskId: null,
      sortKey: '0000',
      assignees: [],
      dueDate: null,
      references: []
    }

    await act(async () => {
      result.current.syncA.handleTasksChange([item])
    })

    await waitFor(() => {
      const task = result.current.tasks.data.find((node) => node.id === 'task_move')
      expect(task).toMatchObject({ page: 'page-a' })
    })

    // Cut from page A, paste into page B: A's snapshot drops the item while
    // B's snapshot claims the same taskId. Whatever order the two syncs run
    // in, the node must end alive on page B with no duplicate.
    await act(async () => {
      result.current.syncA.handleTasksChange([])
      result.current.syncB.handleTasksChange([{ ...item, blockId: 'block_b' }])
    })

    await waitFor(() => {
      const matches = result.current.tasks.data.filter((node) => node.id === 'task_move')
      expect(matches).toHaveLength(1)
      expect(matches[0]).toMatchObject({
        page: 'page-b',
        anchorBlockId: 'block_b'
      })
      expect(matches[0]?.deleted).toBeFalsy()
      expect(result.current.tasks.data).toHaveLength(1)
    })
  })

  it('converges to the latest snapshot across randomized reconciliation rounds', async () => {
    // Deterministic PRNG (mulberry32) in place of a property-testing dep:
    // random snapshot sequences must always converge to the final snapshot.
    let seed = 0x2f6e2b1
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        sync: usePageTaskSync({ pageId: 'page-rand', debounceMs: 0 }),
        tasks: useQuery(TaskSchema, { where: { page: 'page-rand' }, includeDeleted: true })
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    const taskIds = ['rand_a', 'rand_b', 'rand_c', 'rand_d', 'rand_e', 'rand_f']
    const makeSnapshot = () =>
      taskIds
        .filter(() => random() > 0.4)
        .map((taskId, index) => ({
          taskId,
          blockId: `block_${taskId}`,
          title: `Task ${taskId} v${Math.floor(random() * 100)}`,
          completed: random() > 0.5,
          parentTaskId: null,
          sortKey: String(index).padStart(4, '0'),
          assignees: [],
          dueDate: null,
          references: []
        }))

    const everSeen = new Set<string>()
    let finalSnapshot: ReturnType<typeof makeSnapshot> = []

    for (let round = 0; round < 5; round += 1) {
      finalSnapshot = makeSnapshot()
      for (const item of finalSnapshot) everSeen.add(item.taskId)

      await act(async () => {
        result.current.sync.handleTasksChange(finalSnapshot)
      })

      const expected = finalSnapshot
      await waitFor(() => {
        const alive = result.current.tasks.data.filter((task) => !task.deleted)
        expect(alive).toHaveLength(expected.length)
        for (const item of expected) {
          const task = alive.find((node) => node.id === item.taskId)
          expect(task).toMatchObject({
            title: item.title,
            completed: item.completed,
            sortKey: item.sortKey,
            anchorBlockId: item.blockId
          })
        }
      })
    }

    // Everything ever hosted but absent from the final snapshot is archived,
    // never hard-deleted.
    const finalIds = new Set(finalSnapshot.map((item) => item.taskId))
    const archived = result.current.tasks.data.filter((task) => task.deleted)
    expect(new Set(archived.map((task) => task.id))).toEqual(
      new Set([...everSeen].filter((id) => !finalIds.has(id)))
    )
  })

  it('does not reconcile before the editor publishes its first snapshot', async () => {
    // Mount race from exploration 0296: the sync hook goes live before the
    // editor emits, so its default empty snapshot must not archive the
    // page's tasks.
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        sync: usePageTaskSync({ pageId: 'page-1', debounceMs: 0 }),
        mutate: useMutate(),
        tasks: useQuery(TaskSchema, { where: { page: 'page-1' }, includeDeleted: true })
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    await act(async () => {
      await result.current.mutate.create(
        TaskSchema,
        { title: 'Pre-existing task', completed: false, page: 'page-1', source: 'page' },
        'task_preexisting'
      )
    })

    await waitFor(() => {
      expect(result.current.tasks.data).toHaveLength(1)
    })

    // Give the (debounceMs: 0) reconciler every chance to misfire.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
    })

    const task = result.current.tasks.data.find((node) => node.id === 'task_preexisting')
    expect(task?.deleted).toBeFalsy()
  })

  it("does not reconcile a previous page's snapshot after the host changes", async () => {
    // Component-reuse hazard from exploration 0296: navigating a reused
    // surface to another page must not let the old page's snapshot claim
    // tasks onto (or archive tasks off) the new page.
    const wrapper = createWrapper()

    const { result, rerender } = renderHook(
      ({ pageId }: { pageId: string }) => ({
        sync: usePageTaskSync({ pageId, debounceMs: 0 }),
        tasks: useQuery(TaskSchema, { includeDeleted: true })
      }),
      { wrapper, initialProps: { pageId: 'page-a' } }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    await act(async () => {
      result.current.sync.handleTasksChange([
        {
          taskId: 'task_host_switch',
          blockId: 'block_host_switch',
          title: 'Hosted on A',
          completed: false,
          parentTaskId: null,
          sortKey: '0000',
          assignees: [],
          dueDate: null,
          references: []
        }
      ])
    })

    await waitFor(() => {
      const task = result.current.tasks.data.find((node) => node.id === 'task_host_switch')
      expect(task).toMatchObject({ page: 'page-a' })
    })

    rerender({ pageId: 'page-b' })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
    })

    // The stale page-a snapshot must not have been reconciled against page-b.
    const task = result.current.tasks.data.find((node) => node.id === 'task_host_switch')
    expect(task).toMatchObject({ page: 'page-a' })
    expect(task?.deleted).toBeFalsy()
  })

  it('never overwrites a real title with the extraction placeholder', async () => {
    // Delete-gesture transient from exploration 0296: emptying an item's
    // text one transaction before removing the node produces a snapshot
    // titled 'Untitled task' — it must not clobber the real title.
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        sync: usePageTaskSync({ pageId: 'page-1', debounceMs: 0 }),
        tasks: useQuery(TaskSchema, { where: { page: 'page-1' } })
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    const item = {
      taskId: 'task_transient',
      blockId: 'block_transient',
      title: 'yay',
      completed: false,
      parentTaskId: null,
      sortKey: '0000',
      assignees: [],
      dueDate: null,
      references: []
    }

    await act(async () => {
      result.current.sync.handleTasksChange([item])
    })

    await waitFor(() => {
      expect(result.current.tasks.data).toHaveLength(1)
    })

    // The transient mid-delete snapshot: text gone, checkbox toggled.
    await act(async () => {
      result.current.sync.handleTasksChange([{ ...item, title: 'Untitled task', completed: true }])
    })

    await waitFor(() => {
      const task = result.current.tasks.data.find((node) => node.id === 'task_transient')
      expect(task).toMatchObject({ title: 'yay', completed: true, status: 'done' })
    })
  })

  it('claiming a task with a placeholder-title snapshot preserves its real title', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        syncA: usePageTaskSync({ pageId: 'page-a', debounceMs: 0 }),
        syncB: usePageTaskSync({ pageId: 'page-b', debounceMs: 0 }),
        tasks: useQuery(TaskSchema, { includeDeleted: true })
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    const item = {
      taskId: 'task_claim_placeholder',
      blockId: 'block_a',
      title: 'Real title',
      completed: false,
      parentTaskId: null,
      sortKey: '0000',
      assignees: [],
      dueDate: null,
      references: []
    }

    await act(async () => {
      result.current.syncA.handleTasksChange([item])
    })

    await waitFor(() => {
      const task = result.current.tasks.data.find((node) => node.id === 'task_claim_placeholder')
      expect(task).toMatchObject({ page: 'page-a', title: 'Real title' })
    })

    // Page B claims the task before its editor has materialized the text
    // (so its snapshot only carries the placeholder).
    await act(async () => {
      result.current.syncA.handleTasksChange([])
      result.current.syncB.handleTasksChange([
        { ...item, blockId: 'block_b', title: 'Untitled task' }
      ])
    })

    await waitFor(() => {
      const matches = result.current.tasks.data.filter(
        (node) => node.id === 'task_claim_placeholder'
      )
      expect(matches).toHaveLength(1)
      expect(matches[0]).toMatchObject({ page: 'page-b', title: 'Real title' })
      expect(matches[0]?.deleted).toBeFalsy()
    })
  })

  it('ignores invalid due date strings when syncing task nodes', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        sync: usePageTaskSync({ pageId: 'page-1', debounceMs: 0 }),
        tasks: useQuery(TaskSchema, { where: { page: 'page-1' } })
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    await act(async () => {
      result.current.sync.handleTasksChange([
        {
          taskId: 'task-invalid-date',
          blockId: 'block-invalid-date',
          title: 'Invalid date task',
          completed: false,
          parentTaskId: null,
          sortKey: '0000',
          assignees: [],
          dueDate: '2026-02-31',
          references: []
        }
      ])
    })

    await waitFor(() => {
      expect(result.current.tasks.data).toHaveLength(1)
    })

    expect(result.current.tasks.data[0]?.dueDate).toBeUndefined()
  })
})
