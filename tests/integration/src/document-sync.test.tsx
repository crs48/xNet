/**
 * Sync-oriented integration tests for the current `useNode` API.
 *
 * These tests simulate the Y.Doc transport directly so we can verify the
 * current document hook behavior without depending on removed legacy sync hooks.
 * When structured node metadata is asserted, the tests use a shared storage
 * adapter plus `reload()` so they stay on public hook APIs instead of relying
 * on internal meta-map synchronization details.
 */
import type { DID } from '@xnetjs/core'
import { act, cleanup, render } from '@testing-library/react'
import { DatabaseSchema, MemoryNodeStorageAdapter, PageSchema } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider, useNode } from '@xnetjs/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'

type TestIdentity = {
  did: string
  signingKey: Uint8Array
}

function createTestIdentity(): TestIdentity {
  const { identity, privateKey } = generateIdentity()
  return {
    did: identity.did,
    signingKey: privateKey
  }
}

function renderWithStore<T>(
  hook: () => T,
  options?: {
    nodeStorage?: MemoryNodeStorageAdapter
    identity?: TestIdentity
  }
) {
  const nodeStorage = options?.nodeStorage ?? new MemoryNodeStorageAdapter()
  const identity = options?.identity ?? createTestIdentity()
  const result: { current: T } = { current: undefined as T }

  function TestComponent() {
    result.current = hook()
    return null
  }

  const utils = render(
    <XNetProvider
      config={{
        nodeStorage,
        authorDID: identity.did as DID,
        signingKey: identity.signingKey
      }}
    >
      <TestComponent />
    </XNetProvider>
  )

  return { result, nodeStorage, identity, ...utils }
}

async function waitForHook<T>(
  result: { current: T },
  condition: (value: T) => boolean,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 5000
  const interval = options.interval ?? 25
  const start = Date.now()

  while (result.current === undefined || !condition(result.current)) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitForHook timed out after ${timeout}ms`)
    }

    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

function setupDocSync(docA: Y.Doc, docB: Y.Doc) {
  let connected = true

  const syncAll = () => {
    const stateVectorA = Y.encodeStateVector(docA)
    const stateVectorB = Y.encodeStateVector(docB)
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, stateVectorB), 'sync')
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, stateVectorA), 'sync')
  }

  syncAll()

  const handlerA = (update: Uint8Array, origin: unknown) => {
    if (!connected || origin === 'sync') {
      return
    }
    Y.applyUpdate(docB, update, 'sync')
  }

  const handlerB = (update: Uint8Array, origin: unknown) => {
    if (!connected || origin === 'sync') {
      return
    }
    Y.applyUpdate(docA, update, 'sync')
  }

  docA.on('update', handlerA)
  docB.on('update', handlerB)

  return {
    disconnect() {
      connected = false
    },
    reconnect() {
      connected = true
      syncAll()
    },
    destroy() {
      docA.off('update', handlerA)
      docB.off('update', handlerB)
    }
  }
}

afterEach(() => {
  cleanup()
})

describe('useNode sync integration', () => {
  it('syncs page properties and rich text through the current hook surface', async () => {
    const docId = `page-sync-${Date.now()}`
    const nodeStorage = new MemoryNodeStorageAdapter()
    const identity = createTestIdentity()
    const userA = renderWithStore(
      () =>
        useNode(PageSchema, docId, {
          createIfMissing: { title: 'Draft' },
          disableSync: true
        }),
      { nodeStorage, identity }
    )
    const userB = renderWithStore(
      () =>
        useNode(PageSchema, docId, {
          createIfMissing: { title: 'Draft' },
          disableSync: true
        }),
      { nodeStorage, identity }
    )

    await waitForHook(userA.result, (value) => !value.loading && value.doc !== null)
    await waitForHook(userB.result, (value) => !value.loading && value.doc !== null)

    const sync = setupDocSync(userA.result.current.doc!, userB.result.current.doc!)

    try {
      await act(async () => {
        await userA.result.current.update({ title: 'Shared Title' })
      })

      act(() => {
        userA.result.current.doc?.getText('content').insert(0, 'Shared body')
      })

      await act(async () => {
        await userB.result.current.reload()
      })

      await waitForHook(
        userB.result,
        (value) =>
          value.data?.title === 'Shared Title' &&
          value.doc?.getText('content').toString() === 'Shared body'
      )

      expect(userB.result.current.data?.title).toBe('Shared Title')
      expect(userB.result.current.doc?.getText('content').toString()).toBe('Shared body')
    } finally {
      sync.destroy()
    }
  })

  it('merges offline rich-text edits after reconnection', async () => {
    const docId = `page-offline-${Date.now()}`
    const userA = renderWithStore(() =>
      useNode(PageSchema, docId, {
        createIfMissing: { title: 'Offline test' },
        disableSync: true
      })
    )
    const userB = renderWithStore(() =>
      useNode(PageSchema, docId, {
        createIfMissing: { title: 'Offline test' },
        disableSync: true
      })
    )

    await waitForHook(userA.result, (value) => !value.loading && value.doc !== null)
    await waitForHook(userB.result, (value) => !value.loading && value.doc !== null)

    const sync = setupDocSync(userA.result.current.doc!, userB.result.current.doc!)
    sync.disconnect()

    act(() => {
      userA.result.current.doc?.getText('content').insert(0, 'offline-a ')
      userB.result.current.doc?.getText('content').insert(0, 'offline-b ')
    })

    sync.reconnect()

    await waitForHook(userA.result, (value) => {
      const content = value.doc?.getText('content').toString() ?? ''
      return content.includes('offline-a') && content.includes('offline-b')
    })

    const contentA = userA.result.current.doc?.getText('content').toString() ?? ''
    const contentB = userB.result.current.doc?.getText('content').toString() ?? ''

    expect(contentA).toContain('offline-a')
    expect(contentA).toContain('offline-b')
    expect(contentB).toContain('offline-a')
    expect(contentB).toContain('offline-b')

    sync.destroy()
  })

  it('persists synced content after remount with the same storage adapter', async () => {
    const docId = `page-remount-${Date.now()}`
    const nodeStorage = new MemoryNodeStorageAdapter()
    const identity = createTestIdentity()

    const firstSession = renderWithStore(
      () =>
        useNode(PageSchema, docId, {
          createIfMissing: { title: 'Persist after sync' },
          disableSync: true,
          persistDebounce: 0
        }),
      { nodeStorage, identity }
    )

    await waitForHook(firstSession.result, (value) => !value.loading && value.doc !== null)

    act(() => {
      firstSession.result.current.doc?.getText('content').insert(0, 'Stored after sync')
    })

    await act(async () => {
      await firstSession.result.current.save()
    })

    firstSession.unmount()

    const secondSession = renderWithStore(
      () =>
        useNode(PageSchema, docId, {
          disableSync: true
        }),
      { nodeStorage, identity }
    )

    await waitForHook(secondSession.result, (value) => !value.loading && value.doc !== null)

    expect(secondSession.result.current.doc?.getText('content').toString()).toBe(
      'Stored after sync'
    )
  })

  it('syncs collaborative database documents through useNode', async () => {
    const docId = `database-sync-${Date.now()}`
    const nodeStorage = new MemoryNodeStorageAdapter()
    const identity = createTestIdentity()
    const userA = renderWithStore(
      () =>
        useNode(DatabaseSchema, docId, {
          createIfMissing: {
            title: 'Operations',
            defaultView: 'table',
            rowCount: 0
          },
          disableSync: true
        }),
      { nodeStorage, identity }
    )
    const userB = renderWithStore(
      () =>
        useNode(DatabaseSchema, docId, {
          createIfMissing: {
            title: 'Operations',
            defaultView: 'table',
            rowCount: 0
          },
          disableSync: true
        }),
      { nodeStorage, identity }
    )

    await waitForHook(userA.result, (value) => !value.loading && value.doc !== null)
    await waitForHook(userB.result, (value) => !value.loading && value.doc !== null)

    const sync = setupDocSync(userA.result.current.doc!, userB.result.current.doc!)

    try {
      await act(async () => {
        await userA.result.current.update({
          title: 'Operations Board',
          defaultView: 'board'
        })
      })

      await act(async () => {
        await userB.result.current.reload()
      })

      await waitForHook(
        userB.result,
        (value) => value.data?.title === 'Operations Board' && value.data?.defaultView === 'board'
      )

      expect(userB.result.current.data?.title).toBe('Operations Board')
      expect(userB.result.current.data?.defaultView).toBe('board')
    } finally {
      sync.destroy()
    }
  })
})
