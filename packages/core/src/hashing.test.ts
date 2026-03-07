import { describe, it, expect } from 'vitest'
import {
  hashContent,
  createContentId,
  parseContentId,
  verifyContent,
  createChunk,
  buildMerkleTree
} from './hashing'

describe('Content Addressing', () => {
  it('should hash content deterministically', () => {
    const data = new TextEncoder().encode('hello world')
    const hash1 = hashContent(data)
    const hash2 = hashContent(data)
    expect(hash1).toBe(hash2)
  })

  it('should produce different hashes for different content', () => {
    const data1 = new TextEncoder().encode('hello')
    const data2 = new TextEncoder().encode('world')
    expect(hashContent(data1)).not.toBe(hashContent(data2))
  })

  it('should create valid CID', () => {
    const data = new TextEncoder().encode('test')
    const hash = hashContent(data)
    const cid = createContentId(hash)
    expect(cid).toMatch(/^cid:blake3:[a-f0-9]+$/)
  })

  it('should parse CID back to hash', () => {
    const data = new TextEncoder().encode('test')
    const hash = hashContent(data)
    const cid = createContentId(hash)
    expect(parseContentId(cid)).toBe(hash)
  })

  it('should throw on invalid CID', () => {
    expect(() => parseContentId('invalid' as any)).toThrow('Invalid CID')
    expect(() => parseContentId('cid:sha256:abc' as any)).toThrow('Invalid CID')
  })

  it('should verify content matches CID', () => {
    const data = new TextEncoder().encode('test data')
    const hash = hashContent(data)
    const cid = createContentId(hash)
    expect(verifyContent(cid, data)).toBe(true)
  })

  it('should reject tampered content', () => {
    const data = new TextEncoder().encode('original')
    const hash = hashContent(data)
    const cid = createContentId(hash)
    const tampered = new TextEncoder().encode('modified')
    expect(verifyContent(cid, tampered)).toBe(false)
  })

  it('should hash 1MB payloads deterministically', () => {
    const data = new Uint8Array(1024 * 1024) // 1MB
    const hash = hashContent(data)
    expect(hash).toBe(hashContent(data))
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it.skipIf(process.env.CI || process.env.VITEST_PRECOMMIT)(
    'should hash 1MB within an expected local time budget',
    () => {
      const data = new Uint8Array(1024 * 1024)
      const maxDurationMs = 200

      // Warm up JIT before measuring the steady-state path.
      hashContent(data)
      const start = performance.now()

      hashContent(data)

      expect(performance.now() - start).toBeLessThan(maxDurationMs)
    }
  )

  it('should create content chunk', () => {
    const data = new TextEncoder().encode('chunk data')
    const chunk = createChunk(data)
    expect(chunk.data).toBe(data)
    expect(chunk.size).toBe(data.length)
    expect(chunk.hash).toBe(hashContent(data))
  })
})

describe('Merkle Tree', () => {
  it('should build tree from single chunk', () => {
    const data = new TextEncoder().encode('single')
    const chunk = createChunk(data)
    const tree = buildMerkleTree([chunk])

    expect(tree.rootHash).toBe(chunk.hash)
    expect(tree.nodes.size).toBe(1)
    expect(tree.nodes.get(chunk.hash)?.data).toBe(data)
  })

  it('should build tree from multiple chunks', () => {
    const chunks = [
      createChunk(new TextEncoder().encode('chunk1')),
      createChunk(new TextEncoder().encode('chunk2')),
      createChunk(new TextEncoder().encode('chunk3'))
    ]
    const tree = buildMerkleTree(chunks)

    // Should have leaf nodes + internal nodes
    expect(tree.nodes.size).toBeGreaterThan(chunks.length)
    expect(tree.rootHash).toBeDefined()

    // Root should have children
    const root = tree.nodes.get(tree.rootHash)
    expect(root?.children).toBeDefined()
  })

  it('should handle empty input', () => {
    const tree = buildMerkleTree([])
    expect(tree.rootHash).toBeDefined()
    expect(tree.nodes.size).toBe(1)
  })

  it('should produce deterministic tree', () => {
    const chunks = [
      createChunk(new TextEncoder().encode('a')),
      createChunk(new TextEncoder().encode('b'))
    ]
    const tree1 = buildMerkleTree(chunks)
    const tree2 = buildMerkleTree(chunks)
    expect(tree1.rootHash).toBe(tree2.rootHash)
  })
})
