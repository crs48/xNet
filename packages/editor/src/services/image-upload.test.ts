import { describe, it, expect } from 'vitest'
import { validateImageFile, ALLOWED_IMAGE_TYPES, uploadImage, compressImage } from './image-upload'

describe('image-upload', () => {
  describe('validateImageFile', () => {
    it('should accept valid JPEG', () => {
      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
      expect(validateImageFile(file)).toEqual({ valid: true })
    })

    it('should accept valid PNG', () => {
      const file = new File(['data'], 'image.png', { type: 'image/png' })
      expect(validateImageFile(file)).toEqual({ valid: true })
    })

    it('should accept valid GIF', () => {
      const file = new File(['data'], 'animation.gif', { type: 'image/gif' })
      expect(validateImageFile(file)).toEqual({ valid: true })
    })

    it('should accept valid WebP', () => {
      const file = new File(['data'], 'image.webp', { type: 'image/webp' })
      expect(validateImageFile(file)).toEqual({ valid: true })
    })

    it('should accept valid SVG', () => {
      const file = new File(['<svg></svg>'], 'icon.svg', { type: 'image/svg+xml' })
      expect(validateImageFile(file)).toEqual({ valid: true })
    })

    it('should reject non-image files', () => {
      const file = new File(['data'], 'doc.txt', { type: 'text/plain' })
      const result = validateImageFile(file)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toContain('Invalid file type')
      }
    })

    it('should reject unsupported image formats', () => {
      const file = new File(['data'], 'image.bmp', { type: 'image/bmp' })
      const result = validateImageFile(file)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toContain('Unsupported image format')
      }
    })

    it('should reject files that exceed maxSize', () => {
      // Create a file larger than 1KB
      const data = new Uint8Array(2000)
      const file = new File([data], 'large.jpg', { type: 'image/jpeg' })
      const result = validateImageFile(file, { maxSize: 1000 })
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toContain('File too large')
      }
    })

    it('should accept files within maxSize', () => {
      const data = new Uint8Array(500)
      const file = new File([data], 'small.jpg', { type: 'image/jpeg' })
      expect(validateImageFile(file, { maxSize: 1000 })).toEqual({ valid: true })
    })

    it('should use default 10MB maxSize', () => {
      // Just under 10MB should pass
      const file = new File(['x'], 'ok.jpg', { type: 'image/jpeg' })
      Object.defineProperty(file, 'size', { value: 9 * 1024 * 1024 })
      expect(validateImageFile(file)).toEqual({ valid: true })
    })
  })

  describe('ALLOWED_IMAGE_TYPES', () => {
    it('should include standard image types', () => {
      expect(ALLOWED_IMAGE_TYPES).toContain('image/jpeg')
      expect(ALLOWED_IMAGE_TYPES).toContain('image/png')
      expect(ALLOWED_IMAGE_TYPES).toContain('image/gif')
      expect(ALLOWED_IMAGE_TYPES).toContain('image/webp')
      expect(ALLOWED_IMAGE_TYPES).toContain('image/svg+xml')
    })

    it('should have exactly 5 types', () => {
      expect(ALLOWED_IMAGE_TYPES).toHaveLength(5)
    })
  })

  describe('uploadImage', () => {
    it('should reject non-image files', async () => {
      const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' })
      const mockBlobService = {} as any

      await expect(uploadImage(file, mockBlobService)).rejects.toThrow('Invalid file type')
    })

    it('should reject files exceeding maxSize', async () => {
      const file = new File(['x'], 'big.jpg', { type: 'image/jpeg' })
      Object.defineProperty(file, 'size', { value: 20 * 1024 * 1024 })
      const mockBlobService = {} as any

      await expect(
        uploadImage(file, mockBlobService, { maxSize: 10 * 1024 * 1024 })
      ).rejects.toThrow('File too large')
    })
  })

  describe('compressImage', () => {
    it('should pass through SVGs without compression', async () => {
      const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
      const file = new File([svgContent], 'icon.svg', { type: 'image/svg+xml' })
      const dimensions = { width: 100, height: 100 }

      const result = await compressImage(file, dimensions, { maxDimension: 2048 })
      expect(result.file).toBe(file) // Same reference
      expect(result.width).toBe(100)
      expect(result.height).toBe(100)
    })

    it('should not compress images within maxDimension', async () => {
      const file = new File(['data'], 'small.jpg', { type: 'image/jpeg' })
      const dimensions = { width: 800, height: 600 }

      const result = await compressImage(file, dimensions, { maxDimension: 2048 })
      expect(result.file).toBe(file)
      expect(result.width).toBe(800)
      expect(result.height).toBe(600)
    })
  })
})
