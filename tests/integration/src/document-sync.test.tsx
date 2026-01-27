/**
 * Document Sync Integration Tests
 *
 * Tests the full sync lifecycle through useDocument hooks with simulated
 * Y.Doc transport (replicating what WebRTC does over the data channel).
 *
 * Since WebRTC can't connect within a single browser process, we simulate
 * the transport layer by directly forwarding Y.Doc updates between two
 * independent useDocument instances (each with their own NodeStore/IndexedDB).
 *
 * This tests:
 * - Document sharing (creator → joiner)
 * - Live editing (real-time bidirectional updates)
 * - Disconnect/reconnect with offline edits
 * - Database properties sync
 * - Rich text (XmlFragment) sync
 * - Concurrent edits (CRDT merge)
 * - Persistence after sync
 */
import { describe, it, expect, afterEach } from 'vitest'
import React, { useEffect, useState } from 'react'
import { render, cleanup, act } from '@testing-library/react'
import { XNetProvider, useDocument } from '@xnet/react'
import { PageSchema, DatabaseSchema, IndexedDBNodeStorageAdapter } from '@xnet/data'
import type { DID } from '@xnet/core'
import { generateIdentity } from '@xnet/identity'
import * as Y from 'yjs'

// =============================================================================
// Test Helpers
// =============================================================================

function uniqueDbName() {
  return `xnet-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createTestIdentity() {
  const { identity, privateKey } = generateIdentity()
  return { did: identity.did, signingKey: privateKey }
}

/**
 * Provider that opens IndexedDB adapter before rendering children
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
 * Render a hook inside a TestProvider
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
 * Wait for a condition on hook result
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

/**
 * Set up bidirectional Y.Doc sync between two docs (simulates WebRTC data channel).
 * Returns a controller to disconnect/reconnect.
 */
function setupDocSync(doc1: Y.Doc, doc2: Y.Doc) {
  let connected = true

  // Initial full sync (exchange state vectors)
  const sv1 = Y.encodeStateVector(doc1)
  const sv2 = Y.encodeStateVector(doc2)
  const diff1to2 = Y.encodeStateAsUpdate(doc1, sv2)
  const diff2to1 = Y.encodeStateAsUpdate(doc2, sv1)
  Y.applyUpdate(doc2, diff1to2, 'sync')
  Y.applyUpdate(doc1, diff2to1, 'sync')

  // Live update forwarding
  const handler1 = (update: Uint8Array, origin: unknown) => {
    if (!connected || origin === 'sync') return
    Y.applyUpdate(doc2, update, 'sync')
  }
  const handler2 = (update: Uint8Array, origin: unknown) => {
    if (!connected || origin === 'sync') return
    Y.applyUpdate(doc1, update, 'sync')
  }

  doc1.on('update', handler1)
  doc2.on('update', handler2)

  return {
    disconnect() {
      connected = false
    },
    reconnect() {
      connected = true
      // Re-sync after reconnection (exchange missed updates)
      const sv1 = Y.encodeStateVector(doc1)
      const sv2 = Y.encodeStateVector(doc2)
      const diff1to2 = Y.encodeStateAsUpdate(doc1, sv2)
      const diff2to1 = Y.encodeStateAsUpdate(doc2, sv1)
      Y.applyUpdate(doc2, diff1to2, 'sync')
      Y.applyUpdate(doc1, diff2to1, 'sync')
    },
    destroy() {
      doc1.off('update', handler1)
      doc2.off('update', handler2)
    },
    get isConnected() {
      return connected
    }
  }
}

// =============================================================================
// Tests: Page Document Sharing
// =============================================================================

describe('Page Document Sharing', () => {
  afterEach(() => cleanup())

  it('should sync page title from creator to joiner via Y.Doc meta map', async () => {
    const docId = `shared-page-${Date.now()}`

    // User 1 creates the page
    const { result: user1 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Created by User 1' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)

    // User 2 joins the same page (separate store, separate identity)
    const { result: user2 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: '' }, // placeholder, will be overwritten by sync
        disableSync: true
      })
    )

    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    // Simulate WebRTC connection between the two Y.Docs
    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)

    // User 2's meta map should now have user 1's title
    const meta2 = user2.current.doc!.getMap('meta')
    expect(meta2.get('title')).toBe('Created by User 1')
    expect(meta2.get('_schemaId')).toBe('xnet://xnet.fyi/Page')

    sync.destroy()
  })

  it('should sync page properties update from one peer to another', async () => {
    const docId = `sync-update-${Date.now()}`

    // Both users open the same doc
    const { result: user1 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Initial' },
        disableSync: true
      })
    )
    const { result: user2 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Initial' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)
    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    // Connect sync
    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)

    // User 1 updates title via the hook's update() function
    await act(async () => {
      await user1.current.update({ title: 'Updated by User 1' })
    })

    // The meta map update should propagate to user 2's Y.Doc
    const meta2 = user2.current.doc!.getMap('meta')
    expect(meta2.get('title')).toBe('Updated by User 1')

    sync.destroy()
  })

  it('should sync icon and cover properties', async () => {
    const docId = `sync-props-${Date.now()}`

    const { result: user1 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Props Test', icon: '📝' },
        disableSync: true
      })
    )
    const { result: user2 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: '' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)
    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)

    const meta2 = user2.current.doc!.getMap('meta')
    expect(meta2.get('title')).toBe('Props Test')
    expect(meta2.get('icon')).toBe('📝')

    sync.destroy()
  })
})

// =============================================================================
// Tests: Live Editing
// =============================================================================

describe('Live Editing', () => {
  afterEach(() => cleanup())

  it('should sync rich text edits in real-time (XmlFragment)', async () => {
    const docId = `live-edit-${Date.now()}`

    const { result: user1 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Live Edit' },
        disableSync: true
      })
    )
    const { result: user2 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Live Edit' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)
    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)

    // User 1 writes rich text (simulating TipTap editor)
    const fragment1 = user1.current.doc!.getXmlFragment('content')
    const para = new Y.XmlElement('paragraph')
    const text = new Y.XmlText('Hello from User 1!')
    para.insert(0, [text])
    fragment1.insert(0, [para])

    // Should appear in User 2's doc immediately
    const fragment2 = user2.current.doc!.getXmlFragment('content')
    expect(fragment2.length).toBe(1)
    const syncedPara = fragment2.get(0) as Y.XmlElement
    expect(syncedPara.nodeName).toBe('paragraph')
    expect(syncedPara.toString()).toContain('Hello from User 1!')

    // User 2 adds more text
    const para2 = new Y.XmlElement('paragraph')
    const text2 = new Y.XmlText('Reply from User 2!')
    para2.insert(0, [text2])
    fragment2.insert(1, [para2])

    // Should appear in User 1's doc
    expect(fragment1.length).toBe(2)
    const syncedPara2 = fragment1.get(1) as Y.XmlElement
    expect(syncedPara2.toString()).toContain('Reply from User 2!')

    sync.destroy()
  })

  it('should sync Y.Text edits (plain text content)', async () => {
    const docId = `live-text-${Date.now()}`

    const { result: user1 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Text Sync' },
        disableSync: true
      })
    )
    const { result: user2 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Text Sync' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)
    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)

    // User 1 types characters one by one (simulating typing)
    const text1 = user1.current.doc!.getText('notes')
    text1.insert(0, 'H')
    text1.insert(1, 'e')
    text1.insert(2, 'l')
    text1.insert(3, 'l')
    text1.insert(4, 'o')

    const text2 = user2.current.doc!.getText('notes')
    expect(text2.toString()).toBe('Hello')

    // User 2 appends
    text2.insert(5, ' World')
    expect(text1.toString()).toBe('Hello World')

    sync.destroy()
  })

  it('should handle concurrent edits at same position (CRDT merge)', async () => {
    const docId = `concurrent-${Date.now()}`

    const { result: user1 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Concurrent' },
        disableSync: true
      })
    )
    const { result: user2 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Concurrent' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)
    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    // Start with shared content, then disconnect
    const text1 = user1.current.doc!.getText('content')
    text1.insert(0, 'Base text. ')

    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)
    const text2 = user2.current.doc!.getText('content')
    expect(text2.toString()).toBe('Base text. ')

    // Disconnect - both users edit offline
    sync.disconnect()

    text1.insert(text1.length, 'User 1 addition. ')
    text2.insert(text2.length, 'User 2 addition. ')

    // Verify they diverged
    expect(text1.toString()).toBe('Base text. User 1 addition. ')
    expect(text2.toString()).toBe('Base text. User 2 addition. ')

    // Reconnect - CRDT merges both edits
    sync.reconnect()

    // Both should converge to the same content
    expect(text1.toString()).toBe(text2.toString())
    expect(text1.toString()).toContain('Base text.')
    expect(text1.toString()).toContain('User 1 addition.')
    expect(text1.toString()).toContain('User 2 addition.')

    sync.destroy()
  })

  it('should handle concurrent property updates (last-writer-wins in meta map)', async () => {
    const docId = `concurrent-props-${Date.now()}`

    const { result: user1 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Original' },
        disableSync: true
      })
    )
    const { result: user2 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Original' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)
    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)

    // Disconnect
    sync.disconnect()

    // Both update the same property
    await act(async () => {
      await user1.current.update({ title: 'Title by User 1' })
    })
    await act(async () => {
      await user2.current.update({ title: 'Title by User 2' })
    })

    // Reconnect - meta map will merge (last write wins per Yjs Map semantics)
    sync.reconnect()

    const meta1 = user1.current.doc!.getMap('meta')
    const meta2 = user2.current.doc!.getMap('meta')

    // Both should converge to the same value
    expect(meta1.get('title')).toBe(meta2.get('title'))

    sync.destroy()
  })
})

// =============================================================================
// Tests: Disconnect & Reconnect
// =============================================================================

describe('Disconnect & Reconnect', () => {
  afterEach(() => cleanup())

  it('should resume sync after disconnect with offline edits', async () => {
    const docId = `disconnect-${Date.now()}`

    const { result: user1 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Disconnect Test' },
        disableSync: true
      })
    )
    const { result: user2 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Disconnect Test' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)
    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)

    // Initial shared content
    const fragment1 = user1.current.doc!.getXmlFragment('content')
    const p1 = new Y.XmlElement('paragraph')
    p1.insert(0, [new Y.XmlText('Paragraph 1')])
    fragment1.insert(0, [p1])

    const fragment2 = user2.current.doc!.getXmlFragment('content')
    expect(fragment2.length).toBe(1)

    // Disconnect
    sync.disconnect()

    // User 1 adds paragraph while offline
    const p2 = new Y.XmlElement('paragraph')
    p2.insert(0, [new Y.XmlText('Added offline by User 1')])
    fragment1.insert(1, [p2])

    // User 2 adds different paragraph while offline
    const p3 = new Y.XmlElement('paragraph')
    p3.insert(0, [new Y.XmlText('Added offline by User 2')])
    fragment2.insert(1, [p3])

    // Verify divergence
    expect(fragment1.length).toBe(2)
    expect(fragment2.length).toBe(2)

    // Reconnect
    sync.reconnect()

    // Both should have all 3 paragraphs
    expect(fragment1.length).toBe(3)
    expect(fragment2.length).toBe(3)
    expect(fragment1.toString()).toContain('Paragraph 1')
    expect(fragment1.toString()).toContain('Added offline by User 1')
    expect(fragment1.toString()).toContain('Added offline by User 2')

    sync.destroy()
  })

  it('should handle multiple disconnect/reconnect cycles', async () => {
    const docId = `multi-disconnect-${Date.now()}`

    const { result: user1 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Multi DC' },
        disableSync: true
      })
    )
    const { result: user2 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Multi DC' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)
    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)
    const text1 = user1.current.doc!.getText('log')
    const text2 = user2.current.doc!.getText('log')

    // Cycle 1: connected edit
    text1.insert(0, 'A')
    expect(text2.toString()).toBe('A')

    // Cycle 2: disconnected edit
    sync.disconnect()
    text1.insert(text1.length, 'B')
    text2.insert(text2.length, 'C')
    sync.reconnect()
    expect(text1.toString()).toBe(text2.toString())
    expect(text1.toString()).toContain('A')
    expect(text1.toString()).toContain('B')
    expect(text1.toString()).toContain('C')

    // Cycle 3: connected again
    text2.insert(text2.length, 'D')
    expect(text1.toString()).toContain('D')

    // Cycle 4: disconnect again
    sync.disconnect()
    text1.insert(text1.length, 'E')
    sync.reconnect()
    expect(text2.toString()).toContain('E')

    sync.destroy()
  })
})

// =============================================================================
// Tests: Database Schema Sync
// =============================================================================

describe('Database Schema Sync', () => {
  afterEach(() => cleanup())

  it('should sync database properties (title, defaultView, icon)', async () => {
    const docId = `db-sync-${Date.now()}`

    const { result: user1 } = renderWithStore(() =>
      useDocument(DatabaseSchema, docId, {
        createIfMissing: { title: 'My Database', defaultView: 'table' },
        disableSync: true
      })
    )
    const { result: user2 } = renderWithStore(() =>
      useDocument(DatabaseSchema, docId, {
        createIfMissing: { title: '' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)
    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)

    // User 2 should receive database properties
    const meta2 = user2.current.doc!.getMap('meta')
    expect(meta2.get('title')).toBe('My Database')
    expect(meta2.get('defaultView')).toBe('table')
    expect(meta2.get('_schemaId')).toBe('xnet://xnet.fyi/Database')

    sync.destroy()
  })

  it('should sync database view change (table → board)', async () => {
    const docId = `db-view-${Date.now()}`

    const { result: user1 } = renderWithStore(() =>
      useDocument(DatabaseSchema, docId, {
        createIfMissing: { title: 'Tasks', defaultView: 'table' },
        disableSync: true
      })
    )
    const { result: user2 } = renderWithStore(() =>
      useDocument(DatabaseSchema, docId, {
        createIfMissing: { title: 'Tasks', defaultView: 'table' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)
    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)

    // User 1 changes view
    await act(async () => {
      await user1.current.update({ defaultView: 'board' })
    })

    const meta2 = user2.current.doc!.getMap('meta')
    expect(meta2.get('defaultView')).toBe('board')

    // User 2 changes it back
    await act(async () => {
      await user2.current.update({ defaultView: 'table' })
    })

    const meta1 = user1.current.doc!.getMap('meta')
    expect(meta1.get('defaultView')).toBe('table')

    sync.destroy()
  })

  it('should sync database Y.Doc content independently of properties', async () => {
    const docId = `db-content-${Date.now()}`

    const { result: user1 } = renderWithStore(() =>
      useDocument(DatabaseSchema, docId, {
        createIfMissing: { title: 'Content DB', defaultView: 'table' },
        disableSync: true
      })
    )
    const { result: user2 } = renderWithStore(() =>
      useDocument(DatabaseSchema, docId, {
        createIfMissing: { title: 'Content DB', defaultView: 'table' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)
    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)

    // User 1 adds structured data to Y.Doc (e.g., row data for a database view)
    const rows1 = user1.current.doc!.getArray('rows')
    const row = new Y.Map()
    row.set('id', 'row-1')
    row.set('name', 'Task 1')
    row.set('status', 'todo')
    rows1.insert(0, [row])

    // User 2 should see the row
    const rows2 = user2.current.doc!.getArray('rows')
    expect(rows2.length).toBe(1)
    const syncedRow = rows2.get(0) as Y.Map<unknown>
    expect(syncedRow.get('name')).toBe('Task 1')
    expect(syncedRow.get('status')).toBe('todo')

    // User 2 adds another row
    const row2 = new Y.Map()
    row2.set('id', 'row-2')
    row2.set('name', 'Task 2')
    row2.set('status', 'done')
    rows2.insert(1, [row2])

    expect(rows1.length).toBe(2)

    // User 1 updates the first row's status
    const r1 = rows1.get(0) as Y.Map<unknown>
    r1.set('status', 'in-progress')

    // Both should see the update
    const r2 = rows2.get(0) as Y.Map<unknown>
    expect(r2.get('status')).toBe('in-progress')

    sync.destroy()
  })
})

// =============================================================================
// Tests: Persistence After Sync
// =============================================================================

describe('Persistence After Sync', () => {
  afterEach(() => cleanup())

  it('should persist synced content to IndexedDB (survives reload)', async () => {
    const docId = `persist-sync-${Date.now()}`
    const dbName = uniqueDbName()
    const identity = createTestIdentity()

    // Session 1: User 1 creates and syncs content
    const { result: user1, unmount: unmount1 } = renderWithStore(
      () =>
        useDocument(PageSchema, docId, {
          createIfMissing: { title: 'Persist Me' },
          disableSync: true
        }),
      { dbName, identity }
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)

    // Write rich text content
    const fragment = user1.current.doc!.getXmlFragment('content')
    const para = new Y.XmlElement('paragraph')
    para.insert(0, [new Y.XmlText('This should persist')])
    fragment.insert(0, [para])

    // Trigger save (the hook debounces saves, so call it directly)
    await act(async () => {
      await user1.current.save()
    })

    // Unmount (simulates closing the page)
    unmount1()
    cleanup()

    // Wait for IndexedDB to flush
    await new Promise((r) => setTimeout(r, 200))

    // Session 2: Reload - content should be restored from IndexedDB
    const { result: user1Reloaded } = renderWithStore(
      () =>
        useDocument(PageSchema, docId, {
          disableSync: true
        }),
      { dbName, identity }
    )

    await waitForHook(user1Reloaded, (r) => !r.loading && r.doc !== null)

    // Content should be restored
    const reloadedFragment = user1Reloaded.current.doc!.getXmlFragment('content')
    expect(reloadedFragment.length).toBe(1)
    expect(reloadedFragment.toString()).toContain('This should persist')
  })

  it('should persist database rows after sync and reload', async () => {
    const docId = `persist-db-${Date.now()}`
    const dbName = uniqueDbName()
    const identity = createTestIdentity()

    // Session 1: Create database with rows
    const { result: user1, unmount: unmount1 } = renderWithStore(
      () =>
        useDocument(DatabaseSchema, docId, {
          createIfMissing: { title: 'Persistent DB', defaultView: 'table' },
          disableSync: true
        }),
      { dbName, identity }
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)

    // Add rows
    const rows = user1.current.doc!.getArray('rows')
    for (let i = 0; i < 5; i++) {
      const row = new Y.Map()
      row.set('id', `row-${i}`)
      row.set('name', `Task ${i}`)
      rows.insert(i, [row])
    }

    await act(async () => {
      await user1.current.save()
    })

    unmount1()
    cleanup()
    await new Promise((r) => setTimeout(r, 200))

    // Session 2: Reload
    const { result: reloaded } = renderWithStore(
      () =>
        useDocument(DatabaseSchema, docId, {
          disableSync: true
        }),
      { dbName, identity }
    )

    await waitForHook(reloaded, (r) => !r.loading && r.doc !== null)

    const reloadedRows = reloaded.current.doc!.getArray('rows')
    expect(reloadedRows.length).toBe(5)
    const firstRow = reloadedRows.get(0) as Y.Map<unknown>
    expect(firstRow.get('name')).toBe('Task 0')
    const lastRow = reloadedRows.get(4) as Y.Map<unknown>
    expect(lastRow.get('name')).toBe('Task 4')
  })
})

// =============================================================================
// Tests: Edge Cases
// =============================================================================

describe('Sync Edge Cases', () => {
  afterEach(() => cleanup())

  it('should handle delete propagation via meta map', async () => {
    const docId = `delete-sync-${Date.now()}`

    const { result: user1 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'To Delete' },
        disableSync: true
      })
    )
    const { result: user2 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'To Delete' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)
    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)

    // User 1 marks the document as deleted via meta
    const meta1 = user1.current.doc!.getMap('meta')
    meta1.set('_deleted', true)

    // User 2 should see the deletion marker
    const meta2 = user2.current.doc!.getMap('meta')
    expect(meta2.get('_deleted')).toBe(true)

    sync.destroy()
  })

  it('should handle large document sync (100+ paragraphs)', async () => {
    const docId = `large-doc-${Date.now()}`

    const { result: user1 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Large Doc' },
        disableSync: true
      })
    )
    const { result: user2 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Large Doc' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)
    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    // User 1 creates 100 paragraphs
    const fragment1 = user1.current.doc!.getXmlFragment('content')
    for (let i = 0; i < 100; i++) {
      const para = new Y.XmlElement('paragraph')
      para.insert(0, [new Y.XmlText(`Paragraph ${i}: ${' lorem ipsum'.repeat(5)}`)])
      fragment1.insert(i, [para])
    }

    // Now sync (simulates initial connection with large existing document)
    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)

    const fragment2 = user2.current.doc!.getXmlFragment('content')
    expect(fragment2.length).toBe(100)

    // Verify first and last
    expect(fragment2.get(0).toString()).toContain('Paragraph 0')
    expect(fragment2.get(99).toString()).toContain('Paragraph 99')

    sync.destroy()
  })

  it('should handle rapid sequential edits without losing data', async () => {
    const docId = `rapid-edits-${Date.now()}`

    const { result: user1 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Rapid' },
        disableSync: true
      })
    )
    const { result: user2 } = renderWithStore(() =>
      useDocument(PageSchema, docId, {
        createIfMissing: { title: 'Rapid' },
        disableSync: true
      })
    )

    await waitForHook(user1, (r) => !r.loading && r.doc !== null)
    await waitForHook(user2, (r) => !r.loading && r.doc !== null)

    const sync = setupDocSync(user1.current.doc!, user2.current.doc!)

    const text1 = user1.current.doc!.getText('rapid')
    const text2 = user2.current.doc!.getText('rapid')

    // 50 rapid edits from each side
    for (let i = 0; i < 50; i++) {
      text1.insert(text1.length, `A${i}`)
      text2.insert(text2.length, `B${i}`)
    }

    // Both should have all content
    const content = text1.toString()
    expect(content).toBe(text2.toString())
    for (let i = 0; i < 50; i++) {
      expect(content).toContain(`A${i}`)
      expect(content).toContain(`B${i}`)
    }

    sync.destroy()
  })
})
