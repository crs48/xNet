/**
 * Integration tests for useDatabaseComments — the full comment flow
 * against a real store: comment on a cell, counts index it, threads
 * retrieve it, resolve/reply round-trip.
 */

import type { DID } from '@xnetjs/core'
import { renderHook, act, waitFor } from '@testing-library/react'
import { DatabaseSchema, MemoryNodeStorageAdapter } from '@xnetjs/data'
import { generateIdentity, type Identity } from '@xnetjs/identity'
import { XNetProvider, useNodeStore } from '@xnetjs/react'
import React, { type ReactNode, useMemo } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDatabaseComments } from './useDatabaseComments'

describe('useDatabaseComments integration', () => {
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

  async function setupDatabase(wrapper: ReturnType<typeof createWrapper>): Promise<string> {
    const { result: storeResult } = renderHook(() => useNodeStore(), { wrapper })
    await waitFor(() => expect(storeResult.current.isReady).toBe(true))
    let databaseId = ''
    await act(async () => {
      const database = await storeResult.current.store?.create({
        schemaId: DatabaseSchema.schema['@id'],
        properties: { title: 'Comment test' }
      })
      databaseId = database?.id ?? ''
    })
    expect(databaseId).not.toBe('')
    return databaseId
  }

  it('comment on a cell → badge count, thread retrieval, reply, resolve', async () => {
    const wrapper = createWrapper()
    const databaseId = await setupDatabase(wrapper)
    const { result } = renderHook(() => useDatabaseComments({ databaseNodeId: databaseId }), {
      wrapper
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Comment on a cell
    let commentId: string | null = null
    await act(async () => {
      commentId = await result.current.commentOnCell('row-1', 'field-a', 'Check this value')
    })
    expect(commentId).not.toBeNull()

    // Badge count indexes by "rowId:propertyKey"
    await waitFor(() => {
      expect(result.current.cellCommentCounts.get('row-1:field-a')).toBe(1)
    })

    // Thread retrieval by cell
    const threads = result.current.getThreadsForCell('row-1', 'field-a')
    expect(threads).toHaveLength(1)
    expect(threads[0].root.properties.content).toBe('Check this value')

    // Reply lands in the same thread
    await act(async () => {
      await result.current.replyTo(commentId!, 'Agreed, fixing')
    })
    await waitFor(() => {
      const t = result.current.getThreadsForCell('row-1', 'field-a')
      expect(t[0]?.replies).toHaveLength(1)
    })

    // Resolve round-trip
    await act(async () => {
      await result.current.resolveThread(commentId!)
    })
    await waitFor(() => expect(result.current.unresolvedCount).toBe(0))

    // A second cell stays independent
    expect(result.current.cellCommentCounts.get('row-2:field-a')).toBeUndefined()
  })

  it('row and column comments index separately from cells', async () => {
    const wrapper = createWrapper()
    const databaseId = await setupDatabase(wrapper)
    const { result } = renderHook(() => useDatabaseComments({ databaseNodeId: databaseId }), {
      wrapper
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.commentOnRow('row-1', 'About this row')
      await result.current.commentOnColumn('field-a', 'About this column')
    })

    await waitFor(() => {
      expect(result.current.rowCommentCounts.get('row-1')).toBe(1)
      expect(result.current.columnCommentCounts.get('field-a')).toBe(1)
    })
    expect(result.current.cellCommentCounts.size).toBe(0)
  })
})
