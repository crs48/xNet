/**
 * Thumbnail generation — type gating and graceful degradation (0385 W4).
 *
 * The pixel work needs real canvas/codec support that jsdom doesn't provide,
 * so these cover the decisions around it: which types we attempt, and that a
 * missing or failing API yields "no thumbnail" instead of throwing — a
 * preview must never be able to fail an upload.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { canThumbnail, generateThumbnail } from './thumbnail'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('canThumbnail', () => {
  it('accepts raster images and video', () => {
    expect(canThumbnail('image/png')).toBe(true)
    expect(canThumbnail('image/jpeg')).toBe(true)
    expect(canThumbnail('video/mp4')).toBe(true)
  })

  it('rejects types with nothing to rasterise', () => {
    expect(canThumbnail('application/pdf')).toBe(false)
    expect(canThumbnail('application/zip')).toBe(false)
    expect(canThumbnail('text/plain')).toBe(false)
    // SVG is an image but has no intrinsic raster size and is a script vector.
    expect(canThumbnail('image/svg+xml')).toBe(false)
  })
})

describe('generateThumbnail', () => {
  it('returns null for types it cannot preview', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    expect(await generateThumbnail(blob, 'application/pdf')).toBeNull()
  })

  it('returns null rather than throwing when the decode fails', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('unsupported image')
      })
    )
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor() {}
      }
    )
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    expect(await generateThumbnail(blob, 'image/png')).toBeNull()
  })

  it('returns null when the browser lacks the canvas APIs', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    expect(await generateThumbnail(blob, 'image/png')).toBeNull()
  })
})
