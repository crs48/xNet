import type { HubStorage } from '../storage/interface'
import { describe, expect, it } from 'vitest'
import { FileService, isMediaMimeType } from './files'

/**
 * Video gets its own ceiling (exploration 0414). A ten-minute 1080p screencast
 * is 150–400 MB, so the general 100 MB cap rejected every recording with a flat
 * 413 — while a 2 GB JSON blob is still a mistake worth refusing.
 */
const stubStorage = (): HubStorage =>
  ({
    getFilesUsage: async () => ({ totalBytes: 0, fileCount: 0 })
  }) as unknown as HubStorage

describe('isMediaMimeType', () => {
  it('covers video and audio only', () => {
    expect(isMediaMimeType('video/mp4')).toBe(true)
    expect(isMediaMimeType('audio/wav')).toBe(true)
    expect(isMediaMimeType('image/png')).toBe(false)
    expect(isMediaMimeType('application/json')).toBe(false)
  })
})

describe('FileService media ceiling (0414)', () => {
  it('reports the larger ceiling for video', () => {
    const files = new FileService(stubStorage(), {
      maxFileSize: 100 * 1024 * 1024,
      maxMediaFileSize: 2 * 1024 * 1024 * 1024
    })

    expect(files.getMaxFileSize('video/mp4')).toBe(2 * 1024 * 1024 * 1024)
    expect(files.getMaxFileSize('application/json')).toBe(100 * 1024 * 1024)
    expect(files.getMaxFileSize()).toBe(100 * 1024 * 1024)
  })

  it('accepts a recording that exceeds the general cap', async () => {
    const files = new FileService(stubStorage(), {
      maxFileSize: 1024,
      maxMediaFileSize: 1024 * 1024,
      maxStoragePerUser: 10 * 1024 * 1024
    })
    const recording = new Uint8Array(4096) // over the general cap, under media

    // Passes the size gate, then fails on the CID — proving the gate was passed.
    await expect(
      files.upload('cid:blake3:wrong', recording, 'screen.mp4', 'video/mp4', 'did:key:a')
    ).rejects.toThrow(/CID/i)
  })

  it('still refuses a non-media payload over the general cap', async () => {
    const files = new FileService(stubStorage(), {
      maxFileSize: 1024,
      maxMediaFileSize: 1024 * 1024,
      maxStoragePerUser: 10 * 1024 * 1024
    })

    await expect(
      files.upload(
        'cid:blake3:x',
        new Uint8Array(4096),
        'big.json',
        'application/json',
        'did:key:a'
      )
    ).rejects.toThrow(/exceeds max size/i)
  })

  it('refuses a recording over even the media ceiling', async () => {
    const files = new FileService(stubStorage(), {
      maxFileSize: 1024,
      maxMediaFileSize: 2048,
      maxStoragePerUser: 10 * 1024 * 1024
    })

    await expect(
      files.upload('cid:blake3:x', new Uint8Array(4096), 'screen.mp4', 'video/mp4', 'did:key:a')
    ).rejects.toThrow(/exceeds max size of 2048/i)
  })
})
