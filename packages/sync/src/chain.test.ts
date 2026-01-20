import { describe, it, expect } from 'vitest'
import { generateSigningKeyPair } from '@xnet/crypto'
import type { DID, ContentId } from '@xnet/core'
import { signChange, createUnsignedChange } from './change'
import type { Change } from './change'
import type { LamportTimestamp } from './clock'
import {
  validateChain,
  detectFork,
  getChainHeads,
  getChainRoots,
  getAncestry,
  findCommonAncestor,
  getForks,
  topologicalSort
} from './chain'

describe('Chain', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID
  const keyPair = generateSigningKeyPair()

  function createTestChange(
    id: string,
    parentHash: ContentId | null,
    lamportTime: number
  ): Change<{ seq: number }> {
    const lamport: LamportTimestamp = { time: lamportTime, author: testDID }
    return signChange(
      createUnsignedChange({
        id,
        type: 'test',
        payload: { seq: lamportTime },
        parentHash,
        authorDID: testDID,
        lamport,
        wallTime: lamportTime * 1000
      }),
      keyPair.privateKey
    )
  }

  describe('validateChain', () => {
    it('validates empty chain', () => {
      const result = validateChain([])
      expect(result.valid).toBe(true)
    })

    it('validates single change', () => {
      const change = createTestChange('c1', null, 1)
      const result = validateChain([change])
      expect(result.valid).toBe(true)
    })

    it('validates linear chain', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2 = createTestChange('c2', c1.hash, 2)
      const c3 = createTestChange('c3', c2.hash, 3)

      const result = validateChain([c1, c2, c3])
      expect(result.valid).toBe(true)
    })

    it('detects fork in chain', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2a = createTestChange('c2a', c1.hash, 2)
      const c2b = createTestChange('c2b', c1.hash, 2)

      const result = validateChain([c1, c2a, c2b])
      expect(result.valid).toBe(true) // Forks are valid, just detected
      expect(result.forkDetected).toBe(true)
      expect(result.forkPoint).toBe(c1.hash)
    })

    it('detects tampered change', () => {
      const c1 = createTestChange('c1', null, 1)
      // Tamper with the payload
      const tampered = { ...c1, payload: { seq: 999 } }

      const result = validateChain([tampered])
      expect(result.valid).toBe(false)
      expect(result.error).toContain('invalid hash')
    })
  })

  describe('detectFork', () => {
    it('returns no fork for linear chain', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2 = createTestChange('c2', c1.hash, 2)

      const result = detectFork([c1, c2])
      expect(result.hasFork).toBe(false)
      expect(result.forkPoints).toHaveLength(0)
    })

    it('detects single fork', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2a = createTestChange('c2a', c1.hash, 2)
      const c2b = createTestChange('c2b', c1.hash, 2)

      const result = detectFork([c1, c2a, c2b])
      expect(result.hasFork).toBe(true)
      expect(result.forkPoints).toContain(c1.hash)
    })

    it('detects multiple forks', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2a = createTestChange('c2a', c1.hash, 2)
      const c2b = createTestChange('c2b', c1.hash, 2)
      const c3a = createTestChange('c3a', c2a.hash, 3)
      const c3b = createTestChange('c3b', c2a.hash, 3)

      const result = detectFork([c1, c2a, c2b, c3a, c3b])
      expect(result.hasFork).toBe(true)
      expect(result.forkPoints).toHaveLength(2)
    })

    it('does not count multiple roots as fork', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2 = createTestChange('c2', null, 1) // Different root

      const result = detectFork([c1, c2])
      expect(result.hasFork).toBe(false)
    })
  })

  describe('getChainHeads', () => {
    it('returns single head for linear chain', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2 = createTestChange('c2', c1.hash, 2)
      const c3 = createTestChange('c3', c2.hash, 3)

      const heads = getChainHeads([c1, c2, c3])
      expect(heads).toHaveLength(1)
      expect(heads[0].id).toBe('c3')
    })

    it('returns multiple heads for forked chain', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2a = createTestChange('c2a', c1.hash, 2)
      const c2b = createTestChange('c2b', c1.hash, 2)

      const heads = getChainHeads([c1, c2a, c2b])
      expect(heads).toHaveLength(2)
      expect(heads.map((h) => h.id).sort()).toEqual(['c2a', 'c2b'])
    })

    it('handles single change', () => {
      const c1 = createTestChange('c1', null, 1)
      const heads = getChainHeads([c1])
      expect(heads).toHaveLength(1)
      expect(heads[0].id).toBe('c1')
    })
  })

  describe('getChainRoots', () => {
    it('returns single root', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2 = createTestChange('c2', c1.hash, 2)

      const roots = getChainRoots([c1, c2])
      expect(roots).toHaveLength(1)
      expect(roots[0].id).toBe('c1')
    })

    it('returns multiple roots', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2 = createTestChange('c2', null, 1)

      const roots = getChainRoots([c1, c2])
      expect(roots).toHaveLength(2)
    })
  })

  describe('getAncestry', () => {
    it('returns empty for root', () => {
      const c1 = createTestChange('c1', null, 1)
      const ancestry = getAncestry(c1, [c1])
      expect(ancestry).toHaveLength(0)
    })

    it('returns ancestors in order (oldest to newest)', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2 = createTestChange('c2', c1.hash, 2)
      const c3 = createTestChange('c3', c2.hash, 3)

      const ancestry = getAncestry(c3, [c1, c2, c3])
      expect(ancestry).toHaveLength(2)
      expect(ancestry[0].id).toBe('c1')
      expect(ancestry[1].id).toBe('c2')
    })
  })

  describe('findCommonAncestor', () => {
    it('finds common ancestor of forked changes', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2a = createTestChange('c2a', c1.hash, 2)
      const c2b = createTestChange('c2b', c1.hash, 2)

      const ancestor = findCommonAncestor(c2a, c2b, [c1, c2a, c2b])
      expect(ancestor).not.toBeNull()
      expect(ancestor!.id).toBe('c1')
    })

    it('returns null for unrelated changes', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2 = createTestChange('c2', null, 1)

      const ancestor = findCommonAncestor(c1, c2, [c1, c2])
      expect(ancestor).toBeNull()
    })

    it('returns b if b is ancestor of a', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2 = createTestChange('c2', c1.hash, 2)

      const ancestor = findCommonAncestor(c2, c1, [c1, c2])
      expect(ancestor).not.toBeNull()
      expect(ancestor!.id).toBe('c1')
    })
  })

  describe('getForks', () => {
    it('returns empty for linear chain', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2 = createTestChange('c2', c1.hash, 2)

      const forks = getForks([c1, c2])
      expect(forks).toHaveLength(0)
    })

    it('returns fork details', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2a = createTestChange('c2a', c1.hash, 2)
      const c2b = createTestChange('c2b', c1.hash, 3)

      const forks = getForks([c1, c2a, c2b])
      expect(forks).toHaveLength(1)
      expect(forks[0].commonAncestor).toBe(c1.hash)
      expect(forks[0].branch1).toHaveLength(1)
      expect(forks[0].branch2).toHaveLength(1)
    })
  })

  describe('topologicalSort', () => {
    it('sorts linear chain', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2 = createTestChange('c2', c1.hash, 2)
      const c3 = createTestChange('c3', c2.hash, 3)

      // Pass in wrong order
      const sorted = topologicalSort([c3, c1, c2])
      expect(sorted.map((c) => c.id)).toEqual(['c1', 'c2', 'c3'])
    })

    it('handles forked chain', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2a = createTestChange('c2a', c1.hash, 2)
      const c2b = createTestChange('c2b', c1.hash, 2)

      const sorted = topologicalSort([c2b, c2a, c1])
      // c1 must come before c2a and c2b
      expect(sorted[0].id).toBe('c1')
      expect(
        sorted
          .slice(1)
          .map((c) => c.id)
          .sort()
      ).toEqual(['c2a', 'c2b'])
    })

    it('handles multiple roots', () => {
      const c1 = createTestChange('c1', null, 1)
      const c2 = createTestChange('c2', null, 1)
      const c3 = createTestChange('c3', c1.hash, 2)

      const sorted = topologicalSort([c3, c2, c1])
      // c1 must come before c3, c2 can be anywhere
      const c1Index = sorted.findIndex((c) => c.id === 'c1')
      const c3Index = sorted.findIndex((c) => c.id === 'c3')
      expect(c1Index).toBeLessThan(c3Index)
    })
  })
})
