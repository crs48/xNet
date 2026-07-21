/**
 * Attachment bytes across devices (exploration 0385 W3).
 *
 * The unit tests stub the hub; this one runs the real thing. Device A
 * attaches a file and the queue uploads it; device B — a separate blob store
 * that has only ever seen the FileRef — fetches the bytes back by CID.
 *
 * This is the behaviour that was missing entirely: before W3 the ref synced
 * and the bytes did not, so B held a dead pointer.
 */

import type { FileRef } from '@xnetjs/data'
import { BlobService, BlobTransferQueue, HubFilesClient, HubFilesError } from '@xnetjs/data'
import { createUCAN, generateKeyBundle } from '@xnetjs/identity'
import { BlobStore, ChunkManager, MemoryAdapter } from '@xnetjs/storage'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createHub, type HubInstance } from '../src'

const PORT = 14596
const BASE = `http://localhost:${PORT}`

const keys = generateKeyBundle()
const token = createUCAN({
  issuer: keys.identity.did,
  issuerKey: keys.signingKey,
  audience: 'did:key:hub',
  capabilities: [
    { with: '*', can: 'hub/relay' },
    { with: '*', can: 'files/write' },
    { with: '*', can: 'files/read' }
  ]
})

/** An independent device: its own blob store, its own queue. */
function makeDevice(): { blobs: BlobService; queue: BlobTransferQueue } {
  const blobs = new BlobService(new ChunkManager(new BlobStore(new MemoryAdapter())))
  const hub = new HubFilesClient({ hubUrl: BASE, getAuthToken: () => token })
  return { blobs, queue: new BlobTransferQueue({ blobs, hub }) }
}

describe('attachment transfer between devices', () => {
  let hub: HubInstance

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: true, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('carries bytes from the attaching device to a peer that has only the ref', async () => {
    const deviceA = makeDevice()
    const deviceB = makeDevice()

    const file = new File([new Uint8Array([10, 20, 30, 40, 50])], 'photo.png', {
      type: 'image/png'
    })
    const ref: FileRef = await deviceA.blobs.upload(file)

    deviceA.queue.enqueueUpload(ref)
    // Surface the queue's own error if it never reaches synced.
    await vi.waitFor(
      () => {
        const state = deviceA.queue.getState(ref.cid)
        if (state !== 'synced') {
          throw new Error(`state=${state} error=${deviceA.queue.getRecord(ref.cid)?.error ?? '-'}`)
        }
      },
      { timeout: 5000 }
    )

    // Device B has the ref (it would arrive via the change log) but no bytes.
    expect(await deviceB.blobs.has(ref)).toBe(false)

    expect(await deviceB.queue.ensureLocal(ref)).toBe('synced')
    expect(await deviceB.blobs.has(ref)).toBe(true)

    const data = await deviceB.blobs.getData(ref)
    expect(Array.from(data ?? [])).toEqual([10, 20, 30, 40, 50])
  })

  it('carries a multi-megabyte file, which travels as chunks', async () => {
    const deviceA = makeDevice()
    const deviceB = makeDevice()

    // Over ChunkManager's 1 MB threshold, so this exercises the chunked path
    // (256 KB chunks + manifest) rather than a single blob.
    const size = 5 * 1024 * 1024
    const payload = new Uint8Array(size)
    for (let i = 0; i < size; i++) payload[i] = i % 251
    const file = new File([payload], 'big.png', { type: 'image/png' })

    const ref = await deviceA.blobs.upload(file)
    deviceA.queue.enqueueUpload(ref)
    await vi.waitFor(
      () => {
        const st = deviceA.queue.getState(ref.cid)
        if (st !== 'synced')
          throw new Error(`st=${st} err=${deviceA.queue.getRecord(ref.cid)?.error ?? '-'}`)
      },
      { timeout: 10000 }
    )

    expect(await deviceB.queue.ensureLocal(ref)).toBe('synced')
    const data = await deviceB.blobs.getData(ref)
    expect(data?.byteLength).toBe(size)
    expect(data?.[0]).toBe(0)
    expect(data?.[size - 1]).toBe((size - 1) % 251)
  })

  it('reports remote for a ref the hub never received', async () => {
    const device = makeDevice()
    const stranded: FileRef = {
      cid: `cid:blake3:${'a'.repeat(64)}`,
      name: 'never-uploaded.bin',
      mimeType: 'application/octet-stream',
      size: 4
    }
    // Not an exception: this is the "on another device" state the cell shows.
    expect(await device.queue.ensureLocal(stranded)).toBe('remote')
  })

  it('surfaces a real quota rejection as a terminal failed state', async () => {
    // A hub with almost no room: the upload must fail visibly and stop, not
    // retry forever against a ceiling that will not move.
    const tinyPort = PORT + 1
    const tinyHub = await createHub({
      port: tinyPort,
      auth: true,
      storage: 'memory',
      defaultQuota: 1024
    })
    await tinyHub.start()
    try {
      const blobs = new BlobService(new ChunkManager(new BlobStore(new MemoryAdapter())))
      const queue = new BlobTransferQueue({
        blobs,
        hub: new HubFilesClient({
          hubUrl: `http://localhost:${tinyPort}`,
          getAuthToken: () => token
        }),
        scheduler: (fn, ms) => void setTimeout(fn, ms)
      })

      const file = new File([new Uint8Array(4096)], 'too-big.bin', {
        type: 'application/octet-stream'
      })
      const ref = await blobs.upload(file)
      queue.enqueueUpload(ref)

      await vi.waitFor(() => expect(queue.getState(ref.cid)).toBe('failed'), { timeout: 5000 })
      expect(queue.getRecord(ref.cid)?.error ?? '').toMatch(/quota|storage/i)
      // Terminal: one attempt, no retry loop.
      expect(queue.getRecord(ref.cid)?.attempts).toBe(1)
    } finally {
      await tinyHub.stop()
    }
  })

  it('rejects an unauthenticated client with a typed error', async () => {
    const anon = new HubFilesClient({ hubUrl: BASE })
    await expect(anon.get(`cid:blake3:${'b'.repeat(64)}`)).rejects.toMatchObject({
      _tag: 'HubFilesError',
      code: 'UNAUTHORIZED'
    })
    expect(HubFilesError).toBeDefined()
  })
})
