import type { DID } from '@xnetjs/core'
import { renderHook, act, waitFor } from '@testing-library/react'
import { ExternalReferenceSchema, MemoryNodeStorageAdapter, TaskSchema } from '@xnetjs/data'
import { generateIdentity, type Identity } from '@xnetjs/identity'
import React, { type ReactNode, useMemo } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { XNetProvider } from '../context'
import { usePageTaskSync } from './usePageTaskSync'
import { useQuery } from './useQuery'

describe('usePageTaskSync', () => {
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
          references: []
        },
        {
          taskId: 'task_child',
          blockId: 'block_child',
          title: 'Child task',
          completed: true,
          parentTaskId: 'task_parent',
          sortKey: '0000.0000',
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
      sortKey: '0000.0000'
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
        status: 'done'
      })
      expect(removedChild).toBeUndefined()
      expect(result.current.tasks.data).toHaveLength(1)
    })
  })
})
