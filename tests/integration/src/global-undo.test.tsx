/**
 * App-wide undo integration tests (exploration 0179).
 *
 * Exercises the real wiring: XNetProvider builds one app-level UndoManager
 * subscribed to the NodeStore, and useGlobalUndo drives it via
 * undoLatest()/redoLatest(). Proves a single Cmd+Z reverses the most recent
 * action across independent nodes ("surfaces"), and that create/update undo
 * round-trips through redo.
 */
import type { DID } from '@xnetjs/core'
import { act, cleanup, render } from '@testing-library/react'
import { MemoryNodeStorageAdapter, PageSchema, type NodeStore } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider, useGlobalUndo, useMutate } from '@xnetjs/react'
import { useNodeStore } from '@xnetjs/react/internal'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => cleanup())

type Harness = {
  undo: ReturnType<typeof useGlobalUndo>
  mutate: ReturnType<typeof useMutate>
  store: NodeStore | null
}

function renderHarness() {
  const nodeStorage = new MemoryNodeStorageAdapter()
  const { identity, privateKey } = generateIdentity()
  const result: { current: Harness } = { current: undefined as unknown as Harness }

  function Probe() {
    const undo = useGlobalUndo()
    const mutate = useMutate()
    const { store } = useNodeStore()
    result.current = { undo, mutate, store }
    return null
  }

  render(
    <XNetProvider
      config={{
        nodeStorage,
        authorDID: identity.did as DID,
        signingKey: privateKey
      }}
    >
      <Probe />
    </XNetProvider>
  )

  return { result }
}

async function waitFor(check: () => boolean, timeout = 5000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timed out')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25))
    })
  }
}

describe('app-wide undo (useGlobalUndo)', () => {
  it('undoes the most recent action across different nodes, then redoes', async () => {
    const { result } = renderHarness()

    await waitFor(() => Boolean(result.current?.store && result.current.mutate))
    const store = result.current.store!

    // Two independent "surfaces": a folder-like page and a task-like page.
    let folderId = ''
    let taskId = ''
    await act(async () => {
      const folder = await result.current.mutate.create(PageSchema, { title: 'Recipes' })
      const task = await result.current.mutate.create(PageSchema, { title: 'Buy milk' })
      folderId = folder!.id
      taskId = task!.id
    })

    // The manager must have tracked the creates.
    await waitFor(() => result.current.undo.canUndo)

    // Most recent action: rename the task.
    await act(async () => {
      await result.current.mutate.update(PageSchema, taskId, { title: 'Buy oat milk' })
    })
    expect((await store.get(taskId))!.properties.title).toBe('Buy oat milk')

    // Cmd+Z → reverses the rename (most recent), not the folder.
    await act(async () => {
      await result.current.undo.undo()
    })
    expect((await store.get(taskId))!.properties.title).toBe('Buy milk')
    expect((await store.get(folderId))!.deleted).not.toBe(true)

    // Cmd+Z → reverses the task creation.
    await act(async () => {
      await result.current.undo.undo()
    })
    expect((await store.get(taskId))!.deleted).toBe(true)

    // Cmd+Z → reverses the folder creation.
    await act(async () => {
      await result.current.undo.undo()
    })
    expect((await store.get(folderId))!.deleted).toBe(true)

    // Cmd+Shift+Z → re-creates the folder.
    await act(async () => {
      await result.current.undo.redo()
    })
    expect((await store.get(folderId))!.deleted).not.toBe(true)
  })
})
