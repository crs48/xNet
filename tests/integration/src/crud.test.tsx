/**
 * CRUD integration tests for the current React hook stack.
 *
 * These tests exercise `useNode`, `useQuery`, and `useMutate` against a real
 * in-memory storage adapter so public examples stay aligned with the current API.
 */
import type { DID } from '@xnetjs/core'
import { act, cleanup, render } from '@testing-library/react'
import { DatabaseSchema, MemoryNodeStorageAdapter, PageSchema } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider, useMutate, useNode, useQuery } from '@xnetjs/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

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

afterEach(() => {
  cleanup()
})

describe('React CRUD integration', () => {
  it('creates a page with useNode and createIfMissing', async () => {
    const pageId = `page-${Date.now()}`
    const { result } = renderWithStore(() =>
      useNode(PageSchema, pageId, {
        createIfMissing: { title: 'Test Page' },
        disableSync: true
      })
    )

    await waitForHook(
      result,
      (value) => !value.loading && value.data !== null && value.doc !== null
    )

    expect(result.current.data?.id).toBe(pageId)
    expect(result.current.data?.title).toBe('Test Page')
    expect(result.current.wasCreated).toBe(true)
    expect(result.current.doc).not.toBeNull()
  })

  it('updates and queries pages through useMutate and useQuery', async () => {
    const pageId = `page-query-${Date.now()}`
    const { result } = renderWithStore(() => ({
      mutate: useMutate(),
      pages: useQuery(PageSchema, {
        orderBy: { updatedAt: 'desc' }
      })
    }))

    await waitForHook(result, (value) => !value.pages.loading)

    await act(async () => {
      await result.current.mutate.create(PageSchema, { title: 'Alpha' }, pageId)
    })

    await waitForHook(result, (value) =>
      value.pages.data.some((page) => page.id === pageId && page.title === 'Alpha')
    )

    await act(async () => {
      await result.current.mutate.update(PageSchema, pageId, { title: 'Alpha Revised' })
    })

    await waitForHook(result, (value) =>
      value.pages.data.some((page) => page.id === pageId && page.title === 'Alpha Revised')
    )

    expect(result.current.pages.data.find((page) => page.id === pageId)?.title).toBe(
      'Alpha Revised'
    )
  })

  it('persists page Y.Doc content across remounts with the same adapter', async () => {
    const pageId = `page-persist-${Date.now()}`
    const nodeStorage = new MemoryNodeStorageAdapter()
    const identity = createTestIdentity()

    const firstRender = renderWithStore(
      () =>
        useNode(PageSchema, pageId, {
          createIfMissing: { title: 'Persisted Page' },
          disableSync: true,
          persistDebounce: 0
        }),
      { nodeStorage, identity }
    )

    await waitForHook(
      firstRender.result,
      (value) => !value.loading && value.data !== null && value.doc !== null
    )

    act(() => {
      firstRender.result.current.doc?.getText('content').insert(0, 'Persisted text content')
    })

    await act(async () => {
      await firstRender.result.current.save()
    })

    firstRender.unmount()

    const secondRender = renderWithStore(
      () =>
        useNode(PageSchema, pageId, {
          disableSync: true
        }),
      { nodeStorage, identity }
    )

    await waitForHook(
      secondRender.result,
      (value) => !value.loading && value.data !== null && value.doc !== null
    )

    expect(secondRender.result.current.data?.title).toBe('Persisted Page')
    expect(secondRender.result.current.doc?.getText('content').toString()).toBe(
      'Persisted text content'
    )
  })

  it('creates and edits database nodes with useNode', async () => {
    const databaseId = `database-${Date.now()}`
    const { result } = renderWithStore(() =>
      useNode(DatabaseSchema, databaseId, {
        createIfMissing: {
          title: 'Project Tracker',
          defaultView: 'table',
          rowCount: 0
        },
        disableSync: true
      })
    )

    await waitForHook(
      result,
      (value) => !value.loading && value.data !== null && value.doc !== null
    )

    expect(result.current.data?.title).toBe('Project Tracker')
    expect(result.current.data?.defaultView).toBe('table')

    await act(async () => {
      await result.current.update({
        title: 'Operations Tracker',
        defaultView: 'board'
      })
    })

    await waitForHook(
      result,
      (value) => value.data?.title === 'Operations Tracker' && value.data?.defaultView === 'board'
    )

    expect(result.current.data?.title).toBe('Operations Tracker')
    expect(result.current.data?.defaultView).toBe('board')
  })
})
