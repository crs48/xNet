import type { HubStorage } from '../storage/interface'
import { describe, expect, it } from 'vitest'
import { FileService } from './files'

/**
 * The hub wires `FileService` with the plan's `defaultQuota` (exploration 0216) so
 * file uploads count against the same quota the dashboard meter shows, instead of
 * FileService's hardcoded 5 GiB fallback. This proves the configured quota is the
 * one enforced (the file route maps QUOTA_EXCEEDED → HTTP 507).
 */
const stubStorage = (usedBytes: number): HubStorage =>
  ({
    getFilesUsage: async () => ({ totalBytes: usedBytes, fileCount: 1 })
  }) as unknown as HubStorage

describe('FileService quota wiring (0216)', () => {
  it('rejects an upload that would exceed the configured quota', async () => {
    const files = new FileService(stubStorage(0), {
      maxStoragePerUser: 1024, // 1 KiB plan quota
      maxFileSize: 10 * 1024 * 1024
    })
    const data = new Uint8Array(2048) // 2 KiB > 1 KiB quota
    await expect(
      files.upload('cid:blake3:x', data, 'f.bin', 'application/octet-stream', 'did:key:a')
    ).rejects.toThrow(/exceed storage quota/i)
  })

  it('allows an upload that fits under the configured quota', async () => {
    const files = new FileService(stubStorage(0), {
      maxStoragePerUser: 1024 * 1024,
      maxFileSize: 10 * 1024 * 1024
    })
    const data = new Uint8Array(512)
    // Fits the quota; fails later (CID mismatch) — proving the quota gate was passed.
    await expect(
      files.upload('cid:blake3:wrong', data, 'f.bin', 'application/octet-stream', 'did:key:a')
    ).rejects.toThrow(/CID/i)
  })
})
