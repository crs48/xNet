/**
 * Tests for useUndoScope hook.
 */

import type { DID } from '@xnetjs/core'
import { act, renderHook, waitFor } from '@testing-library/react'
import { DatabaseSchema, MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { generateIdentity, type Identity } from '@xnetjs/identity'
import React, { type ReactNode, useMemo } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { XNetProvider } from '../context'
import { useDatabase } from './useDatabase'
import { useDatabaseDoc } from './useDatabaseDoc'
import { useNodeStore } from './useNodeStore'
import { useUndoScope } from './useUndoScope'

describe('useUndoScope', () => {
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

  it('undoes row edits and row-create batches across a scoped database model', async () => {
    const bootstrapStore = new NodeStore({
      storage,
      authorDID: did,
      signingKey: identityResult.privateKey
    })
    await bootstrapStore.initialize()

    const bootstrapDatabase = await bootstrapStore.create({
      schemaId: DatabaseSchema.schema['@id'],
      properties: { title: 'Tasks' }
    })
    const databaseId = bootstrapDatabase.id

    const wrapper = createWrapper()

    const { result } = renderHook(
      () => {
        const nodeStore = useNodeStore()
        const databaseDoc = useDatabaseDoc(databaseId)
        const database = useDatabase(databaseId)
        const undo = useUndoScope([databaseId, ...database.rows.map((row) => row.id)], {
          localDID: did,
          options: { mergeInterval: 1_000 }
        })

        return { nodeStore, databaseDoc, database, undo }
      },
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.nodeStore.isReady).toBe(true)
      expect(result.current.databaseDoc.loading).toBe(false)
    })

    let titleColumnId: string | null = null
    let firstRowId = ''
    await act(async () => {
      titleColumnId = result.current.databaseDoc.createColumn({
        name: 'Title',
        type: 'text',
        config: {}
      })
    })

    await waitFor(() => {
      expect(result.current.databaseDoc.columns).toHaveLength(1)
    })

    await act(async () => {
      firstRowId = await result.current.database.createRow({ [titleColumnId!]: 'Alpha' })
      await result.current.database.refetch()
    })

    await waitFor(() => {
      expect(result.current.database.rows).toHaveLength(1)
    })

    await act(async () => {
      await result.current.database.updateRow(firstRowId, {
        [titleColumnId!]: 'Beta'
      })
      await result.current.database.refetch()
    })

    await waitFor(() => {
      expect(result.current.undo.canUndo).toBe(true)
      expect(result.current.database.rows[0]?.cells[titleColumnId!]).toBe('Beta')
    })

    await act(async () => {
      await result.current.undo.undo()
      await result.current.database.refetch()
    })

    await waitFor(async () => {
      const rowNode = await result.current.nodeStore.store?.get(firstRowId)
      expect(rowNode?.deleted).toBe(false)
      expect(rowNode?.properties[`cell_${titleColumnId!}`]).toBe('Alpha')
      expect(result.current.database.rows[0]?.cells[titleColumnId!]).toBe('Alpha')
    })

    await act(async () => {
      await result.current.undo.redo()
      await result.current.database.refetch()
    })

    await waitFor(() => {
      expect(result.current.database.rows[0]?.cells[titleColumnId!]).toBe('Beta')
    })

    await act(async () => {
      await result.current.database.createRow({ [titleColumnId!]: 'Gamma' })
      await result.current.database.refetch()
    })

    await waitFor(() => {
      expect(result.current.database.rows).toHaveLength(2)
    })

    await act(async () => {
      await result.current.undo.undo()
      await result.current.database.refetch()
    })

    await waitFor(() => {
      expect(result.current.database.rows).toHaveLength(1)
      expect(result.current.database.rows[0]?.cells[titleColumnId!]).toBe('Beta')
    })

    await act(async () => {
      await result.current.undo.redo()
      await result.current.database.refetch()
    })

    await waitFor(() => {
      expect(result.current.database.rows).toHaveLength(2)
      expect(result.current.database.rows.map((row) => row.cells[titleColumnId!])).toEqual([
        'Beta',
        'Gamma'
      ])
    })
  })
})
