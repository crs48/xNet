/**
 * BlobTransferQueue — upload/download state machine, CID verification, and
 * the hub-less idle path (exploration 0385 W3).
 *
 * Unit-only: BlobService and HubFilesClient are stubbed and retries run
 * through an injected scheduler, so there are no real timers or servers.
 */

import type { BlobService } from './blob-service'
import type { HubFilesClient } from './hub-files-client'
import type { FileRef } from '../schema/properties/file'
import { hashHex } from '@xnetjs/crypto'
import { describe, it, expect, vi } from 'vitest'
import { BlobTransferQueue } from './blob-transfer-queue'
import { HubFilesError } from './hub-files-client'

const bytes = new Uint8Array([1, 2, 3, 4])
const cid = `cid:blake3:${hashHex(bytes)}`

const ref: FileRef = { cid, name: 'photo.png', mimeType: 'image/png', size: bytes.byteLength }

/**
 * BlobService stub: `present` decides whether the bytes are local.
 *
 * Models the raw-blob surface the queue actually uses — a single unchunked
 * blob, so its CID is the content hash. The chunked case (where the ref's CID
 * is a manifest's) is covered against a real hub in
 * `packages/hub/test/attachment-transfer.test.ts`.
 */
function stubBlobs(present: boolean): BlobService & { stored: Uint8Array[] } {
  const stored: Uint8Array[] = []
  return {
    stored,
    has: vi.fn(async () => present),
    getData: vi.fn(async () => (present ? bytes : null)),
    getTransferCids: vi.fn(async () => (present ? [cid] : [])),
    getRawBlob: vi.fn(async () => (present ? bytes : null)),
    putRawBlob: vi.fn(async (data: Uint8Array) => {
      stored.push(data)
      return cid
    }),
    chunkCidsOf: vi.fn(() => []),
    uploadData: vi.fn(async (data: Uint8Array) => {
      stored.push(data)
      return ref
    })
  } as unknown as BlobService & { stored: Uint8Array[] }
}

function stubHub(overrides: Partial<HubFilesClient> = {}): HubFilesClient {
  return {
    has: vi.fn(async () => false),
    put: vi.fn(async () => undefined),
    get: vi.fn(async () => bytes),
    ...overrides
  } as unknown as HubFilesClient
}

/** Runs scheduled retries immediately, recording the delays asked for. */
function immediateScheduler(): ((fn: () => void, ms: number) => void) & { delays: number[] } {
  const delays: number[] = []
  const scheduler = (fn: () => void, ms: number): void => {
    delays.push(ms)
    fn()
  }
  return Object.assign(scheduler, { delays })
}

describe('BlobTransferQueue upload', () => {
  it('uploads a newly attached file and reaches synced', async () => {
    const blobs = stubBlobs(true)
    const hub = stubHub()
    const queue = new BlobTransferQueue({ blobs, hub })

    queue.enqueueUpload(ref)
    await vi.waitFor(() => expect(queue.getState(cid)).toBe('synced'))
    expect(hub.put).toHaveBeenCalledWith(cid, bytes, { name: 'photo.png', mimeType: 'image/png' })
  })

  it('retries a network failure with backoff, then succeeds', async () => {
    const blobs = stubBlobs(true)
    let calls = 0
    const hub = stubHub({
      put: vi.fn(async () => {
        calls += 1
        if (calls === 1) throw new HubFilesError('offline', 'NETWORK')
      })
    })
    const scheduler = immediateScheduler()
    const queue = new BlobTransferQueue({ blobs, hub, scheduler, backoffMs: [10, 20] })

    queue.enqueueUpload(ref)
    await vi.waitFor(() => expect(queue.getState(cid)).toBe('synced'))
    expect(calls).toBe(2)
    expect(scheduler.delays).toEqual([10])
  })

  it('does not retry a quota rejection — it needs the user, not another attempt', async () => {
    const blobs = stubBlobs(true)
    const hub = stubHub({
      put: vi.fn(async () => {
        throw new HubFilesError('Storage quota exceeded', 'QUOTA_EXCEEDED', 507)
      })
    })
    const scheduler = immediateScheduler()
    const queue = new BlobTransferQueue({ blobs, hub, scheduler })

    queue.enqueueUpload(ref)
    await vi.waitFor(() => expect(queue.getState(cid)).toBe('failed'))
    expect(hub.put).toHaveBeenCalledTimes(1)
    expect(scheduler.delays).toEqual([])
    expect(queue.getRecord(cid)?.error).toContain('quota')
  })

  it('uploads raw blobs, chunks before the manifest', async () => {
    // A chunked file's ref carries its MANIFEST's cid, so the reassembled
    // bytes would fail the hub's content-hash check. Every blob must go up
    // under its own hash, and a manifest must never land before its chunks.
    const chunkA = 'cid:blake3:chunk-a'
    const chunkB = 'cid:blake3:chunk-b'
    const manifestCid = 'cid:blake3:manifest'
    const manifestRef: FileRef = { ...ref, cid: manifestCid }
    const raw: Record<string, Uint8Array> = {
      [chunkA]: new Uint8Array([1]),
      [chunkB]: new Uint8Array([2]),
      [manifestCid]: new Uint8Array([3])
    }
    const blobs = {
      has: vi.fn(async () => true),
      getData: vi.fn(async () => bytes),
      getTransferCids: vi.fn(async () => [chunkA, chunkB, manifestCid]),
      getRawBlob: vi.fn(async (c: string) => raw[c] ?? null),
      putRawBlob: vi.fn(async () => manifestCid),
      chunkCidsOf: vi.fn(() => [])
    } as unknown as BlobService

    const sent: string[] = []
    const hub = stubHub({
      put: vi.fn(async (c: string) => {
        sent.push(c)
      })
    })
    const queue = new BlobTransferQueue({ blobs, hub })

    queue.enqueueUpload(manifestRef)
    await vi.waitFor(() => expect(queue.getState(manifestCid)).toBe('synced'))
    expect(sent).toEqual([chunkA, chunkB, manifestCid])
    // Never the reassembled file.
    expect(blobs.getData).not.toHaveBeenCalled()
  })

  it('idles without a hub, leaving the ref local', async () => {
    const blobs = stubBlobs(true)
    const queue = new BlobTransferQueue({ blobs })

    queue.enqueueUpload(ref)
    expect(queue.getState(cid)).toBe('local')
    expect(await queue.ensureLocal(ref)).toBe('local')
  })
})

describe('BlobTransferQueue download', () => {
  it('fetches missing bytes on demand and stores them', async () => {
    const blobs = stubBlobs(false)
    const hub = stubHub()
    const queue = new BlobTransferQueue({ blobs, hub })

    expect(await queue.ensureLocal(ref)).toBe('synced')
    expect(hub.get).toHaveBeenCalledWith(cid)
    expect(blobs.stored).toHaveLength(1)
  })

  it('rejects bytes that do not hash to the requested CID', async () => {
    const blobs = stubBlobs(false)
    const hub = stubHub({ get: vi.fn(async () => new Uint8Array([9, 9, 9])) })
    const queue = new BlobTransferQueue({ blobs, hub })

    expect(await queue.ensureLocal(ref)).toBe('failed')
    expect(blobs.stored).toHaveLength(0)
    expect(queue.getRecord(cid)?.error).toContain('Hash mismatch')
  })

  it('reports remote when the hub does not have the blob either', async () => {
    const blobs = stubBlobs(false)
    const hub = stubHub({
      get: vi.fn(async () => {
        throw new HubFilesError('not found', 'NOT_FOUND', 404)
      })
    })
    const queue = new BlobTransferQueue({ blobs, hub })

    expect(await queue.ensureLocal(ref)).toBe('remote')
  })

  it('coalesces concurrent viewers into one download', async () => {
    const blobs = stubBlobs(false)
    const hub = stubHub()
    const queue = new BlobTransferQueue({ blobs, hub })

    const [a, b] = await Promise.all([queue.ensureLocal(ref), queue.ensureLocal(ref)])
    expect(a).toBe('synced')
    expect(b).toBe('synced')
    expect(hub.get).toHaveBeenCalledTimes(1)
  })

  it('skips the network when the bytes are already local', async () => {
    const blobs = stubBlobs(true)
    const hub = stubHub()
    const queue = new BlobTransferQueue({ blobs, hub })

    await queue.ensureLocal(ref)
    expect(hub.get).not.toHaveBeenCalled()
  })
})
