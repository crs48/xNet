/**
 * Content addressing types for xNet
 */

/**
 * Content ID format: cid:blake3:{hash}
 */
export type ContentId = `cid:blake3:${string}`

/**
 * A chunk of content with its hash
 */
export interface ContentChunk {
  data: Uint8Array
  hash: string // BLAKE3 hash
  size: number
}

/**
 * Merkle tree node for document structure
 */
export interface MerkleNode {
  hash: string
  children?: string[] // Child hashes (for non-leaf nodes)
  data?: Uint8Array // Chunk data (for leaf nodes)
}

/**
 * Complete content tree for a document
 */
export interface ContentTree {
  rootHash: string
  nodes: Map<string, MerkleNode>
}

/**
 * Content resolver interface
 */
export interface ContentResolver {
  /** Get content by CID */
  get(cid: ContentId): Promise<Uint8Array | null>

  /** Store content, returns CID */
  put(data: Uint8Array): Promise<ContentId>

  /** Verify content matches CID */
  verify(cid: ContentId, data: Uint8Array): boolean

  /** Build Merkle tree from chunks */
  buildTree(chunks: ContentChunk[]): ContentTree
}
