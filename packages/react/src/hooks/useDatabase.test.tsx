/**
 * Tests for useDatabase hook.
 */

import type { DID } from '@xnetjs/core'
import { renderHook, act, waitFor } from '@testing-library/react'
import { DatabaseSchema, MemoryNodeStorageAdapter, queryRows } from '@xnetjs/data'
import { generateIdentity, type Identity } from '@xnetjs/identity'
import React, { type ReactNode, useMemo } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { XNetProvider } from '../context'
import { useDatabase } from './useDatabase'
import { useDatabaseDoc } from './useDatabaseDoc'
import { useNodeStore } from './useNodeStore'

describe('useDatabase', () => {
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

  it('reorders canonical rows using row ids instead of exposing sort keys', async () => {
    const wrapper = createWrapper()

    const { result: storeResult } = renderHook(() => useNodeStore(), { wrapper })

    await waitFor(() => {
      expect(storeResult.current.isReady).toBe(true)
    })

    let databaseId = ''
    await act(async () => {
      const database = await storeResult.current.store?.create({
        schemaId: DatabaseSchema.schema['@id'],
        properties: { title: 'Tasks' }
      })
      databaseId = database?.id ?? ''
    })

    expect(databaseId).not.toBe('')

    const { result } = renderHook(
      () => ({
        databaseDoc: useDatabaseDoc(databaseId),
        database: useDatabase(databaseId)
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.databaseDoc.loading).toBe(false)
      expect(result.current.databaseDoc.doc).not.toBeNull()
    })

    let titleColumnId: string | null = null
    await act(async () => {
      titleColumnId = result.current.databaseDoc.createColumn({
        name: 'Title',
        type: 'text',
        config: {}
      })
    })

    expect(titleColumnId).not.toBeNull()

    await waitFor(() => {
      expect(result.current.databaseDoc.columns).toHaveLength(1)
    })

    await act(async () => {
      await result.current.database.createRow({ [titleColumnId!]: 'A' })
      await result.current.database.createRow({ [titleColumnId!]: 'B' })
      await result.current.database.createRow({ [titleColumnId!]: 'C' })
      await result.current.database.refetch()
    })

    expect(result.current.database.rows.map((row) => row.cells[titleColumnId!])).toEqual([
      'A',
      'B',
      'C'
    ])

    await act(async () => {
      await result.current.database.reorderRow(
        result.current.database.rows[1]!.id,
        result.current.database.rows[0]!.id
      )
      await result.current.database.refetch()
    })

    const storeRows = await queryRows(storeResult.current.store!, databaseId)
    expect(storeRows.rows.map((row) => row.cells[titleColumnId!])).toEqual(['B', 'A', 'C'])

    await waitFor(() => {
      expect(result.current.database.rows.map((row) => row.cells[titleColumnId!])).toEqual([
        'B',
        'A',
        'C'
      ])
    })
  })
})
