/**
 * Bulk-byte sink for blobs and files (exploration 0435).
 *
 * The managed substrate is Cloud Run, whose writable filesystem is an in-memory
 * tmpfs counted against a 32 GiB instance memory limit — and one Litestream does
 * not replicate, because it ships the SQLite WAL and nothing else. Selling a
 * 500 GiB storage pack is only honest once bulk bytes go somewhere else.
 *
 * These tests pin the seam that makes that possible, and — just as important —
 * that a self-hosted hub which configures nothing behaves exactly as it did.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryBlobStore, filesystemBlobStore, objectStoreFromAdapter } from '../src/storage'
import { createSQLiteStorage } from '../src/storage/sqlite'

const dirs: string[] = []
const tempDir = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'xnet-blobstore-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s)

const fileMeta = (cid: string, size: number) => ({
  cid,
  name: `${cid}.bin`,
  mimeType: 'application/octet-stream',
  sizeBytes: size,
  uploaderDid: 'did:key:zAlice'
})

describe('filesystemBlobStore — the self-host default', () => {
  it('round-trips bytes through a real path', async () => {
    const dir = tempDir()
    const key = join(dir, 'nested', 'blob.bin')

    await filesystemBlobStore.put(key, bytes('hello'))

    expect(await filesystemBlobStore.get(key)).toEqual(bytes('hello'))
    expect(existsSync(key)).toBe(true)
  })

  it('reports a genuinely missing key as null', async () => {
    expect(await filesystemBlobStore.get(join(tempDir(), 'nope.bin'))).toBeNull()
  })

  // "Absent" and "unreadable" must be different values (AGENTS.md, Errors). A
  // read failure returned as null is how a live pointer looks like a deletion.
  it('THROWS on an unreadable path rather than returning null', async () => {
    const dir = tempDir()
    // A directory where a file is expected: readFileSync fails with EISDIR.
    await expect(filesystemBlobStore.get(dir)).rejects.toThrow()
  })

  it('delete is idempotent', async () => {
    const key = join(tempDir(), 'x.bin')
    await filesystemBlobStore.put(key, bytes('x'))
    await filesystemBlobStore.delete(key)
    await expect(filesystemBlobStore.delete(key)).resolves.toBeUndefined()
    expect(await filesystemBlobStore.get(key)).toBeNull()
  })
})

describe('objectStoreFromAdapter', () => {
  it('adapts an @xnetjs/storage-shaped adapter (e.g. S3BlobAdapter over R2)', async () => {
    const seen: string[] = []
    const backing = new Map<string, Uint8Array>()
    const store = objectStoreFromAdapter({
      async getBlob(cid) {
        seen.push(`get:${cid}`)
        return backing.get(cid) ?? null
      },
      async setBlob(cid, data) {
        backing.set(cid, data)
      },
      async deleteBlob(cid) {
        backing.delete(cid)
      }
    })

    await store.put('k', bytes('v'))
    expect(await store.get('k')).toEqual(bytes('v'))
    await store.delete('k')
    expect(await store.get('k')).toBeNull()
    expect(seen).toContain('get:k')
  })

  it('tolerates an adapter with no deleteBlob', async () => {
    const store = objectStoreFromAdapter({
      async getBlob() {
        return null
      },
      async setBlob() {}
    })
    await expect(store.delete('k')).resolves.toBeUndefined()
  })
})

describe('SQLite storage routes bulk bytes through the sink (0435)', () => {
  it('writes file bytes to the injected store, NOT the local disk', async () => {
    const dir = tempDir()
    const blobs = createMemoryBlobStore()
    const storage = createSQLiteStorage(dir, { blobs })

    await storage.putFile('cid1', bytes('file-bytes'), fileMeta('cid1', 10))

    expect(blobs.size()).toBe(1)
    expect(await storage.getFileData('cid1')).toEqual(bytes('file-bytes'))
    // The whole point: nothing landed on the instance filesystem.
    expect(existsSync(join(dir, 'files', 'cid1'))).toBe(false)
    // …but the POINTER row is still in SQLite, which Litestream does replicate.
    expect(await storage.getFileMeta('cid1')).toMatchObject({ cid: 'cid1', sizeBytes: 10 })
  })

  it('writes backup blobs to the injected store too', async () => {
    const dir = tempDir()
    const blobs = createMemoryBlobStore()
    const storage = createSQLiteStorage(dir, { blobs })

    await storage.putBlob('bk1', bytes('backup'), {
      key: 'bk1',
      docId: 'doc1',
      ownerDid: 'did:key:zAlice',
      sizeBytes: 6,
      contentType: 'application/octet-stream',
      createdAt: Date.now()
    })

    expect(await storage.getBlob('bk1')).toEqual(bytes('backup'))
    expect(existsSync(join(dir, 'blobs', 'bk1'))).toBe(false)
  })

  it('deletes from the injected store', async () => {
    const dir = tempDir()
    const blobs = createMemoryBlobStore()
    const storage = createSQLiteStorage(dir, { blobs })
    await storage.putFile('cid1', bytes('x'), fileMeta('cid1', 1))

    await storage.deleteFile('cid1')

    expect(blobs.size()).toBe(0)
    expect(await storage.getFileData('cid1')).toBeNull()
  })

  // The anti-lock-in invariant (0174), as a test: configure nothing, get the
  // exact behaviour that shipped before this seam existed.
  it('falls back to the local filesystem when NO store is injected', async () => {
    const dir = tempDir()
    const storage = createSQLiteStorage(dir)

    await storage.putFile('cid1', bytes('local'), fileMeta('cid1', 5))

    expect(existsSync(join(dir, 'files', 'cid1'))).toBe(true)
    expect(readFileSync(join(dir, 'files', 'cid1'))).toEqual(Buffer.from('local'))
    expect(await storage.getFileData('cid1')).toEqual(bytes('local'))
  })

  it('still reads blobs written by an older hub straight to disk', async () => {
    // Upgrade path: the pointer rows an existing tenant has all name real files.
    const dir = tempDir()
    const storage = createSQLiteStorage(dir)
    await storage.putFile('cid1', bytes('legacy'), fileMeta('cid1', 6))
    writeFileSync(join(dir, 'files', 'cid1'), 'legacy-edited')

    expect(await storage.getFileData('cid1')).toEqual(bytes('legacy-edited'))
  })

  // Bytes before pointer. A crash between the two must leave an orphan BLOB
  // (cheap, sweepable) rather than a pointer row naming bytes that do not
  // exist — the direction that loses data.
  it('writes the bytes BEFORE the pointer row', async () => {
    const dir = tempDir()
    const order: string[] = []
    const inner = createMemoryBlobStore()
    const storage = createSQLiteStorage(dir, {
      blobs: {
        get: inner.get,
        delete: inner.delete,
        async put(key, data) {
          order.push('bytes')
          await inner.put(key, data)
        }
      }
    })

    await storage.putFile('cid1', bytes('x'), fileMeta('cid1', 1))
    order.push('pointer-visible:' + String((await storage.getFileMeta('cid1')) !== null))

    expect(order).toEqual(['bytes', 'pointer-visible:true'])
  })

  it('leaves no pointer row when the byte write fails', async () => {
    const dir = tempDir()
    const storage = createSQLiteStorage(dir, {
      blobs: {
        async get() {
          return null
        },
        async put() {
          throw new Error('object store unavailable')
        },
        async delete() {}
      }
    })

    await expect(storage.putFile('cid1', bytes('x'), fileMeta('cid1', 1))).rejects.toThrow(
      /object store unavailable/
    )
    // The upload failed loudly and left nothing behind claiming to be a file.
    expect(await storage.getFileMeta('cid1')).toBeNull()
  })

  it('reports a missing blob as null, not a crash', async () => {
    const storage = createSQLiteStorage(tempDir(), { blobs: createMemoryBlobStore() })
    expect(await storage.getFileData('never-stored')).toBeNull()
    expect(await storage.getBlob('never-stored')).toBeNull()
  })
})
