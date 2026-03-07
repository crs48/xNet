/**
 * Tests for useUndo hook.
 */

import type { DID } from '@xnetjs/core'
import { act, renderHook, waitFor } from '@testing-library/react'
import { DatabaseSchema, MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { generateIdentity, type Identity } from '@xnetjs/identity'
import React, { type ReactNode, useMemo } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { XNetProvider } from '../context'
import { useNodeStore } from './useNodeStore'
import { useUndo } from './useUndo'

describe('useUndo', () => {
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

  it('preserves history when inline undo options are passed through rerenders', async () => {
    const bootstrapStore = new NodeStore({
      storage,
      authorDID: did,
      signingKey: identityResult.privateKey
    })
    await bootstrapStore.initialize()

    const node = await bootstrapStore.create({
      schemaId: DatabaseSchema.schema['@id'],
      properties: { title: 'Alpha' }
    })

    const wrapper = createWrapper()
    const { result } = renderHook(
      () => {
        const nodeStore = useNodeStore()
        const undo = useUndo(node.id, { localDID: did, options: { mergeInterval: 1_000 } })

        return { nodeStore, undo }
      },
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.nodeStore.isReady).toBe(true)
    })

    await act(async () => {
      await result.current.nodeStore.store?.update(node.id, {
        properties: { title: 'Beta' }
      })
    })

    await waitFor(() => {
      expect(result.current.undo.canUndo).toBe(true)
      expect(result.current.undo.undoCount).toBe(1)
    })

    await act(async () => {
      await result.current.undo.undo()
    })

    await waitFor(async () => {
      const currentNode = await result.current.nodeStore.store?.get(node.id)
      expect(currentNode?.properties.title).toBe('Alpha')
    })

    await act(async () => {
      await result.current.undo.redo()
    })

    await waitFor(async () => {
      const currentNode = await result.current.nodeStore.store?.get(node.id)
      expect(currentNode?.properties.title).toBe('Beta')
    })
  })
})
