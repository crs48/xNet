/**
 * Tests for useImageUpload hook
 */
import type { BlobService } from '@xnetjs/data'
import { renderHook } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BlobProvider } from '../context/BlobContext'
import { useImageUpload } from './useImageUpload'

// Mock BlobService
function createMockBlobService(): BlobService {
  return {
    upload: vi.fn().mockResolvedValue({
      cid: 'bafk-test-cid',
      name: 'test.png',
      mimeType: 'image/png',
      size: 1024
    }),
    getUrl: vi.fn().mockResolvedValue('blob:http://localhost/test-url'),
    getData: vi.fn(),
    has: vi.fn(),
    getMissingChunks: vi.fn(),
    revokeUrl: vi.fn(),
    revokeAllUrls: vi.fn(),
    uploadData: vi.fn()
  } as unknown as BlobService
}

describe('useImageUpload', () => {
  let mockBlobService: BlobService

  beforeEach(() => {
    mockBlobService = createMockBlobService()
  })

  it('should return null when no BlobProvider is present', () => {
    const { result } = renderHook(() => useImageUpload())
    expect(result.current).toBeNull()
  })

  it('should return upload function when BlobProvider is present', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BlobProvider blobService={mockBlobService}>{children}</BlobProvider>
    )

    const { result } = renderHook(() => useImageUpload(), { wrapper })
    expect(result.current).toBeInstanceOf(Function)
  })

  it('should upload image and return result with cid', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BlobProvider blobService={mockBlobService}>{children}</BlobProvider>
    )

    const { result } = renderHook(() => useImageUpload(), { wrapper })
    expect(result.current).not.toBeNull()

    // Create a mock file
    const file = new File(['test'], 'test.png', { type: 'image/png' })

    // Mock the image loading (uploadImage uses Image to get dimensions)
    const originalImage = global.Image
    global.Image = class MockImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      src = ''
      naturalWidth = 100
      naturalHeight = 100
      constructor() {
        setTimeout(() => this.onload?.(), 0)
      }
    } as unknown as typeof Image

    // Mock URL.createObjectURL
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    URL.revokeObjectURL = vi.fn()

    try {
      const uploadResult = await result.current!(file)

      expect(uploadResult).toEqual({
        src: 'blob:http://localhost/test-url',
        width: 100,
        height: 100,
        cid: 'bafk-test-cid'
      })

      expect(mockBlobService.upload).toHaveBeenCalled()
      expect(mockBlobService.getUrl).toHaveBeenCalled()
    } finally {
      global.Image = originalImage
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
    }
  })
})
