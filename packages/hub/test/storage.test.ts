import type {
  BlobMeta,
  DocMeta,
  GrantIndexRecord,
  HubStorage,
  ShareLinkRecord
} from '../src/storage/interface'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../src/storage/memory'
import { createSQLiteStorage } from '../src/storage/sqlite'

// Detect whether SQLite native bindings are available (may fail on mismatched Node.js versions)
let sqliteAvailable = false
try {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hub-probe-'))
  createSQLiteStorage(tmpDir).close()
  rmSync(tmpDir, { recursive: true, force: true })
  sqliteAvailable = true
} catch {
  sqliteAvailable = false
}

type StorageFactory = {
  name: string
  create: () => { storage: HubStorage; cleanup: () => void }
}

const storageFactories: StorageFactory[] = [
  ...(sqliteAvailable
    ? [
        {
          name: 'SQLite',
          create: () => {
            const dir = mkdtempSync(join(tmpdir(), 'hub-test-'))
            return {
              storage: createSQLiteStorage(dir),
              cleanup: () => rmSync(dir, { recursive: true, force: true })
            }
          }
        }
      ]
    : []),
  {
    name: 'Memory',
    create: () => ({ storage: createMemoryStorage(), cleanup: () => {} })
  }
]

describe.each(storageFactories)('HubStorage ($name)', ({ create }: StorageFactory) => {
  let storage: HubStorage
  let cleanup: () => void

  beforeEach(() => {
    const result = create()
    storage = result.storage
    cleanup = result.cleanup
  })

  afterEach(async () => {
    await storage.close()
    cleanup()
  })

  describe('doc state', () => {
    it('returns null for unknown doc', async () => {
      expect(await storage.getDocState('missing')).toBeNull()
    })

    it('stores and retrieves doc state', async () => {
      const state = new Uint8Array([1, 2, 3, 4, 5])
      await storage.setDocState('doc-1', state)

      const result = await storage.getDocState('doc-1')
      expect(result).toEqual(state)
    })

    it('overwrites existing state', async () => {
      await storage.setDocState('doc-1', new Uint8Array([1, 2, 3]))
      await storage.setDocState('doc-1', new Uint8Array([4, 5, 6]))

      const result = await storage.getDocState('doc-1')
      expect(result).toEqual(new Uint8Array([4, 5, 6]))
    })
  })

  describe('node changes', () => {
    const makeChange = (room: string, hash: string, lamport: number) => ({
      id: `change-${hash}`,
      type: 'node-change',
      hash,
      room,
      nodeId: 'node-1',
      schemaId: 'xnet://xnet.dev/Task',
      lamportTime: lamport,
      lamportAuthor: 'did:key:zAuthor',
      authorDid: 'did:key:zAuthor',
      wallTime: 1,
      parentHash: null,
      payload: { nodeId: 'node-1', properties: { title: 't' } },
      signatureB64: 'AA=='
    })

    it('clearNodeChanges wipes a room, returns the count, and frees the hashes', async () => {
      await storage.appendNodeChange('room-a', makeChange('room-a', 'h1', 1))
      await storage.appendNodeChange('room-a', makeChange('room-a', 'h2', 2))
      await storage.appendNodeChange('room-b', makeChange('room-b', 'h3', 1))

      const cleared = await storage.clearNodeChanges('room-a')
      expect(cleared).toBe(2)

      // room-a is empty; room-b is untouched.
      expect((await storage.getNodeChangesSince('room-a', 0)).changes).toHaveLength(0)
      expect((await storage.getNodeChangesSince('room-b', 0)).changes).toHaveLength(1)
      expect(await storage.getHighWaterMark('room-a')).toBe(0)

      // The dedup map was cleared, so the same change can be re-appended.
      expect(await storage.hasNodeChange('h1')).toBe(false)
      await storage.appendNodeChange('room-a', makeChange('room-a', 'h1', 1))
      expect((await storage.getNodeChangesSince('room-a', 0)).changes).toHaveLength(1)
    })

    it('clearNodeChanges on an unknown room is a no-op returning 0', async () => {
      expect(await storage.clearNodeChanges('nope')).toBe(0)
    })

    // A cold catch-up of more than one page must not lose the tail. The pull path
    // pages the room log, but the client only ever advances its cursor to the
    // reported `highWaterMark` — so if that mark runs ahead of the last change
    // actually handed back, every change in between is skipped PERMANENTLY (the
    // cursor is persisted and monotonic, so the gap is never re-requested).
    it('pages a >1-page catch-up without skipping changes', async () => {
      const TOTAL = 2500
      for (let i = 1; i <= TOTAL; i++) {
        await storage.appendNodeChange('room-big', makeChange('room-big', `h${i}`, i))
      }

      // Replay exactly what the client does: request from the cursor, apply the
      // page, advance the cursor to the reported high-water mark, repeat.
      const seen: number[] = []
      let cursor = 0
      for (let page = 0; page < 20; page++) {
        const { changes, highWaterMark } = await storage.getNodeChangesSince('room-big', cursor)
        if (changes.length === 0) break
        for (const change of changes) seen.push(change.lamportTime)
        expect(highWaterMark).toBeGreaterThan(cursor)
        cursor = highWaterMark
      }

      expect(seen).toHaveLength(TOTAL)
      expect(seen).toEqual(Array.from({ length: TOTAL }, (_, i) => i + 1))
      expect(cursor).toBe(TOTAL)
    })

    // The page boundary must never fall INSIDE a group of changes sharing one
    // lamport: the next request asks for `lamport > cursor`, so a same-lamport
    // sibling left behind on the far side of the boundary is skipped for good.
    it('never splits a same-lamport group across a page boundary', async () => {
      // 1200 changes at lamport 7 (distinct authors), then a later change — the
      // tie group alone is larger than one page.
      for (let i = 0; i < 1200; i++) {
        await storage.appendNodeChange('room-tie', {
          ...makeChange('room-tie', `tie${i}`, 7),
          lamportAuthor: `did:key:zAuthor${String(i).padStart(4, '0')}`
        })
      }
      await storage.appendNodeChange('room-tie', makeChange('room-tie', 'after', 8))

      const first = await storage.getNodeChangesSince('room-tie', 0)
      // Either the whole tie group came back, or the mark stayed below it — what
      // must NOT happen is a mark of 7 with only part of the group delivered.
      if (first.highWaterMark >= 7) {
        expect(first.changes.filter((c) => c.lamportTime === 7)).toHaveLength(1200)
      }

      const second = await storage.getNodeChangesSince('room-tie', first.highWaterMark)
      const total = first.changes.length + second.changes.length
      expect(total).toBe(1201)
    })

    // The client's rollback guard (0254/0260) keys off a high-water mark BELOW
    // its cursor to detect a hub that lost history. A short page must therefore
    // keep reporting the room-wide mark, or a restored-from-backup hub reads as
    // "caught up" and the guard never fires.
    it('reports the room-wide mark when the page is not full', async () => {
      await storage.appendNodeChange('room-small', makeChange('room-small', 's1', 4))
      await storage.appendNodeChange('room-small', makeChange('room-small', 's2', 9))

      const all = await storage.getNodeChangesSince('room-small', 0)
      expect(all.changes).toHaveLength(2)
      expect(all.highWaterMark).toBe(9)

      // Caught up: no changes, but still the room-wide mark (this is the value
      // the rollback guard compares against).
      const caughtUp = await storage.getNodeChangesSince('room-small', 9)
      expect(caughtUp.changes).toHaveLength(0)
      expect(caughtUp.highWaterMark).toBe(9)
    })

    // A wiped room must keep reporting 0 rather than echoing the cursor back:
    // the client reads a 0 mark as "fresh/reset hub" and deliberately declines
    // to re-offer its whole log (0260 — that re-offer flooded the cold-open).
    it('reports a 0 mark for an empty room even when the client has a cursor', async () => {
      const empty = await storage.getNodeChangesSince('room-never-used', 5000)
      expect(empty.changes).toHaveLength(0)
      expect(empty.highWaterMark).toBe(0)
      expect(empty.hasMore).toBe(false)
    })
  })

  describe('doc meta', () => {
    const meta: DocMeta = {
      docId: 'doc-1',
      ownerDid: 'did:key:z6Mk...',
      schemaIri: 'xnet://xnet.dev/Page',
      title: 'Test Page',
      properties: { status: 'draft' },
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    it('returns null for unknown doc', async () => {
      expect(await storage.getDocMeta('missing')).toBeNull()
    })

    it('stores and retrieves metadata', async () => {
      await storage.setDocMeta('doc-1', meta)
      const result = await storage.getDocMeta('doc-1')
      expect(result).toMatchObject({
        docId: 'doc-1',
        ownerDid: 'did:key:z6Mk...',
        schemaIri: 'xnet://xnet.dev/Page',
        title: 'Test Page'
      })
    })

    it('updates existing metadata', async () => {
      await storage.setDocMeta('doc-1', meta)
      await storage.setDocMeta('doc-1', { ...meta, title: 'Updated' })

      const result = await storage.getDocMeta('doc-1')
      expect(result?.title).toBe('Updated')
    })
  })

  describe('blobs', () => {
    const blobMeta: BlobMeta = {
      key: 'blake3-hash-abc',
      docId: 'doc-1',
      ownerDid: 'did:key:z6Mk...',
      sizeBytes: 5,
      contentType: 'application/octet-stream',
      createdAt: Date.now()
    }

    it('stores and retrieves blob', async () => {
      const data = new Uint8Array([10, 20, 30, 40, 50])
      await storage.putBlob('blake3-hash-abc', data, blobMeta)

      const result = await storage.getBlob('blake3-hash-abc')
      expect(result).toEqual(data)
    })

    it('returns null for unknown blob', async () => {
      expect(await storage.getBlob('missing')).toBeNull()
    })

    it('lists blobs by owner', async () => {
      await storage.putBlob('hash-1', new Uint8Array([1]), {
        ...blobMeta,
        key: 'hash-1',
        docId: 'doc-1'
      })
      await storage.putBlob('hash-2', new Uint8Array([2]), {
        ...blobMeta,
        key: 'hash-2',
        docId: 'doc-2'
      })
      await storage.putBlob('hash-3', new Uint8Array([3]), {
        ...blobMeta,
        key: 'hash-3',
        ownerDid: 'did:key:other',
        docId: 'doc-3'
      })

      const results = await storage.listBlobs('did:key:z6Mk...')
      expect(results).toHaveLength(2)
    })

    it('deletes blob', async () => {
      await storage.putBlob('hash-del', new Uint8Array([1, 2]), {
        ...blobMeta,
        key: 'hash-del'
      })
      await storage.deleteBlob('hash-del')

      expect(await storage.getBlob('hash-del')).toBeNull()
    })
  })

  describe('search', () => {
    beforeEach(async () => {
      await storage.setDocMeta('doc-1', {
        docId: 'doc-1',
        ownerDid: 'did:key:alice',
        schemaIri: 'xnet://xnet.dev/Page',
        title: 'Meeting Notes Q4',
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      await storage.setDocMeta('doc-2', {
        docId: 'doc-2',
        ownerDid: 'did:key:alice',
        schemaIri: 'xnet://xnet.dev/Task',
        title: 'Review Q4 Budget',
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      await storage.setDocMeta('doc-3', {
        docId: 'doc-3',
        ownerDid: 'did:key:bob',
        schemaIri: 'xnet://xnet.dev/Page',
        title: 'Personal Diary',
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
    })

    it('finds documents by title keyword', async () => {
      const results = await storage.search('Q4')
      expect(results.length).toBeGreaterThanOrEqual(2)
    })

    it('filters by schema', async () => {
      const results = await storage.search('Q4', { schemaIri: 'xnet://xnet.dev/Task' })
      expect(results).toHaveLength(1)
      expect(results[0].docId).toBe('doc-2')
    })

    it('respects limit and offset', async () => {
      const results = await storage.search('Q4', { limit: 1, offset: 0 })
      expect(results).toHaveLength(1)
    })
  })

  describe('database rows', () => {
    const row = (id: string, sortKey: string, data: Record<string, unknown> = {}) => ({
      id,
      databaseId: 'db-1',
      sortKey,
      data,
      searchable: '',
      createdAt: Date.now(),
      createdBy: 'did:key:tester',
      updatedAt: Date.now()
    })

    it('orders rows by sortKey code units, not locale collation', async () => {
      // 'Zz…' is what the fractional indexer emits for a move-to-front;
      // locale collation sorts it after 'a…' and reverts the move.
      await storage.insertDatabaseRow(row('row-b', 'a0'))
      await storage.insertDatabaseRow(row('row-c', 'a1'))
      await storage.insertDatabaseRow(row('row-a', 'Zz12'))

      const unsorted = await storage.queryDatabaseRows({ databaseId: 'db-1' })
      expect(unsorted.rows.map((r) => r.id)).toEqual(['row-a', 'row-b', 'row-c'])

      const sorted = await storage.queryDatabaseRows({
        databaseId: 'db-1',
        sorts: [{ columnId: 'sortKey', direction: 'asc' }]
      })
      expect(sorted.rows.map((r) => r.id)).toEqual(['row-a', 'row-b', 'row-c'])

      const descending = await storage.queryDatabaseRows({
        databaseId: 'db-1',
        sorts: [{ columnId: 'sortKey', direction: 'desc' }]
      })
      expect(descending.rows.map((r) => r.id)).toEqual(['row-c', 'row-b', 'row-a'])
    })

    it('sorts data columns with locale collation and falls back to id', async () => {
      await storage.insertDatabaseRow(row('row-1', 'a0', { name: 'beta' }))
      await storage.insertDatabaseRow(row('row-2', 'a1', { name: 'Alpha' }))
      await storage.insertDatabaseRow(row('row-3', 'a2', { name: 'beta' }))

      const byName = await storage.queryDatabaseRows({
        databaseId: 'db-1',
        sorts: [{ columnId: 'name', direction: 'asc' }]
      })
      expect(byName.rows.map((r) => r.id)).toEqual(['row-2', 'row-1', 'row-3'])
    })
  })

  describe('share links', () => {
    const link = (overrides: Partial<ShareLinkRecord> = {}): ShareLinkRecord => ({
      linkId: 'lnk-test-1',
      docId: 'doc-1',
      docType: 'page',
      role: 'read',
      secretHash: 'hash-abc',
      createdByDid: 'did:key:zOwner',
      label: 'team link',
      expiresAt: 0,
      maxUses: 0,
      useCount: 0,
      disabled: false,
      createdAt: 1000,
      ...overrides
    })

    it('inserts, fetches, lists, toggles, increments, and deletes links', async () => {
      await storage.insertShareLink(link())
      await storage.insertShareLink(link({ linkId: 'lnk-test-2', role: 'write', createdAt: 2000 }))

      const fetched = await storage.getShareLink('lnk-test-1')
      expect(fetched).toMatchObject({
        linkId: 'lnk-test-1',
        role: 'read',
        label: 'team link',
        disabled: false
      })

      const listed = await storage.listShareLinks('doc-1')
      expect(listed.map((entry) => entry.linkId)).toEqual(['lnk-test-2', 'lnk-test-1'])

      await storage.setShareLinkDisabled('lnk-test-1', true)
      expect((await storage.getShareLink('lnk-test-1'))?.disabled).toBe(true)

      await storage.incrementShareLinkUse('lnk-test-2')
      await storage.incrementShareLinkUse('lnk-test-2')
      expect((await storage.getShareLink('lnk-test-2'))?.useCount).toBe(2)

      await storage.deleteShareLink('lnk-test-1')
      expect(await storage.getShareLink('lnk-test-1')).toBeNull()
    })
  })

  describe('grants for docs', () => {
    const grant = (overrides: Partial<GrantIndexRecord> = {}): GrantIndexRecord => ({
      grantId: 'grant-1',
      granteeDid: 'did:key:zReader',
      resourceDocId: 'doc-1',
      actions: ['read'],
      expiresAt: 0,
      revokedAt: 0,
      createdAt: 1000,
      ...overrides
    })

    it('lists grants per doc and resolves the active grant', async () => {
      await storage.upsertGrantIndex(grant())
      await storage.upsertGrantIndex(
        grant({ grantId: 'grant-2', granteeDid: 'did:key:zWriter', actions: ['read', 'write'] })
      )

      const grants = await storage.listGrantsForDoc('doc-1')
      expect(grants.map((entry) => entry.grantId)).toEqual(['grant-1', 'grant-2'])

      const active = await storage.getActiveGrant('did:key:zWriter', 'doc-1')
      expect(active?.actions).toEqual(['read', 'write'])

      expect(await storage.getActiveGrant('did:key:zStranger', 'doc-1')).toBeNull()
    })

    it('share links and grants survive reopening the same SQLite file', async function () {
      if (!sqliteAvailable) return

      const dir = mkdtempSync(join(tmpdir(), 'hub-restart-'))
      try {
        const first = createSQLiteStorage(dir)
        await first.insertShareLink({
          linkId: 'lnk-restart',
          docId: 'doc-restart',
          docType: 'page',
          role: 'write',
          secretHash: 'hash-restart',
          createdByDid: 'did:key:zOwner',
          label: null,
          expiresAt: 0,
          maxUses: 0,
          useCount: 3,
          disabled: false,
          createdAt: 1000
        })
        await first.upsertGrantIndex(grant({ resourceDocId: 'doc-restart' }))
        await first.close()

        const reopened = createSQLiteStorage(dir)
        expect((await reopened.getShareLink('lnk-restart'))?.useCount).toBe(3)
        expect(await reopened.getActiveGrant('did:key:zReader', 'doc-restart')).not.toBeNull()
        await reopened.close()
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('revoked and expired grants stop being active but stay listed', async () => {
      await storage.upsertGrantIndex(grant())
      await storage.revokeGrant('grant-1', 5000)
      expect(await storage.getActiveGrant('did:key:zReader', 'doc-1')).toBeNull()
      expect((await storage.listGrantsForDoc('doc-1'))[0]?.revokedAt).toBe(5000)
      expect(await storage.listGrantedDocIds('did:key:zReader')).toEqual([])

      await storage.upsertGrantIndex(
        grant({ grantId: 'grant-expired', expiresAt: Date.now() - 1000 })
      )
      expect(await storage.getActiveGrant('did:key:zReader', 'doc-1')).toBeNull()
    })
  })
})

describe.runIf(sqliteAvailable)('SQLite schema migrations', () => {
  it('boots on a database created before the crawl_history fingerprint columns', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hub-migration-'))
    try {
      // Recreate the pre-fingerprint table shape (as deployed before 2026-06):
      // SCHEMA_SQL must not reference columns that only the guarded ALTER
      // TABLE migrations add, or boot dies with "no such column".
      const { default: Database } = await import('better-sqlite3')
      const db = new Database(join(dir, 'hub.db'))
      db.exec(`
        CREATE TABLE crawl_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL,
          cid TEXT NOT NULL,
          title TEXT,
          status_code INTEGER,
          content_type TEXT,
          language TEXT,
          crawler_did TEXT,
          crawl_time_ms INTEGER,
          crawled_at INTEGER NOT NULL
        );
        CREATE INDEX idx_crawl_history_url ON crawl_history(url, crawled_at);
      `)
      db.close()

      const storage = createSQLiteStorage(dir)
      try {
        const reopened = new Database(join(dir, 'hub.db'), { readonly: true })
        const columns = new Set(
          (reopened.prepare('PRAGMA table_info(crawl_history)').all() as { name: string }[]).map(
            (col) => col.name
          )
        )
        reopened.close()
        expect(columns).toContain('content_fingerprint_json')
        expect(columns).toContain('content_fingerprint_hash')
        expect(columns).toContain('content_simhash64')
      } finally {
        storage.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
