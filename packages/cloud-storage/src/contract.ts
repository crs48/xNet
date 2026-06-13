/**
 * @xnetjs/cloud-storage — shared `StorageAdapter` contract suite.
 *
 * The trust mechanism from exploration 0176: one suite, run against BOTH the
 * in-memory fake (`MemoryAdapter`) AND a real-local adapter (S3 via mock/s3rver).
 * When both pass, the fake is a proven stand-in for the real thing.
 */

import type { ContentId } from '@xnetjs/core'
import type { StorageAdapter } from '@xnetjs/storage'
import { beforeEach, describe, expect, it } from 'vitest'

const cid = (n: string): ContentId => `cid:blake3:${n}`

export function runStorageAdapterContract(
  name: string,
  factory: () => Promise<StorageAdapter>
): void {
  describe(`StorageAdapter contract — ${name}`, () => {
    let store: StorageAdapter

    beforeEach(async () => {
      store = await factory()
      await store.open()
      await store.clear()
    })

    it('round-trips binary data', async () => {
      const data = new Uint8Array([1, 2, 3, 250, 0, 9])
      await store.setBlob(cid('a'), data)
      expect(await store.getBlob(cid('a'))).toEqual(data)
    })

    it('returns null for a missing blob', async () => {
      expect(await store.getBlob(cid('missing'))).toBeNull()
    })

    it('reports existence correctly', async () => {
      expect(await store.hasBlob(cid('x'))).toBe(false)
      await store.setBlob(cid('x'), new Uint8Array([7]))
      expect(await store.hasBlob(cid('x'))).toBe(true)
    })

    it('overwrites an existing blob', async () => {
      await store.setBlob(cid('k'), new Uint8Array([1]))
      await store.setBlob(cid('k'), new Uint8Array([2, 2]))
      expect(await store.getBlob(cid('k'))).toEqual(new Uint8Array([2, 2]))
    })

    it('clear() empties the store', async () => {
      await store.setBlob(cid('a'), new Uint8Array([1]))
      await store.setBlob(cid('b'), new Uint8Array([2]))
      await store.clear()
      expect(await store.hasBlob(cid('a'))).toBe(false)
      expect(await store.getBlob(cid('b'))).toBeNull()
    })
  })
}
