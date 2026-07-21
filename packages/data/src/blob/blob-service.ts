/**
 * BlobService - High-level file upload and retrieval.
 *
 * Provides a simple API for storing and retrieving files,
 * handling chunking, URL generation, and cleanup.
 */
import type { FileRef } from '../schema/properties/file'
import type { ContentId } from '@xnetjs/core'
import type { ChunkManager } from '@xnetjs/storage'
import { canThumbnail, generateThumbnail } from './thumbnail'

export interface BlobServiceOptions {
  /** Maximum file size in bytes (default: 100MB) */
  maxSize?: number
  /**
   * Generate a small preview alongside images/video at attach time
   * (exploration 0385 W4). Off by default so non-DOM hosts (tests, node)
   * aren't asked for canvas APIs.
   */
  generateThumbnails?: boolean
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

    const mimeType = file.type || 'application/octet-stream'
    const { cid } = await this.chunkManager.store(data, {
      filename: file.name,
      mimeType
    })

    const ref: FileRef = {
      cid,
      name: file.name,
      mimeType,
      size: file.size
    }

    // A preview is stored as its own (tiny) blob so it can sync ahead of the
    // original — see exploration 0385 W4. Failure here is never fatal.
    if (this.options.generateThumbnails && canThumbnail(mimeType)) {
      const thumb = await generateThumbnail(file, mimeType).catch(() => null)
      if (thumb) {
        const stored = await this.chunkManager.store(thumb.data, {
          filename: `${file.name}.thumb`,
          mimeType: thumb.mimeType
        })
        ref.thumbCid = stored.cid
        ref.width = thumb.width
        ref.height = thumb.height
      }
    }

    return ref
  }

  /**
   * Resolve a ref's thumbnail to a URL, falling back to the full file.
   * Returns null when neither is available locally.
   */
  async getThumbUrl(ref: FileRef): Promise<string | null> {
    if (ref.thumbCid) {
      const cached = this.urlCache.get(ref.thumbCid)
      if (cached) return cached
      const data = await this.chunkManager.retrieve(ref.thumbCid as ContentId)
      if (data) {
        const url = URL.createObjectURL(new Blob([data as unknown as BlobPart]))
        this.urlCache.set(ref.thumbCid, url)
        return url
      }
    }
    return this.getUrl(ref).catch(() => null)
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
   * Raw stored bytes for a CID, without reassembling a chunked file, so
   * `blake3(result) === cid`. Transfer must send these, not the reassembled
   * file — a chunked ref's CID is its manifest's (exploration 0385 W3).
   */
  async getRawBlob(cid: string): Promise<Uint8Array | null> {
    return this.chunkManager.getRaw(cid as ContentId)
  }

  /** Store raw transferred bytes under their own content hash. */
  async putRawBlob(data: Uint8Array): Promise<string> {
    return this.chunkManager.putRaw(data)
  }

  /** Every CID that must travel for this file: chunks first, manifest last. */
  async getTransferCids(ref: FileRef): Promise<string[]> {
    return this.chunkManager.getTransferCids(ref.cid as ContentId)
  }

  /** Chunk CIDs a manifest blob references, or [] if it isn't a manifest. */
  chunkCidsOf(data: Uint8Array): string[] {
    return this.chunkManager.chunkCidsOf(data)
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
