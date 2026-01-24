/**
 * BlobStore - Content-addressed blob storage with integrity verification.
 *
 * Wraps StorageAdapter blob methods with automatic CID computation and
 * deduplication. Implements the ContentResolver interface from @xnet/core.
 */
import type { ContentId, ContentResolver, ContentChunk, ContentTree } from '@xnet/core'
import { hashContent, createContentId, verifyContent, buildMerkleTree } from '@xnet/core'
import type { StorageAdapter } from './types'

export class BlobStore implements ContentResolver {
  constructor(private adapter: StorageAdapter) {}

  /**
   * Store data and return its content ID.
   * If data with same CID already exists, this is a no-op (deduplication).
   */
  async put(data: Uint8Array): Promise<ContentId> {
    const hash = hashContent(data)
    const cid = createContentId(hash)

    // Deduplication: skip if already stored
    if (await this.adapter.hasBlob(cid)) {
      return cid
    }

    await this.adapter.setBlob(cid, data)
    return cid
  }

  /**
   * Retrieve data by content ID.
   * Returns null if not found.
   */
  async get(cid: ContentId): Promise<Uint8Array | null> {
    return this.adapter.getBlob(cid)
  }

  /**
   * Check if data exists for a content ID.
   */
  async has(cid: ContentId): Promise<boolean> {
    return this.adapter.hasBlob(cid)
  }

  /**
   * Verify that data matches its content ID.
   */
  verify(cid: ContentId, data: Uint8Array): boolean {
    return verifyContent(cid, data)
  }

  /**
   * Build a Merkle tree from content chunks.
   */
  buildTree(chunks: ContentChunk[]): ContentTree {
    return buildMerkleTree(chunks)
  }

  /**
   * Delete data by content ID.
   * Note: The StorageAdapter interface does not have deleteBlob yet,
   * so this is a no-op placeholder for future implementation.
   */
  async delete(cid: ContentId): Promise<void> {
    // StorageAdapter.deleteBlob is not yet part of the interface.
    // When it is added, this will delegate to it.
    const adapter = this.adapter as any
    if (typeof adapter.deleteBlob === 'function') {
      await adapter.deleteBlob(cid)
    }
  }
}
