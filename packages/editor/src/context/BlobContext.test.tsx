import type { BlobService } from '@xnetjs/data'
import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BlobProvider, useBlobService } from './BlobContext'

describe('BlobContext', () => {
  const mockBlobService = {
    upload: vi.fn(),
    getUrl: vi.fn(),
    getData: vi.fn(),
    has: vi.fn(),
    getMissingChunks: vi.fn(),
    revokeUrl: vi.fn(),
    revokeAllUrls: vi.fn(),
    uploadData: vi.fn()
  } as unknown as BlobService

  describe('useBlobService', () => {
    it('should return null when no provider is present', () => {
      const { result } = renderHook(() => useBlobService())
      expect(result.current).toBeNull()
    })

    it('should return the BlobService when provider is present', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <BlobProvider blobService={mockBlobService}>{children}</BlobProvider>
      )

      const { result } = renderHook(() => useBlobService(), { wrapper })
      expect(result.current).toBe(mockBlobService)
    })

    it('should provide the same instance across renders', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <BlobProvider blobService={mockBlobService}>{children}</BlobProvider>
      )

      const { result, rerender } = renderHook(() => useBlobService(), { wrapper })
      const first = result.current
      rerender()
      expect(result.current).toBe(first)
    })
  })
})
