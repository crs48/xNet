/**
 * Data Integrity Verification
 *
 * Utilities for verifying the integrity of change data, including:
 * - Hash verification
 * - Signature verification
 * - Chain integrity checks
 * - Detection of corruption and repair suggestions
 *
 * @example
 * ```typescript
 * const report = await verifyIntegrity(changes)
 * if (report.issues.length > 0) {
 *   console.log('Issues found:', report.issues)
 *   if (report.repairable) {
 *     console.log('All issues can be repaired')
 *   }
 * }
 * ```
 */

import type { Change } from './change'
import { parseDID } from '@xnetjs/identity'
import { computeChangeHash, verifyChange, verifyChangeHash } from './change'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Types of integrity issues that can be detected.
 */
export type IntegrityIssueType =
  | 'hash-mismatch'
  | 'signature-invalid'
  | 'chain-broken'
  | 'missing-parent'
  | 'duplicate-id'
  | 'invalid-lamport'
  | 'future-timestamp'

/**
 * Possible repair actions for integrity issues.
 */
export type RepairActionType =
  | 'recompute-hash'
  | 'request-from-peers'
  | 'remove-duplicate'
  | 'mark-orphan'
  | 'none'

/**
 * A repair action that can be taken to fix an integrity issue.
 */
export interface RepairAction {
  type: RepairActionType
  description: string
  /** Whether this repair can be done automatically */
  automatic: boolean
}

/**
 * An integrity issue found during verification.
 */
export interface IntegrityIssue {
  /** The change ID that has the issue */
  changeId: string
  /** Type of issue */
  type: IntegrityIssueType
  /** Human-readable description */
  details: string
  /** Severity: error = data may be corrupted, warning = anomaly detected */
  severity: 'error' | 'warning'
  /** Suggested repair action (if any) */
  repairAction?: RepairAction
}

/**
 * Result of an integrity verification.
 */
export interface IntegrityReport {
  /** Number of changes checked */
  checked: number
  /** Number of changes that passed all checks */
  valid: number
  /** List of issues found */
  issues: IntegrityIssue[]
  /** Whether all issues can be repaired */
  repairable: boolean
  /** Summary statistics */
  summary: {
    errors: number
    warnings: number
    byType: Record<IntegrityIssueType, number>
  }
  /** Time taken for verification (ms) */
  durationMs: number
}

/**
 * Options for integrity verification.
 */
export interface VerifyOptions {
  /** Skip signature verification (faster but less thorough) */
  skipSignatures?: boolean
  /** Skip hash verification */
  skipHashes?: boolean
  /** Skip chain verification */
  skipChain?: boolean
  /** Maximum future timestamp allowed (ms from now) */
  maxFutureTimestamp?: number
  /** Progress callback */
  onProgress?: (checked: number, total: number) => void
  /**
   * Resolve an author DID to its Ed25519 public key so signatures can be
   * verified cryptographically (not merely checked for presence). Defaults to
   * {@link parseDID} — a `did:key` is self-certifying (the DID *is* the public
   * key), so no external key lookup is needed. Provide a custom resolver only
   * for non-`did:key` identities.
   */
  resolveKey?: (did: string) => Uint8Array
}

// ─── Verification Functions ───────────────────────────────────────────────────

/**
 * Verify the integrity of a set of changes.
 *
 * Checks performed:
 * 1. Hash verification - computed hash matches stored hash
 * 2. Signature verification - Ed25519 signature is valid
 * 3. Chain integrity - parent hashes exist and form valid chains
 * 4. Duplicate detection - no duplicate change IDs
 * 5. Timestamp validation - no future timestamps
 */
export async function verifyIntegrity(
  changes: Change<unknown>[],
  options: VerifyOptions = {}
): Promise<IntegrityReport> {
  const startTime = Date.now()
  const issues: IntegrityIssue[] = []
  let valid = 0

  // Build lookup maps
  const changeById = new Map<string, Change<unknown>>()
  const changeByHash = new Map<string, Change<unknown>>()
  const duplicateIds = new Set<string>()

  // First pass: detect duplicates and build maps
  for (const change of changes) {
    if (changeById.has(change.id)) {
      duplicateIds.add(change.id)
    } else {
      changeById.set(change.id, change)
    }
    changeByHash.set(change.hash, change)
  }

  // Report duplicates
  for (const id of duplicateIds) {
    issues.push({
      changeId: id,
      type: 'duplicate-id',
      details: `Duplicate change ID found: ${id}`,
      severity: 'error',
      repairAction: {
        type: 'remove-duplicate',
        description: 'Remove duplicate changes, keeping the most recent',
        automatic: false
      }
    })
  }

  const now = Date.now()
  const maxFuture = options.maxFutureTimestamp ?? 60000 // 1 minute default

  // Second pass: verify each change
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]

    if (options.onProgress) {
      options.onProgress(i + 1, changes.length)
    }

    let hasIssue = false

    // Skip duplicates (already reported)
    if (duplicateIds.has(change.id)) {
      continue
    }

    // 1. Hash verification
    if (!options.skipHashes) {
      const hashValid = verifyChangeHash(change)
      if (!hashValid) {
        issues.push({
          changeId: change.id,
          type: 'hash-mismatch',
          details: `Hash mismatch: stored hash does not match computed hash`,
          severity: 'error',
          repairAction: {
            type: 'recompute-hash',
            description: 'Recompute and update the hash',
            automatic: true
          }
        })
        hasIssue = true
      }
    }

    // 2. Signature verification — real Ed25519 verification against the key
    // recovered from the author's DID. A `did:key` is self-certifying, so
    // `resolveKey` defaults to {@link parseDID} and no external trust anchor is
    // needed; a missing/empty signature or an unresolvable author DID is a hard
    // failure. (Historically this only checked that the field was non-empty,
    // which reported forged/garbage signatures as valid — exploration 0307.)
    if (!options.skipSignatures && !hasIssue) {
      if (!change.signature || change.signature.length === 0) {
        issues.push({
          changeId: change.id,
          type: 'signature-invalid',
          details: 'Signature is missing or empty',
          severity: 'error'
          // No automatic repair - would need original signing key
        })
        hasIssue = true
      } else {
        const resolveKey = options.resolveKey ?? parseDID
        let signatureValid = false
        try {
          signatureValid = verifyChange(change, resolveKey(change.authorDID))
        } catch {
          // Unresolvable/invalid author DID — authorship cannot be verified.
          signatureValid = false
        }
        if (!signatureValid) {
          issues.push({
            changeId: change.id,
            type: 'signature-invalid',
            details: 'Signature does not verify against the author DID',
            severity: 'error'
            // No automatic repair - would need original signing key
          })
          hasIssue = true
        }
      }
    }

    // 3. Chain integrity
    if (!options.skipChain && change.parentHash !== null) {
      if (!changeByHash.has(change.parentHash)) {
        issues.push({
          changeId: change.id,
          type: 'missing-parent',
          details: `Parent hash ${change.parentHash} not found`,
          severity: 'warning',
          repairAction: {
            type: 'request-from-peers',
            description: 'Request the missing parent from connected peers',
            automatic: true
          }
        })
        hasIssue = true
      }
    }

    // 4. Lamport timestamp validation
    if (change.lamport < 0) {
      issues.push({
        changeId: change.id,
        type: 'invalid-lamport',
        details: `Invalid Lamport time: ${change.lamport}`,
        severity: 'error'
      })
      hasIssue = true
    }

    // 5. Future timestamp detection
    if (change.wallTime > now + maxFuture) {
      issues.push({
        changeId: change.id,
        type: 'future-timestamp',
        details: `Wall time is in the future: ${new Date(change.wallTime).toISOString()}`,
        severity: 'warning'
      })
      hasIssue = true
    }

    if (!hasIssue) {
      valid++
    }
  }

  // Build summary
  const byType: Record<IntegrityIssueType, number> = {
    'hash-mismatch': 0,
    'signature-invalid': 0,
    'chain-broken': 0,
    'missing-parent': 0,
    'duplicate-id': 0,
    'invalid-lamport': 0,
    'future-timestamp': 0
  }

  let errors = 0
  let warnings = 0

  for (const issue of issues) {
    byType[issue.type]++
    if (issue.severity === 'error') {
      errors++
    } else {
      warnings++
    }
  }

  const repairable = issues.every(
    (issue) => issue.repairAction !== undefined && issue.repairAction.type !== 'none'
  )

  return {
    checked: changes.length,
    valid,
    issues,
    repairable,
    summary: {
      errors,
      warnings,
      byType
    },
    durationMs: Date.now() - startTime
  }
}

/**
 * Quick integrity check — verifies **hashes and chain only**, skipping
 * signature verification. Faster, but it does NOT authenticate authorship, so
 * a change with a forged signature and a self-consistent hash passes. Use the
 * full {@link verifyIntegrity} (default) when authorship matters.
 */
export async function quickIntegrityCheck(changes: Change<unknown>[]): Promise<IntegrityReport> {
  return verifyIntegrity(changes, {
    skipSignatures: true,
    skipChain: false
  })
}

/**
 * Verify a single change.
 */
export async function verifySingleChange(
  change: Change<unknown>,
  options: VerifyOptions = {}
): Promise<{ valid: boolean; issues: IntegrityIssue[] }> {
  const report = await verifyIntegrity([change], options)
  return {
    valid: report.valid === 1,
    issues: report.issues
  }
}

// ─── Chain Integrity ──────────────────────────────────────────────────────────

/**
 * Find orphaned changes (changes whose parents are missing).
 */
export function findOrphans(changes: Change<unknown>[]): Change<unknown>[] {
  const hashSet = new Set(changes.map((c) => c.hash))
  return changes.filter((c) => c.parentHash !== null && !hashSet.has(c.parentHash))
}

/**
 * Find root changes (changes with no parent).
 */
export function findRoots(changes: Change<unknown>[]): Change<unknown>[] {
  return changes.filter((c) => c.parentHash === null)
}

/**
 * Find head changes (changes that are not parents of any other change).
 */
export function findHeads(changes: Change<unknown>[]): Change<unknown>[] {
  const parentHashes = new Set(
    changes.filter((c) => c.parentHash !== null).map((c) => c.parentHash)
  )
  return changes.filter((c) => !parentHashes.has(c.hash))
}

/**
 * Get the chain depth (longest path from any root to any head).
 */
export function getChainDepth(changes: Change<unknown>[]): number {
  if (changes.length === 0) return 0

  const childMap = new Map<string | null, Change<unknown>[]>()
  for (const change of changes) {
    const children = childMap.get(change.parentHash) ?? []
    children.push(change)
    childMap.set(change.parentHash, children)
  }

  function getDepth(parentHash: string | null): number {
    const children = childMap.get(parentHash) ?? []
    if (children.length === 0) return 0
    return 1 + Math.max(...children.map((c) => getDepth(c.hash)))
  }

  return getDepth(null)
}

// ─── Repair Helpers ───────────────────────────────────────────────────────────

/**
 * Options controlling {@link attemptRepair}.
 */
export interface RepairOptions {
  /**
   * Allow the `recompute-hash` repair, which **overwrites** a change's stored
   * hash with a freshly computed one. On tampered data this silently reconciles
   * the tampered payload to a consistent hash (laundering it) rather than
   * rejecting it, so it is refused unless the caller explicitly asserts the
   * changes come from a trusted source (e.g. local self-repair, never untrusted
   * peer input) — exploration 0307. Default: `false`.
   */
  trustHashRecompute?: boolean
}

/**
 * Attempt to repair issues that can be fixed automatically.
 * Returns the repaired changes and any issues that couldn't be fixed.
 *
 * SECURITY: `recompute-hash` is gated behind {@link RepairOptions.trustHashRecompute}
 * — do not enable it for changes received from untrusted peers.
 */
export async function attemptRepair(
  changes: Change<unknown>[],
  issues: IntegrityIssue[],
  options: RepairOptions = {}
): Promise<{
  repaired: Change<unknown>[]
  remainingIssues: IntegrityIssue[]
  repairCount: number
}> {
  const changeMap = new Map(changes.map((c) => [c.id, { ...c }]))
  const remainingIssues: IntegrityIssue[] = []
  let repairCount = 0

  for (const issue of issues) {
    if (!issue.repairAction?.automatic) {
      remainingIssues.push(issue)
      continue
    }

    const change = changeMap.get(issue.changeId)
    if (!change) {
      remainingIssues.push(issue)
      continue
    }

    switch (issue.repairAction.type) {
      case 'recompute-hash':
        // Overwriting the hash launders tampered payloads — only do it when the
        // caller vouches for the source (exploration 0307).
        if (!options.trustHashRecompute) {
          remainingIssues.push(issue)
          break
        }
        change.hash = await computeChangeHash(change)
        repairCount++
        break

      case 'mark-orphan':
        // Nothing to do here - just marking
        repairCount++
        break

      default:
        // Can't repair automatically
        remainingIssues.push(issue)
    }
  }

  return {
    repaired: Array.from(changeMap.values()),
    remainingIssues,
    repairCount
  }
}

/**
 * Generate a human-readable integrity report.
 */
export function formatIntegrityReport(report: IntegrityReport): string {
  const lines: string[] = []

  lines.push(`Integrity Report`)
  lines.push(`================`)
  lines.push(`Checked: ${report.checked} changes`)
  lines.push(`Valid: ${report.valid} (${Math.round((report.valid / report.checked) * 100)}%)`)
  lines.push(`Duration: ${report.durationMs}ms`)
  lines.push('')

  if (report.issues.length === 0) {
    lines.push('No issues found.')
  } else {
    lines.push(
      `Issues: ${report.issues.length} (${report.summary.errors} errors, ${report.summary.warnings} warnings)`
    )
    lines.push('')

    // Group by type
    for (const [type, count] of Object.entries(report.summary.byType)) {
      if (count > 0) {
        lines.push(`  ${type}: ${count}`)
      }
    }

    lines.push('')
    lines.push(`Repairable: ${report.repairable ? 'Yes' : 'No'}`)
  }

  return lines.join('\n')
}
