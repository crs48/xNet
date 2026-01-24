/**
 * BlobService - High-level file upload and retrieval.
 *
 * Provides a simple API for storing and retrieving files,
 * handling chunking, URL generation, and cleanup.
 */
import type { ContentId } from '@xnet/core'
import type { ChunkManager } from '@xnet/storage'
import type { FileRef } from '../schema/properties/file'

export interface BlobServiceOptions {
  /** Maximum file size in bytes (default: 100MB) */
  maxSize?: number
}

export class BlobService {
  private urlCache = new Map<string, string>()

  constructor(
    private chunkManager: ChunkManager,
    private options: BlobServiceOptions = {}
  ) {}

  /**
   * Upload a File and return a FileRef for storage in node properties.
   */
  async upload(file: File): Promise<FileRef> {
    const maxSize = this.options.maxSize ?? 100 * 1024 * 1024

    if (file.size > maxSize) {
      throw new Error(`File too large: ${file.size} bytes (max: ${maxSize})`)
    }

    const arrayBuffer = await file.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)

    const { cid } = await this.chunkManager.store(data, {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream'
    })

    return {
      cid,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size
    }
  }

  /**
   * Upload from Uint8Array (for programmatic use).
   */
  async uploadData(
    data: Uint8Array,
    metadata: { filename: string; mimeType: string }
  ): Promise<FileRef> {
    const { cid } = await this.chunkManager.store(data, metadata)

    return {
      cid,
      name: metadata.filename,
      mimeType: metadata.mimeType,
      size: data.byteLength
    }
  }

  /**
   * Get a URL for displaying/downloading a file.
   * Creates a blob URL that should be revoked when no longer needed.
   */
  async getUrl(ref: FileRef): Promise<string> {
    const cached = this.urlCache.get(ref.cid)
    if (cached) return cached

    const data = await this.chunkManager.retrieve(ref.cid as ContentId)
    if (!data) {
      throw new Error(`Blob not found: ${ref.cid}`)
    }

    const blob = new Blob([data as unknown as BlobPart], { type: ref.mimeType })
    const url = URL.createObjectURL(blob)

    this.urlCache.set(ref.cid, url)
    return url
  }

  /**
   * Get raw data for a file.
   */
  async getData(ref: FileRef): Promise<Uint8Array | null> {
    return this.chunkManager.retrieve(ref.cid as ContentId)
  }

  /**
   * Check if a file exists locally.
   */
  async has(ref: FileRef): Promise<boolean> {
    return this.chunkManager.has(ref.cid as ContentId)
  }

  /**
   * Get list of missing chunk CIDs (for sync).
   */
  async getMissingChunks(ref: FileRef): Promise<ContentId[]> {
    return this.chunkManager.getMissingChunks(ref.cid as ContentId)
  }

  /**
   * Revoke a blob URL to free memory.
   */
  revokeUrl(ref: FileRef): void {
    const url = this.urlCache.get(ref.cid)
    if (url) {
      URL.revokeObjectURL(url)
      this.urlCache.delete(ref.cid)
    }
  }

  /**
   * Revoke all cached blob URLs.
   */
  revokeAllUrls(): void {
    for (const url of this.urlCache.values()) {
      URL.revokeObjectURL(url)
    }
    this.urlCache.clear()
  }
}
