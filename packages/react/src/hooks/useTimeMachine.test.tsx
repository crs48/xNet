/**
 * useTimeMachine (exploration 0329 P1): the merged timeline loads and follows
 * new changes, scrubbing materializes a preview + diff against current state,
 * named versions round-trip through Checkpoint nodes, and restore applies a
 * compensating change back to the scrubbed frontier.
 */

import type { DID } from '@xnetjs/core'
import { act, renderHook, waitFor } from '@testing-library/react'
import { DatabaseSchema, MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { generateIdentity, type Identity } from '@xnetjs/identity'
import React, { type ReactNode, useMemo } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { XNetProvider } from '../context'
import { useNodeStore } from './useNodeStore'
import { useTimeMachine } from './useTimeMachine'

describe('useTimeMachine', () => {
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

  async function seedNode(title: string) {
    const bootstrapStore = new NodeStore({
      storage,
      authorDID: did,
      signingKey: identityResult.privateKey
    })
    await bootstrapStore.initialize()
    return bootstrapStore.create({
      schemaId: DatabaseSchema.schema['@id'],
      properties: { title }
    })
  }

  function mountHook(nodeId: string) {
    return renderHook(
      () => {
        const nodeStore = useNodeStore()
        const tm = useTimeMachine(nodeId)
        return { nodeStore, tm }
      },
      { wrapper: createWrapper() }
    )
  }

  it('loads the timeline, follows new changes, and scrubs to a preview + diff', async () => {
    const node = await seedNode('v1')
    const { result } = mountHook(node.id)

    await waitFor(() => expect(result.current.tm.changeCount).toBe(1))
    expect(result.current.tm.atLatest).toBe(true)
    expect(result.current.tm.horizon).toBeNull()

    // Two live edits through the provider's store — the hook follows latest.
    await act(async () => {
      await result.current.nodeStore.store!.update(node.id, { properties: { title: 'v2' } })
    })
    await act(async () => {
      await result.current.nodeStore.store!.update(node.id, { properties: { title: 'v3' } })
    })
    await waitFor(() => expect(result.current.tm.changeCount).toBe(3))
    expect(result.current.tm.position).toBe(2)
    expect(result.current.tm.atLatest).toBe(true)

    // Scrub to the beginning: preview is v1, diff says title changed v1 → v3.
    act(() => result.current.tm.setPosition(0))
    await waitFor(() => expect(result.current.tm.preview?.properties.title).toBe('v1'))
    expect(result.current.tm.atLatest).toBe(false)
    const titleDiff = result.current.tm.diffs.find((d) => d.property === 'title')
    expect(titleDiff?.type).toBe('modified')
    expect(titleDiff?.before).toBe('v1')
    expect(titleDiff?.after).toBe('v3')

    // Step navigation clamps at the edges and resumes following at latest.
    act(() => result.current.tm.stepBack())
    expect(result.current.tm.position).toBe(0)
    act(() => result.current.tm.stepForward())
    expect(result.current.tm.position).toBe(1)
    act(() => result.current.tm.goToLatest())
    expect(result.current.tm.position).toBe(2)
    expect(result.current.tm.atLatest).toBe(true)
  })

  it('creates named versions and locates them on the timeline', async () => {
    const node = await seedNode('v1')
    const { result } = mountHook(node.id)
    await waitFor(() => expect(result.current.tm.changeCount).toBe(1))

    await act(async () => {
      await result.current.nodeStore.store!.update(node.id, { properties: { title: 'v2' } })
    })
    await waitFor(() => expect(result.current.tm.changeCount).toBe(2))

    await act(async () => {
      const checkpoint = await result.current.tm.createNamedVersion('Before rewrite', 'note')
      expect(checkpoint?.properties.name).toBe('Before rewrite')
    })
    await waitFor(() => expect(result.current.tm.checkpoints.length).toBe(1))
    const checkpoint = result.current.tm.checkpoints[0]
    expect(checkpoint.properties.note).toBe('note')

    // The checkpoint pins the node at its then-latest change (index 1).
    expect(result.current.tm.positionOfCheckpoint(checkpoint)).toBe(1)

    // The frontier hash is pinned against pruning under the checkpoint's id.
    expect(await storage.pins?.countPins()).toBeGreaterThan(0)
  })

  it('restores to the scrubbed frontier as a new compensating change', async () => {
    const node = await seedNode('v1')
    const { result } = mountHook(node.id)
    await waitFor(() => expect(result.current.tm.changeCount).toBe(1))

    await act(async () => {
      await result.current.nodeStore.store!.update(node.id, { properties: { title: 'v2' } })
    })
    await act(async () => {
      await result.current.nodeStore.store!.update(node.id, { properties: { title: 'v3' } })
    })
    await waitFor(() => expect(result.current.tm.changeCount).toBe(3))

    act(() => result.current.tm.setPosition(0))
    await waitFor(() => expect(result.current.tm.preview?.properties.title).toBe('v1'))

    await act(async () => {
      const restored = await result.current.tm.restore()
      expect(restored?.operations).toBe(1)
      expect(restored?.missing).toEqual([])
    })

    // Restore appends a NEW change (no log rewriting) and lands back at latest.
    await waitFor(() => expect(result.current.tm.changeCount).toBe(4))
    expect(result.current.tm.atLatest).toBe(true)
    const current = await result.current.nodeStore.store!.get(node.id)
    expect(current?.properties.title).toBe('v1')
  })
})
