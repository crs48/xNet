/**
 * ChunkManager - Handles chunked storage for large files.
 *
 * Files larger than CHUNK_THRESHOLD are split into 256KB chunks,
 * stored individually with a manifest that records chunk order and
 * a Merkle root hash for integrity verification.
 */
import type { ContentId, ContentChunk } from '@xnet/core'
import { buildMerkleTree } from '@xnet/core'
import type { BlobStore } from './blob-store'

/** Chunk size: 256KB - good balance for sync efficiency */
export const CHUNK_SIZE = 256 * 1024

/** Files smaller than this are stored as single blob */
export const CHUNK_THRESHOLD = 1024 * 1024 // 1MB

/**
 * Manifest stored for chunked files.
 * The manifest CID is what gets stored in FileRef.
 */
export interface ChunkManifest {
  /** Version for future compatibility */
  version: 1
  /** Original file size */
  totalSize: number
  /** MIME type */
  mimeType: string
  /** Original filename */
  filename: string
  /** Root hash of Merkle tree */
  rootHash: string
  /** Ordered list of chunk CIDs */
  chunks: ContentId[]
  /** Chunk size used */
  chunkSize: number
}

export interface StoreResult {
  /** CID of stored data (raw or manifest) */
  cid: ContentId
  /** Whether the file was chunked */
  isChunked: boolean
}

/**
 * ChunkManager - Handles chunked storage for large files.
 */
export class ChunkManager {
  constructor(private blobStore: BlobStore) {}

  /**
   * Store a file, chunking if necessary.
   * Returns the CID of either:
   * - The raw data (if < CHUNK_THRESHOLD)
   * - The manifest (if >= CHUNK_THRESHOLD)
   */
  async store(
    data: Uint8Array,
    metadata: { filename: string; mimeType: string }
  ): Promise<StoreResult> {
    // Small files: store directly
    if (data.byteLength < CHUNK_THRESHOLD) {
      const cid = await this.blobStore.put(data)
      return { cid, isChunked: false }
    }

    // Large files: chunk and create manifest
    const chunks = this.createChunks(data)
    const chunkCids: ContentId[] = []

    // Store each chunk
    for (const chunk of chunks) {
      const cid = await this.blobStore.put(chunk)
      chunkCids.push(cid)
    }

    // Build Merkle tree for integrity
    const contentChunks: ContentChunk[] = chunks.map((chunkData, i) => ({
      data: chunkData,
      hash: chunkCids[i].replace('cid:blake3:', ''),
      size: chunkData.byteLength
    }))
    const tree = buildMerkleTree(contentChunks)

    // Create and store manifest
    const manifest: ChunkManifest = {
      version: 1,
      totalSize: data.byteLength,
      mimeType: metadata.mimeType,
      filename: metadata.filename,
      rootHash: tree.rootHash,
      chunks: chunkCids,
      chunkSize: CHUNK_SIZE
    }

    const manifestData = new TextEncoder().encode(JSON.stringify(manifest))
    const manifestCid = await this.blobStore.put(manifestData)

    return { cid: manifestCid, isChunked: true }
  }

  /**
   * Retrieve a file, reassembling chunks if necessary.
   */
  async retrieve(cid: ContentId): Promise<Uint8Array | null> {
    const data = await this.blobStore.get(cid)
    if (!data) return null

    // Try to parse as manifest
    const manifest = this.parseManifest(data)
    if (manifest) {
      return this.reassembleChunks(manifest)
    }

    return data
  }

  /**
   * Check if a file (or all its chunks) exists.
   */
  async has(cid: ContentId): Promise<boolean> {
    if (!(await this.blobStore.has(cid))) {
      return false
    }

    // Check if it's a manifest with missing chunks
    const data = await this.blobStore.get(cid)
    if (!data) return false

    const manifest = this.parseManifest(data)
    if (manifest) {
      for (const chunkCid of manifest.chunks) {
        if (!(await this.blobStore.has(chunkCid))) {
          return false
        }
      }
    }

    return true
  }

  /**
   * Get list of missing chunk CIDs for a manifest.
   * Useful for requesting missing chunks during sync.
   */
  async getMissingChunks(cid: ContentId): Promise<ContentId[]> {
    const data = await this.blobStore.get(cid)
    if (!data) return [cid] // Manifest itself is missing

    const manifest = this.parseManifest(data)
    if (!manifest) return []

    const missing: ContentId[] = []
    for (const chunkCid of manifest.chunks) {
      if (!(await this.blobStore.has(chunkCid))) {
        missing.push(chunkCid)
      }
    }
    return missing
  }

  /**
   * Try to parse data as a ChunkManifest.
   * Returns null if it's not a valid manifest.
   */
  private parseManifest(data: Uint8Array): ChunkManifest | null {
    try {
      const text = new TextDecoder().decode(data)
      const parsed = JSON.parse(text)

      if (parsed.version === 1 && Array.isArray(parsed.chunks)) {
        return parsed as ChunkManifest
      }
    } catch {
      // Not a manifest
    }
    return null
  }

  /**
   * Split data into chunks.
   */
  private createChunks(data: Uint8Array): Uint8Array[] {
    const chunks: Uint8Array[] = []
    let offset = 0

    while (offset < data.byteLength) {
      const end = Math.min(offset + CHUNK_SIZE, data.byteLength)
      chunks.push(data.slice(offset, end))
      offset = end
    }

    return chunks
  }

  /**
   * Reassemble chunks from a manifest.
   */
  private async reassembleChunks(manifest: ChunkManifest): Promise<Uint8Array> {
    const result = new Uint8Array(manifest.totalSize)
    let offset = 0

    for (const chunkCid of manifest.chunks) {
      const chunk = await this.blobStore.get(chunkCid)
      if (!chunk) {
        throw new Error(`Missing chunk: ${chunkCid}`)
      }
      result.set(chunk, offset)
      offset += chunk.byteLength
    }

    return result
  }
}
