/**
 * @xnetjs/hub — bulk-byte sink for blobs and files (exploration 0435).
 *
 * The DB has always separated metadata from bulk bytes: `backups.blob_path` and
 * `file_meta.file_path` are pointers, and the bytes live behind them. Until now
 * "behind them" meant the local filesystem, which on the managed substrate
 * (Cloud Run) is an in-memory tmpfs counted against the instance memory limit —
 * a hard ceiling of 32 GiB, and one that Litestream does NOT replicate, because
 * it ships the SQLite WAL and nothing else. So a blob written between syncs
 * lived in exactly one place, and an instance dying took it with it while the
 * pointer row survived.
 *
 * This is the seam that fixes both: a narrow port the SQLite storage writes bulk
 * bytes through. The default is the filesystem, so **a self-hosted hub needs no
 * object store and nothing about it changes** (the anti-lock-in invariant from
 * 0174). A managed hub is handed an S3/R2-backed implementation instead, and its
 * ceiling becomes the bucket rather than the machine.
 *
 * Deliberately three methods over opaque string keys, not `@xnetjs/storage`'s
 * `StorageAdapter`: that port is `ContentId`-typed and carries `open`/`close`/
 * `clear` lifecycle the hub has no use for here. An adapter for it is a few
 * lines at the composition root — see `objectStoreFromAdapter`.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Where a hub's bulk bytes actually live.
 *
 * `get` returns `null` only for a key that is genuinely absent. An
 * implementation that cannot tell absent from unreadable must throw rather than
 * return `null` — a truncated read reported as "no such blob" is how a pointer
 * ends up looking like a deletion (`AGENTS.md`, Errors).
 */
export interface BlobObjectStore {
  get(key: string): Promise<Uint8Array | null>
  put(key: string, data: Uint8Array): Promise<void>
  delete(key: string): Promise<void>
}

/**
 * The default sink: bytes on the local disk at the path the pointer records.
 * This is what every self-hosted hub uses, and what the managed fleet used
 * before 0435.
 */
export const filesystemBlobStore: BlobObjectStore = {
  async get(key) {
    try {
      return new Uint8Array(readFileSync(key))
    } catch (err) {
      // ENOENT is a genuine absence; anything else (EACCES, EIO, a truncated
      // read) is a failure the caller must not mistake for "not there".
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null
      throw err
    }
  },
  async put(key, data) {
    mkdirSync(dirname(key), { recursive: true })
    writeFileSync(key, data)
  },
  async delete(key) {
    if (existsSync(key)) unlinkSync(key)
  }
}

/**
 * Adapt an `@xnetjs/storage` `StorageAdapter` (e.g. `@xnetjs/cloud`'s
 * `S3BlobAdapter` against R2) to the sink the hub writes through.
 *
 * Lives here rather than in the cloud package so the hub owns its own port and
 * never imports the source-available one.
 */
export function objectStoreFromAdapter(adapter: {
  getBlob(cid: string): Promise<Uint8Array | null>
  setBlob(cid: string, data: Uint8Array): Promise<void>
  deleteBlob?(cid: string): Promise<void>
}): BlobObjectStore {
  return {
    get: (key) => adapter.getBlob(key),
    put: (key, data) => adapter.setBlob(key, data),
    delete: async (key) => {
      await adapter.deleteBlob?.(key)
    }
  }
}

/** In-memory sink for tests and the `memory` storage backend. */
export function createMemoryBlobStore(): BlobObjectStore & { size(): number } {
  const blobs = new Map<string, Uint8Array>()
  return {
    async get(key) {
      return blobs.get(key) ?? null
    },
    async put(key, data) {
      blobs.set(key, data)
    },
    async delete(key) {
      blobs.delete(key)
    },
    size: () => blobs.size
  }
}
