/**
 * CRUD & Persistence Integration Tests
 *
 * Tests the full React hook stack (useDocument, useQuery, useMutate)
 * with real IndexedDB persistence in a browser context.
 *
 * Tests both Page and Database schemas.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React, { useEffect, useState } from 'react'
import { render, cleanup, act } from '@testing-library/react'
import { XNetProvider, useDocument, useQuery, useMutate } from '@xnet/react'
import { PageSchema, DatabaseSchema, IndexedDBNodeStorageAdapter } from '@xnet/data'
import type { DID } from '@xnet/core'
import { generateIdentity } from '@xnet/identity'
import * as Y from 'yjs'

// =============================================================================
// Test Helpers
// =============================================================================

/** Generate a unique DB name to avoid conflicts between tests */
function uniqueDbName() {
  return `xnet-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Create identity for testing */
function createTestIdentity() {
  const { identity, privateKey } = generateIdentity()
  return { did: identity.did, signingKey: privateKey }
}

/**
 * Test wrapper that provides XNetProvider with IndexedDB.
 * Opens the adapter before rendering the provider.
 */
function TestProvider({
  children,
  dbName,
  identity
}: {
  children: React.ReactNode
  dbName: string
  identity: { did: string; signingKey: Uint8Array }
}) {
  const [adapter, setAdapter] = useState<IndexedDBNodeStorageAdapter | null>(null)

  useEffect(() => {
    const a = new IndexedDBNodeStorageAdapter({ dbName })
    a.open().then(() => setAdapter(a))
  }, [dbName])

  if (!adapter) return null

  return (
    <XNetProvider
      config={{
        nodeStorage: adapter,
        authorDID: identity.did as DID,
        signingKey: identity.signingKey
      }}
    >
      {children}
    </XNetProvider>
  )
}

/**
 * Helper: render a hook inside TestProvider and return its result
 */
function renderWithStore<T>(
  hook: () => T,
  options?: { dbName?: string; identity?: { did: string; signingKey: Uint8Array } }
) {
  const dbName = options?.dbName || uniqueDbName()
  const identity = options?.identity || createTestIdentity()
  let result: { current: T } = { current: undefined as unknown as T }

  function TestComponent() {
    result.current = hook()
    return null
  }

  const utils = render(
    <TestProvider dbName={dbName} identity={identity}>
      <TestComponent />
    </TestProvider>
  )

  return { result, ...utils, dbName, identity }
}

/**
 * Helper: wait for a condition on hook result
 */
async function waitForHook<T>(
  result: { current: T },
  condition: (val: T) => boolean,
  { timeout = 5000, interval = 50 } = {}
): Promise<void> {
  const start = Date.now()
  while (result.current === undefined || !condition(result.current)) {
    if (Date.now() - start > timeout) {
      throw new Error(
        `waitForHook timed out after ${timeout}ms. Last value: ${JSON.stringify(result.current)}`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

// =============================================================================
// Tests: Page CRUD
// =============================================================================

describe('Page CRUD', () => {
  afterEach(() => {
    cleanup()
  })

  it('should create a page with useDocument + createIfMissing', async () => {
    const pageId = `page-${Date.now()}`

    const { result } = renderWithStore(() =>
      useDocument(PageSchema, pageId, {
        createIfMissing: { title: 'Test Page' },
        disableSync: true
      })
    )

    await waitForHook(result, (r) => !r.loading && r.data !== null)

    expect(result.current.data).not.toBeNull()
    expect(result.current.data!.title).toBe('Test Page')
    expect(result.current.data!.id).toBe(pageId)
    expect(result.current.doc).not.toBeNull() // PageSchema has document: 'yjs'
    expect(result.current.wasCreated).toBe(true)
  })

  it('should update page title via update()', async () => {
    const pageId = `page-update-${Date.now()}`

    const { result } = renderWithStore(() =>
      useDocument(PageSchema, pageId, {
        createIfMissing: { title: 'Original Title' },
        disableSync: true
      })
    )

    await waitForHook(result, (r) => !r.loading && r.data !== null)
    expect(result.current.data!.title).toBe('Original Title')

    // Update the title
    await act(async () => {
      await result.current.update({ title: 'Updated Title' })
    })

    await waitForHook(result, (r) => r.data?.title === 'Updated Title')
    expect(result.current.data!.title).toBe('Updated Title')
  })

  it('should soft-delete a page via remove()', async () => {
    const pageId = `page-delete-${Date.now()}`
    const dbName = uniqueDbName()
    const identity = createTestIdentity()

    const { result } = renderWithStore(
      () =>
        useDocument(PageSchema, pageId, {
          createIfMissing: { title: 'To Delete' },
          disableSync: true
        }),
      { dbName, identity }
    )

    await waitForHook(result, (r) => !r.loading && r.data !== null)

    // Delete
    await act(async () => {
      await result.current.remove()
    })

    await waitForHook(result, (r) => r.data === null)
    expect(result.current.data).toBeNull()
  })

  it('should persist page content to IndexedDB (Y.Doc)', async () => {
    const pageId = `page-persist-${Date.now()}`
    const dbName = uniqueDbName()
    const identity = createTestIdentity()

    // Create page and write content
    const { result, unmount } = renderWithStore(
      () =>
        useDocument(PageSchema, pageId, {
          createIfMissing: { title: 'Persist Test' },
          disableSync: true,
          persistDebounce: 0 // Immediate save
        }),
      { dbName, identity }
    )

    await waitForHook(result, (r) => !r.loading && r.doc !== null)

    // Write to the Y.Doc
    const text = result.current.doc!.getText('content')
    act(() => {
      text.insert(0, 'Persisted text content')
    })

    // Trigger save
    await act(async () => {
      await result.current.save()
    })

    // Unmount (simulates closing the app)
    unmount()

    // Re-mount with same DB and ID
    const { result: result2 } = renderWithStore(
      () => useDocument(PageSchema, pageId, { disableSync: true }),
      { dbName, identity }
    )

    await waitForHook(result2, (r) => !r.loading && r.doc !== null)

    // Verify content persisted
    const text2 = result2.current.doc!.getText('content')
    expect(text2.toString()).toBe('Persisted text content')
    expect(result2.current.data!.title).toBe('Persist Test')
  })

  it('should list pages with useQuery', async () => {
    const dbName = uniqueDbName()
    const identity = createTestIdentity()

    // First create some pages
    let mutateResult: ReturnType<typeof useMutate> | null = null

    const { unmount: unmount1 } = renderWithStore(
      () => {
        mutateResult = useMutate()
        return null
      },
      { dbName, identity }
    )

    // Wait for store to be ready
    await new Promise((resolve) => setTimeout(resolve, 200))

    await act(async () => {
      await mutateResult!.create(PageSchema, { title: 'Page A' })
      await mutateResult!.create(PageSchema, { title: 'Page B' })
      await mutateResult!.create(PageSchema, { title: 'Page C' })
    })

    unmount1()

    // Now query
    const { result } = renderWithStore(() => useQuery(PageSchema), { dbName, identity })

    await waitForHook(result, (r) => !r.loading && r.data.length >= 3)

    expect(result.current.data.length).toBeGreaterThanOrEqual(3)
    const titles = result.current.data.map((p) => p.title)
    expect(titles).toContain('Page A')
    expect(titles).toContain('Page B')
    expect(titles).toContain('Page C')
  })
})

// =============================================================================
// Tests: Database CRUD
// =============================================================================

describe('Database CRUD', () => {
  afterEach(() => {
    cleanup()
  })

  it('should create a database with default view', async () => {
    const dbId = `db-${Date.now()}`

    const { result } = renderWithStore(() =>
      useDocument(DatabaseSchema, dbId, {
        createIfMissing: { title: 'My Database', defaultView: 'table' },
        disableSync: true
      })
    )

    await waitForHook(result, (r) => !r.loading && r.data !== null)

    expect(result.current.data!.title).toBe('My Database')
    expect(result.current.data!.defaultView).toBe('table')
    expect(result.current.doc).not.toBeNull()
  })

  it('should update database properties', async () => {
    const dbId = `db-update-${Date.now()}`

    const { result } = renderWithStore(() =>
      useDocument(DatabaseSchema, dbId, {
        createIfMissing: { title: 'Original DB', defaultView: 'table' },
        disableSync: true
      })
    )

    await waitForHook(result, (r) => !r.loading && r.data !== null)

    await act(async () => {
      await result.current.update({ title: 'Renamed DB', defaultView: 'board' })
    })

    await waitForHook(result, (r) => r.data?.title === 'Renamed DB')
    expect(result.current.data!.title).toBe('Renamed DB')
    expect(result.current.data!.defaultView).toBe('board')
  })

  it('should persist database across sessions', async () => {
    const dbId = `db-persist-${Date.now()}`
    const dbName = uniqueDbName()
    const identity = createTestIdentity()

    // Create
    const { result, unmount } = renderWithStore(
      () =>
        useDocument(DatabaseSchema, dbId, {
          createIfMissing: { title: 'Persistent DB', defaultView: 'gallery' },
          disableSync: true,
          persistDebounce: 0
        }),
      { dbName, identity }
    )

    await waitForHook(result, (r) => !r.loading && r.data !== null)

    // Update
    await act(async () => {
      await result.current.update({ icon: '📊' })
    })

    await waitForHook(result, (r) => r.data?.icon === '📊')

    unmount()

    // Reload
    const { result: result2 } = renderWithStore(
      () => useDocument(DatabaseSchema, dbId, { disableSync: true }),
      { dbName, identity }
    )

    await waitForHook(result2, (r) => !r.loading && r.data !== null)

    expect(result2.current.data!.title).toBe('Persistent DB')
    expect(result2.current.data!.defaultView).toBe('gallery')
    expect(result2.current.data!.icon).toBe('📊')
  })

  it('should distinguish pages from databases in queries', async () => {
    const dbName = uniqueDbName()
    const identity = createTestIdentity()

    let mutateResult: ReturnType<typeof useMutate> | null = null

    const { unmount } = renderWithStore(
      () => {
        mutateResult = useMutate()
        return null
      },
      { dbName, identity }
    )

    await new Promise((resolve) => setTimeout(resolve, 200))

    await act(async () => {
      await mutateResult!.create(PageSchema, { title: 'A Page' })
      await mutateResult!.create(DatabaseSchema, { title: 'A Database', defaultView: 'table' })
      await mutateResult!.create(PageSchema, { title: 'Another Page' })
    })

    unmount()

    // Query pages only
    const { result: pageResult } = renderWithStore(() => useQuery(PageSchema), { dbName, identity })
    await waitForHook(pageResult, (r) => !r.loading && r.data.length >= 2)
    expect(pageResult.current.data.every((p) => p.schemaId === PageSchema._schemaId)).toBe(true)

    cleanup()

    // Query databases only
    const { result: dbResult } = renderWithStore(() => useQuery(DatabaseSchema), {
      dbName,
      identity
    })
    await waitForHook(dbResult, (r) => !r.loading && r.data.length >= 1)
    expect(dbResult.current.data.every((d) => d.schemaId === DatabaseSchema._schemaId)).toBe(true)
    expect(dbResult.current.data[0].title).toBe('A Database')
  })
})

// =============================================================================
// Tests: Y.Doc Content Persistence
// =============================================================================

describe('Y.Doc Persistence', () => {
  afterEach(() => {
    cleanup()
  })

  it('should persist rich text edits across page reloads', async () => {
    const pageId = `ydoc-persist-${Date.now()}`
    const dbName = uniqueDbName()
    const identity = createTestIdentity()

    // Session 1: Write content
    const { result: r1, unmount: u1 } = renderWithStore(
      () =>
        useDocument(PageSchema, pageId, {
          createIfMissing: { title: 'Rich Text Page' },
          disableSync: true,
          persistDebounce: 0
        }),
      { dbName, identity }
    )

    await waitForHook(r1, (r) => !r.loading && r.doc !== null)

    // Simulate editor content
    act(() => {
      const fragment = r1.current.doc!.getXmlFragment('content')
      const p = new Y.XmlElement('paragraph')
      const text = new Y.XmlText('Hello world')
      p.insert(0, [text])
      fragment.insert(0, [p])
    })

    await act(async () => {
      await r1.current.save()
    })
    u1()

    // Session 2: Verify content loaded
    const { result: r2 } = renderWithStore(
      () => useDocument(PageSchema, pageId, { disableSync: true }),
      { dbName, identity }
    )

    await waitForHook(r2, (r) => !r.loading && r.doc !== null)

    const fragment2 = r2.current.doc!.getXmlFragment('content')
    expect(fragment2.length).toBe(1)
    const para = fragment2.get(0) as Y.XmlElement
    expect(para.nodeName).toBe('paragraph')
  })

  it('should persist database Y.Doc content independently', async () => {
    const dbId = `db-ydoc-${Date.now()}`
    const dbName = uniqueDbName()
    const identity = createTestIdentity()

    // Write to database doc
    const { result: r1, unmount: u1 } = renderWithStore(
      () =>
        useDocument(DatabaseSchema, dbId, {
          createIfMissing: { title: 'DB with Content', defaultView: 'table' },
          disableSync: true,
          persistDebounce: 0
        }),
      { dbName, identity }
    )

    await waitForHook(r1, (r) => !r.loading && r.doc !== null)

    // Write some structured data to the Y.Doc (like column definitions)
    act(() => {
      const columns = r1.current.doc!.getArray('columns')
      columns.push([
        { id: 'col1', name: 'Name', type: 'text' },
        { id: 'col2', name: 'Status', type: 'select' }
      ])
    })

    await act(async () => {
      await r1.current.save()
    })
    u1()

    // Reload
    const { result: r2 } = renderWithStore(
      () => useDocument(DatabaseSchema, dbId, { disableSync: true }),
      { dbName, identity }
    )

    await waitForHook(r2, (r) => !r.loading && r.doc !== null)

    const columns2 = r2.current.doc!.getArray('columns')
    expect(columns2.length).toBe(2)
    expect((columns2.get(0) as any).name).toBe('Name')
    expect((columns2.get(1) as any).name).toBe('Status')
  })
})

// =============================================================================
// Tests: useMutate transactions
// =============================================================================

describe('useMutate', () => {
  afterEach(() => {
    cleanup()
  })

  it('should create and remove nodes', async () => {
    const dbName = uniqueDbName()
    const identity = createTestIdentity()

    let mutate: ReturnType<typeof useMutate> | null = null
    let query: ReturnType<typeof useQuery<(typeof PageSchema)['_properties']>> | null = null

    renderWithStore(
      () => {
        mutate = useMutate()
        query = useQuery(PageSchema)
        return null
      },
      { dbName, identity }
    )

    // Wait for store ready
    await new Promise((resolve) => setTimeout(resolve, 200))

    // Create
    let createdNode: any
    await act(async () => {
      createdNode = await mutate!.create(PageSchema, { title: 'Mutate Test' })
    })

    expect(createdNode).toBeDefined()
    expect(createdNode.title).toBe('Mutate Test')

    // Wait for query to update
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Remove
    await act(async () => {
      await mutate!.remove(createdNode.id)
    })

    // Wait for update
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Verify removed from query (soft delete)
    const remaining = query!.data.filter((p) => p.id === createdNode.id)
    expect(remaining.length).toBe(0)
  })
})
