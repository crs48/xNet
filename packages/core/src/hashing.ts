/**
 * BLAKE3 content hashing for xNet
 */
import type { ContentId, ContentChunk, ContentTree, MerkleNode } from './content'
import { blake3 } from '@noble/hashes/blake3.js'

/**
 * Hash content using BLAKE3
 */
export function hashContent(data: Uint8Array): string {
  const hash = blake3(data)
  return bytesToHex(hash)
}

/**
 * Create a ContentId from a hash
 */
export function createContentId(hash: string): ContentId {
  return `cid:blake3:${hash}`
}

/**
 * Parse a ContentId to extract the hash
 */
export function parseContentId(cid: ContentId): string {
  const match = cid.match(/^cid:blake3:([a-f0-9]+)$/)
  if (!match) throw new Error(`Invalid CID: ${cid}`)
  return match[1]
}

/**
 * Verify content matches a CID
 */
export function verifyContent(cid: ContentId, data: Uint8Array): boolean {
  const expectedHash = parseContentId(cid)
  const actualHash = hashContent(data)
  return expectedHash === actualHash
}

/**
 * Create a content chunk from data
 */
export function createChunk(data: Uint8Array): ContentChunk {
  return {
    data,
    hash: hashContent(data),
    size: data.length
  }
}

/**
 * Build a Merkle tree from content chunks
 */
export function buildMerkleTree(chunks: ContentChunk[]): ContentTree {
  const nodes = new Map<string, MerkleNode>()

  if (chunks.length === 0) {
    const emptyHash = hashContent(new Uint8Array(0))
    nodes.set(emptyHash, { hash: emptyHash, data: new Uint8Array(0) })
    return { rootHash: emptyHash, nodes }
  }

  // Create leaf nodes
  const leafHashes: string[] = []
  for (const chunk of chunks) {
    nodes.set(chunk.hash, {
      hash: chunk.hash,
      data: chunk.data
    })
    leafHashes.push(chunk.hash)
  }

  // Build tree bottom-up
  let currentLevel = leafHashes
  while (currentLevel.length > 1) {
    const nextLevel: string[] = []
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i]
      const right = currentLevel[i + 1] || left // Duplicate last if odd
      const combined = new TextEncoder().encode(left + right)
      const parentHash = hashContent(combined)
      nodes.set(parentHash, {
        hash: parentHash,
        children: left === right ? [left] : [left, right]
      })
      nextLevel.push(parentHash)
    }
    currentLevel = nextLevel
  }

  return {
    rootHash: currentLevel[0],
    nodes
  }
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
