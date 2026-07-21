/**
 * BlobTransferQueue — moves attachment bytes between this device and the hub
 * (exploration 0385 W3).
 *
 * The change log carries only the FileRef, so a peer receiving an attachment
 * has the CID but not the bytes. Without this queue those refs are dead
 * pointers: the metadata syncs, the cell looks correct, and resolving the URL
 * quietly fails.
 *
 * Shape borrowed from PowerSync's attachment helper — metadata syncs first,
 * bytes follow through a stateful queue that survives restarts:
 *
 *   local ──upload──▶ uploading ──ok──▶ synced
 *     ▲                   │
 *     └────── failure ────┘   (retry with backoff)
 *
 *   remote ──view──▶ downloading ──verified──▶ synced
 *
 * Hub-less workspaces are a supported state, not an error: with no client the
 * queue idles and refs stay `local`/`remote` so the UI can say so honestly.
 */

import type { BlobService } from './blob-service'
import type { HubFilesClient } from './hub-files-client'
import type { FileRef } from '../schema/properties/file'
import { hashHex } from '@xnetjs/crypto'
import { HubFilesError } from './hub-files-client'

export type BlobTransferState =
  /** Bytes are here; the hub hasn't confirmed them yet. */
  | 'local'
  | 'uploading'
  /** Both sides hold the bytes. */
  | 'synced'
  /** A ref arrived by sync but the bytes aren't local yet. */
  | 'remote'
  | 'downloading'
  /** Terminal-ish: the hub refused (quota, too large) — needs user action. */
  | 'failed'

export interface BlobTransferRecord {
  cid: string
  state: BlobTransferState
  /** Last failure, for surfacing in the cell. */
  error?: string
  attempts: number
}

/** Persistence seam — swap in SQLite/localStorage; defaults to memory. */
export interface TransferStateStore {
  get(cid: string): BlobTransferRecord | undefined
  set(record: BlobTransferRecord): void
  all(): BlobTransferRecord[]
}

export class MemoryTransferStateStore implements TransferStateStore {
  private records = new Map<string, BlobTransferRecord>()
  get(cid: string): BlobTransferRecord | undefined {
    return this.records.get(cid)
  }
  set(record: BlobTransferRecord): void {
    this.records.set(record.cid, record)
  }
  all(): BlobTransferRecord[] {
    return [...this.records.values()]
  }
}

export interface BlobTransferQueueOptions {
  blobs: BlobService
  /** Absent in hub-less workspaces — the queue then idles. */
  hub?: HubFilesClient
  store?: TransferStateStore
  /** Retry backoff in ms, indexed by attempt. */
  backoffMs?: number[]
  /** Injected for tests so retries don't need real timers (0294). */
  scheduler?: (fn: () => void, ms: number) => void
}

const DEFAULT_BACKOFF = [1_000, 5_000, 30_000, 120_000]

/** Failures the hub will keep rejecting — retrying just burns quota checks. */
const TERMINAL_CODES = new Set(['QUOTA_EXCEEDED', 'FILE_TOO_LARGE', 'CID_MISMATCH'])

export class BlobTransferQueue {
  private readonly blobs: BlobService
  private readonly hub?: HubFilesClient
  private readonly store: TransferStateStore
  private readonly backoff: number[]
  private readonly schedule: (fn: () => void, ms: number) => void
  private readonly inFlight = new Map<string, Promise<BlobTransferState>>()
  private listeners = new Set<(record: BlobTransferRecord) => void>()

  constructor(options: BlobTransferQueueOptions) {
    this.blobs = options.blobs
    this.hub = options.hub
    this.store = options.store ?? new MemoryTransferStateStore()
    this.backoff = options.backoffMs ?? DEFAULT_BACKOFF
    this.schedule = options.scheduler ?? ((fn, ms) => void setTimeout(fn, ms))
  }

  /** Current state of a CID, defaulting by whether the bytes are local. */
  getState(cid: string): BlobTransferState {
    return this.store.get(cid)?.state ?? (this.hub ? 'remote' : 'local')
  }

  getRecord(cid: string): BlobTransferRecord | undefined {
    return this.store.get(cid)
  }

  /** Subscribe to state changes (cells re-render off this). */
  subscribe(listener: (record: BlobTransferRecord) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private update(cid: string, patch: Partial<BlobTransferRecord>): BlobTransferRecord {
    const previous = this.store.get(cid) ?? {
      cid,
      state: 'local' as BlobTransferState,
      attempts: 0
    }
    const next = { ...previous, ...patch, cid }
    this.store.set(next)
    for (const listener of this.listeners) listener(next)
    return next
  }

  /**
   * Queue a freshly attached file for upload. Returns immediately — attaching
   * must never block on the network.
   */
  enqueueUpload(ref: FileRef): void {
    if (!this.hub) {
      this.update(ref.cid, { state: 'local' })
      return
    }
    this.update(ref.cid, { state: 'local', attempts: 0, error: undefined })
    void this.runUpload(ref)
  }

  private async runUpload(ref: FileRef): Promise<void> {
    if (!this.hub) return
    this.update(ref.cid, { state: 'uploading' })
    try {
      // Thumbnails are kilobytes: send them first so a peer's cell can show a
      // preview even while the original is still uploading (0385 W4).
      await this.uploadThumbnail(ref)
      const data = await this.blobs.getData(ref)
      if (!data) {
        // Nothing to send — the bytes aren't here after all.
        this.update(ref.cid, { state: 'remote' })
        return
      }
      await this.hub.put(ref.cid, data, { name: ref.name, mimeType: ref.mimeType })
      this.update(ref.cid, { state: 'synced', error: undefined })
    } catch (err) {
      const code = err instanceof HubFilesError ? err.code : 'NETWORK'
      const record = this.store.get(ref.cid)
      const attempts = (record?.attempts ?? 0) + 1
      const message = err instanceof Error ? err.message : String(err)

      if (TERMINAL_CODES.has(code) || attempts > this.backoff.length) {
        this.update(ref.cid, { state: 'failed', error: message, attempts })
        return
      }
      this.update(ref.cid, { state: 'local', error: message, attempts })
      this.schedule(() => void this.runUpload(ref), this.backoff[attempts - 1])
    }
  }

  /**
   * Push a ref's thumbnail blob, if it has one. Best-effort: a missing or
   * failed preview must not hold up (or fail) the real upload.
   */
  private async uploadThumbnail(ref: FileRef): Promise<void> {
    if (!this.hub || !ref.thumbCid) return
    try {
      const data = await this.blobs.getData({ ...ref, cid: ref.thumbCid })
      if (!data) return
      await this.hub.put(ref.thumbCid, data, {
        name: `${ref.name}.thumb`,
        mimeType: 'image/webp'
      })
    } catch {
      // Preview sync is opportunistic; the original still matters.
    }
  }

  /** Fetch just the preview bytes — cheap enough to do on cell render. */
  async ensureThumbnail(ref: FileRef): Promise<boolean> {
    if (!ref.thumbCid) return false
    const thumbRef: FileRef = { ...ref, cid: ref.thumbCid }
    if (await this.blobs.has(thumbRef)) return true
    if (!this.hub) return false
    try {
      const data = await this.hub.get(ref.thumbCid)
      await this.blobs.uploadData(data, {
        filename: `${ref.name}.thumb`,
        mimeType: 'image/webp'
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Make the bytes available locally, fetching from the hub if needed.
   * Called when a cell actually needs to render or open the file — we don't
   * bulk-replicate attachments nobody looks at.
   */
  async ensureLocal(ref: FileRef): Promise<BlobTransferState> {
    if (await this.blobs.has(ref)) {
      // Already here; make sure the record reflects that.
      const known = this.store.get(ref.cid)?.state
      return known === 'synced' || known === 'uploading'
        ? known
        : this.update(ref.cid, { state: 'local' }).state
    }
    if (!this.hub) return this.update(ref.cid, { state: 'remote' }).state

    // Coalesce concurrent viewers of the same attachment.
    const existing = this.inFlight.get(ref.cid)
    if (existing) return existing

    const task = this.download(ref).finally(() => this.inFlight.delete(ref.cid))
    this.inFlight.set(ref.cid, task)
    return task
  }

  private async download(ref: FileRef): Promise<BlobTransferState> {
    if (!this.hub) return 'remote'
    this.update(ref.cid, { state: 'downloading' })
    try {
      const data = await this.hub.get(ref.cid)

      // A CID is a claim until the bytes hash to it — mirror of the hub's own
      // CID_MISMATCH check, so a compromised or buggy hub can't poison us.
      const actual = `cid:blake3:${hashHex(data)}`
      if (actual !== ref.cid) {
        this.update(ref.cid, {
          state: 'failed',
          error: `Hash mismatch: expected ${ref.cid}, got ${actual}`
        })
        return 'failed'
      }

      await this.blobs.uploadData(data, { filename: ref.name, mimeType: ref.mimeType })
      this.update(ref.cid, { state: 'synced', error: undefined })
      return 'synced'
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Not on the hub either — genuinely stranded on another device.
      this.update(ref.cid, { state: 'remote', error: message })
      return 'remote'
    }
  }

  /** Re-drive anything left mid-flight by a previous session. */
  resume(refs: FileRef[]): void {
    if (!this.hub) return
    const byCid = new Map(refs.map((r) => [r.cid, r]))
    for (const record of this.store.all()) {
      if (record.state !== 'local' && record.state !== 'uploading') continue
      const ref = byCid.get(record.cid)
      if (ref) void this.runUpload(ref)
    }
  }
}
