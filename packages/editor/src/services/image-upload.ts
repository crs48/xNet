/**
 * Image Upload Service
 *
 * Handles image validation, compression, dimension reading,
 * and uploading via BlobService.
 */
import type { BlobService } from '@xnetjs/data'
import type { FileRef } from '@xnetjs/data'

export interface ImageUploadOptions {
  /** Maximum file size in bytes (default: 10MB) */
  maxSize?: number
  /** Maximum dimension (width or height) for compression */
  maxDimension?: number
  /** JPEG quality for compression (0-1) */
  quality?: number
}

export interface ImageUploadResult {
  /** The FileRef for storage in node properties */
  fileRef: FileRef
  /** Image width in pixels */
  width: number
  /** Image height in pixels */
  height: number
  /** Object URL for immediate display */
  url: string
}

const DEFAULT_OPTIONS: Required<ImageUploadOptions> = {
  maxSize: 10 * 1024 * 1024, // 10MB
  maxDimension: 2048,
  quality: 0.85
}

/** Allowed image MIME types */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml'
]

/**
 * Validate that a file is an acceptable image.
 */
export function validateImageFile(
  file: File,
  options: ImageUploadOptions = {}
): { valid: true } | { valid: false; error: string } {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  if (!file.type.startsWith('image/')) {
    return { valid: false, error: `Invalid file type: ${file.type}. Expected image/*` }
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: `Unsupported image format: ${file.type}` }
  }

  if (file.size > opts.maxSize) {
    const maxMB = (opts.maxSize / (1024 * 1024)).toFixed(1)
    return {
      valid: false,
      error: `File too large: ${(file.size / (1024 * 1024)).toFixed(1)}MB (max: ${maxMB}MB)`
    }
  }

  return { valid: true }
}

/**
 * Load an image from a File to get its dimensions.
 */
export function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

/**
 * Compress/resize an image if it exceeds maxDimension.
 * Returns the original file if no compression is needed.
 */
export async function compressImage(
  file: File,
  dimensions: { width: number; height: number },
  options: ImageUploadOptions = {}
): Promise<{ file: File; width: number; height: number }> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const { width, height } = dimensions

  // SVGs don't need compression
  if (file.type === 'image/svg+xml') {
    return { file, width, height }
  }

  // No compression needed if within limits
  if (width <= opts.maxDimension && height <= opts.maxDimension) {
    return { file, width, height }
  }

  // Scale down
  const scale = opts.maxDimension / Math.max(width, height)
  const newWidth = Math.round(width * scale)
  const newHeight = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = newWidth
  canvas.height = newHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas 2d context')
  }

  // Load image for drawing
  const img = await loadImageElement(file)
  ctx.drawImage(img, 0, 0, newWidth, newHeight)

  // Convert to blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('Failed to compress image'))
      },
      'image/jpeg',
      opts.quality
    )
  })

  const compressedFile = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
    type: 'image/jpeg'
  })

  return { file: compressedFile, width: newWidth, height: newHeight }
}

/**
 * Upload an image file via BlobService.
 *
 * Validates, optionally compresses, then stores.
 */
export async function uploadImage(
  file: File,
  blobService: BlobService,
  options: ImageUploadOptions = {}
): Promise<ImageUploadResult> {
  // Validate
  const validation = validateImageFile(file, options)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  // Get dimensions
  const dimensions = await loadImageDimensions(file)

  // Compress if needed
  const { file: processedFile, width, height } = await compressImage(file, dimensions, options)

  // Upload via BlobService
  const fileRef = await blobService.upload(processedFile)

  // Get display URL
  const url = await blobService.getUrl(fileRef)

  return { fileRef, width, height, url }
}

/** Load a File into an HTMLImageElement */
function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}
