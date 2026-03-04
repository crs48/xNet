/**
 * Tests for integrity verification utilities.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Change } from './change'
import { generateKeyPair } from '@xnetjs/crypto'
import { describe, it, expect } from 'vitest'
import { signChange, createUnsignedChange } from './change'
import {
  verifyIntegrity,
  quickIntegrityCheck,
  verifySingleChange,
  findOrphans,
  findRoots,
  findHeads,
  getChainDepth,
  attemptRepair,
  formatIntegrityReport
} from './integrity'

// ─── Test Fixtures ────────────────────────────────────────────────────────────

async function createTestChange(
  overrides: Partial<{
    id: string
    parentHash: string | null
    lamportTime: number
    wallTime: number
  }> = {}
): Promise<Change<{ data: string }>> {
  const keyPair = await generateKeyPair()
  const unsigned = createUnsignedChange({
    id: overrides.id ?? `change-${Math.random().toString(36).slice(2)}`,
    type: 'test-change',
    payload: { data: 'test' },
    parentHash: (overrides.parentHash ?? null) as any,
    authorDID: 'did:key:test' as any,
    lamport: {
      time: overrides.lamportTime ?? 1,
      author: 'did:key:test' as any
    },
    wallTime: overrides.wallTime ?? Date.now()
  })
  return signChange(unsigned, keyPair.privateKey)
}

async function createChain(length: number): Promise<Change<{ data: string }>[]> {
  const changes: Change<{ data: string }>[] = []
  let parentHash: string | null = null

  for (let i = 0; i < length; i++) {
    const change = await createTestChange({
      id: `chain-${i}`,
      parentHash,
      lamportTime: i + 1
    })
    changes.push(change)
    parentHash = change.hash
  }

  return changes
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('verifyIntegrity', () => {
  it('should pass for valid changes', async () => {
    const changes = await Promise.all([
      createTestChange({ id: 'c1' }),
      createTestChange({ id: 'c2' }),
      createTestChange({ id: 'c3' })
    ])

    const report = await verifyIntegrity(changes)

    expect(report.checked).toBe(3)
    expect(report.valid).toBe(3)
    expect(report.issues).toHaveLength(0)
  })

  it('should detect hash mismatch', async () => {
    const change = await createTestChange({ id: 'bad-hash' })
    // Tamper with the hash
    ;(change as any).hash = 'cid:blake3:badhash'

    const report = await verifyIntegrity([change])

    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].type).toBe('hash-mismatch')
    expect(report.issues[0].severity).toBe('error')
  })

  it('should detect missing signature', async () => {
    const change = await createTestChange({ id: 'no-sig' })
    // Remove signature
    ;(change as any).signature = new Uint8Array(0)

    const report = await verifyIntegrity([change], { skipHashes: true })

    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].type).toBe('signature-invalid')
  })

  it('should detect duplicate IDs', async () => {
    const change1 = await createTestChange({ id: 'dup' })
    const change2 = await createTestChange({ id: 'dup' })

    const report = await verifyIntegrity([change1, change2])

    expect(report.issues.some((i) => i.type === 'duplicate-id')).toBe(true)
  })

  it('should detect missing parent', async () => {
    const change = await createTestChange({
      id: 'orphan',
      parentHash: 'cid:blake3:nonexistent'
    })

    const report = await verifyIntegrity([change])

    expect(report.issues.some((i) => i.type === 'missing-parent')).toBe(true)
  })

  it('should detect invalid lamport time', async () => {
    const change = await createTestChange({ id: 'bad-lamport' })
    // Set invalid lamport time
    ;(change as any).lamport.time = -1

    const report = await verifyIntegrity([change], { skipHashes: true })

    expect(report.issues.some((i) => i.type === 'invalid-lamport')).toBe(true)
  })

  it('should detect future timestamps', async () => {
    const futureTime = Date.now() + 120000 // 2 minutes in future
    const change = await createTestChange({
      id: 'future',
      wallTime: futureTime
    })

    const report = await verifyIntegrity([change], {
      skipHashes: true,
      maxFutureTimestamp: 60000
    })

    expect(report.issues.some((i) => i.type === 'future-timestamp')).toBe(true)
  })

  it('should respect skip options', async () => {
    const change = await createTestChange({ id: 'skip-test' })
    // Tamper with hash
    ;(change as any).hash = 'cid:blake3:tampered'

    const report = await verifyIntegrity([change], { skipHashes: true })

    // Should not detect hash mismatch when skipped
    expect(report.issues.filter((i) => i.type === 'hash-mismatch')).toHaveLength(0)
  })

  it('should call progress callback', async () => {
    const changes = await Promise.all([
      createTestChange({ id: 'p1' }),
      createTestChange({ id: 'p2' }),
      createTestChange({ id: 'p3' })
    ])

    const progressCalls: Array<[number, number]> = []
    await verifyIntegrity(changes, {
      onProgress: (checked, total) => {
        progressCalls.push([checked, total])
      }
    })

    expect(progressCalls).toHaveLength(3)
    expect(progressCalls[0]).toEqual([1, 3])
    expect(progressCalls[2]).toEqual([3, 3])
  })

  it('should calculate repairable correctly', async () => {
    const change1 = await createTestChange({ id: 'repairable' })
    ;(change1 as any).hash = 'cid:blake3:bad' // Repairable

    const report = await verifyIntegrity([change1])

    expect(report.repairable).toBe(true)
  })

  it('should include duration in report', async () => {
    const changes = [await createTestChange({ id: 'duration-test' })]

    const report = await verifyIntegrity(changes)

    expect(report.durationMs).toBeGreaterThanOrEqual(0)
  })
})

describe('quickIntegrityCheck', () => {
  it('should skip signature verification', async () => {
    const change = await createTestChange({ id: 'quick-test' })

    const report = await quickIntegrityCheck([change])

    expect(report.checked).toBe(1)
    expect(report.valid).toBe(1)
  })
})

describe('verifySingleChange', () => {
  it('should verify a single change', async () => {
    const change = await createTestChange({ id: 'single' })

    const result = await verifySingleChange(change)

    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('should detect issues in a single change', async () => {
    const change = await createTestChange({ id: 'single-bad' })
    ;(change as any).hash = 'cid:blake3:bad'

    const result = await verifySingleChange(change)

    expect(result.valid).toBe(false)
    expect(result.issues.length).toBeGreaterThan(0)
  })
})

describe('Chain utilities', () => {
  describe('findOrphans', () => {
    it('should find orphaned changes', async () => {
      const orphan = await createTestChange({
        id: 'orphan',
        parentHash: 'cid:blake3:missing'
      })
      const root = await createTestChange({ id: 'root', parentHash: null })

      const orphans = findOrphans([orphan, root])

      expect(orphans).toHaveLength(1)
      expect(orphans[0].id).toBe('orphan')
    })

    it('should not include changes with valid parents', async () => {
      const chain = await createChain(3)

      const orphans = findOrphans(chain)

      expect(orphans).toHaveLength(0)
    })
  })

  describe('findRoots', () => {
    it('should find root changes', async () => {
      const chain = await createChain(3)

      const roots = findRoots(chain)

      expect(roots).toHaveLength(1)
      expect(roots[0].id).toBe('chain-0')
    })

    it('should find multiple roots', async () => {
      const root1 = await createTestChange({ id: 'root1', parentHash: null })
      const root2 = await createTestChange({ id: 'root2', parentHash: null })

      const roots = findRoots([root1, root2])

      expect(roots).toHaveLength(2)
    })
  })

  describe('findHeads', () => {
    it('should find head changes', async () => {
      const chain = await createChain(3)

      const heads = findHeads(chain)

      expect(heads).toHaveLength(1)
      expect(heads[0].id).toBe('chain-2')
    })
  })

  describe('getChainDepth', () => {
    it('should calculate chain depth', async () => {
      const chain = await createChain(5)

      const depth = getChainDepth(chain)

      expect(depth).toBe(5)
    })

    it('should return 0 for empty array', () => {
      expect(getChainDepth([])).toBe(0)
    })
  })
})

describe('attemptRepair', () => {
  it('should repair hash mismatches', async () => {
    const change = await createTestChange({ id: 'repair-hash' })
    ;(change as any).hash = 'cid:blake3:bad'

    const issues = [
      {
        changeId: 'repair-hash',
        type: 'hash-mismatch' as const,
        details: 'Hash mismatch',
        severity: 'error' as const,
        repairAction: {
          type: 'recompute-hash' as const,
          description: 'Recompute hash',
          automatic: true
        }
      }
    ]

    const result = await attemptRepair([change], issues)

    expect(result.repairCount).toBe(1)
    expect(result.remainingIssues).toHaveLength(0)
    // Hash should be recomputed (not 'bad' anymore)
    expect(result.repaired[0].hash).not.toBe('cid:blake3:bad')
    expect(result.repaired[0].hash).toMatch(/^cid:blake3:/)
  })

  it('should not repair non-automatic issues', async () => {
    const change = await createTestChange({ id: 'no-repair' })

    const issues = [
      {
        changeId: 'no-repair',
        type: 'signature-invalid' as const,
        details: 'Bad signature',
        severity: 'error' as const
        // No repair action
      }
    ]

    const result = await attemptRepair([change], issues)

    expect(result.repairCount).toBe(0)
    expect(result.remainingIssues).toHaveLength(1)
  })
})

describe('formatIntegrityReport', () => {
  it('should format a clean report', async () => {
    const changes = [await createTestChange({ id: 'format-test' })]
    const report = await verifyIntegrity(changes)

    const formatted = formatIntegrityReport(report)

    expect(formatted).toContain('Integrity Report')
    expect(formatted).toContain('Checked: 1')
    expect(formatted).toContain('Valid: 1')
    expect(formatted).toContain('No issues found')
  })

  it('should format a report with issues', async () => {
    const change = await createTestChange({ id: 'format-issues' })
    ;(change as any).hash = 'cid:blake3:bad'
    const report = await verifyIntegrity([change])

    const formatted = formatIntegrityReport(report)

    expect(formatted).toContain('Issues:')
    expect(formatted).toContain('hash-mismatch')
  })
})
