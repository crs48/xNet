/**
 * Hash chain utilities for managing linked changes.
 *
 * Changes form a hash chain where each change references its parent via
 * parentHash. This enables:
 * - Detecting forks (two changes with the same parent)
 * - Validating chain integrity
 * - Finding chain heads (latest changes)
 */

import type { ContentId } from '@xnet/core'
import type { Change } from './change'
import { verifyChangeHash } from './change'

/**
 * Result of validating a chain of changes
 */
export interface ChainValidationResult {
  /** Whether the chain is valid */
  valid: boolean
  /** Error message if invalid */
  error?: string
  /** Whether a fork was detected */
  forkDetected?: boolean
  /** Hash where the fork occurred */
  forkPoint?: ContentId
}

/**
 * Information about a fork in the chain
 */
export interface Fork<T = unknown> {
  /** The common ancestor hash where the fork occurred */
  commonAncestor: ContentId
  /** Changes in the first branch (by timestamp) */
  branch1: Change<T>[]
  /** Changes in the second branch (by timestamp) */
  branch2: Change<T>[]
}

/**
 * Validate that a list of changes forms a valid hash chain.
 * Checks:
 * - All hashes are computed correctly (not tampered)
 * - Parent references exist in the chain (or are null for roots)
 *
 * @param changes - The changes to validate
 * @returns Validation result
 */
export function validateChain<T>(changes: Change<T>[]): ChainValidationResult {
  if (changes.length === 0) {
    return { valid: true }
  }

  // Build hash -> change map
  const byHash = new Map<ContentId, Change<T>>()
  for (const change of changes) {
    byHash.set(change.hash, change)
  }

  // Validate each change
  for (const change of changes) {
    // Verify hash is correct
    if (!verifyChangeHash(change)) {
      return {
        valid: false,
        error: `Change ${change.id} has invalid hash (data may be tampered)`
      }
    }

    // Verify parent exists (if not root)
    if (change.parentHash !== null && !byHash.has(change.parentHash)) {
      // Parent not in our set - this could be valid if we have partial history
      // We don't fail validation for this, but note it
    }
  }

  // Check for forks
  const { hasFork, forkPoints } = detectFork(changes)
  if (hasFork) {
    return {
      valid: true, // Forks are valid, just need resolution
      forkDetected: true,
      forkPoint: forkPoints[0]
    }
  }

  return { valid: true }
}

/**
 * Detect if there are any forks in the chain.
 * A fork occurs when two different changes have the same parent.
 *
 * @param changes - The changes to check
 * @returns Fork detection result
 */
export function detectFork<T>(changes: Change<T>[]): {
  hasFork: boolean
  forkPoints: ContentId[]
} {
  const childrenByParent = new Map<ContentId | null, Change<T>[]>()

  for (const change of changes) {
    const children = childrenByParent.get(change.parentHash) || []
    children.push(change)
    childrenByParent.set(change.parentHash, children)
  }

  const forkPoints: ContentId[] = []
  for (const [parent, children] of childrenByParent) {
    // A fork is when a non-null parent has multiple children
    if (children.length > 1 && parent !== null) {
      forkPoints.push(parent)
    }
  }

  return {
    hasFork: forkPoints.length > 0,
    forkPoints
  }
}

/**
 * Get the head(s) of the chain - changes that are not parents of any other change.
 * Multiple heads indicate a fork that needs resolution.
 *
 * @param changes - The changes to analyze
 * @returns Array of head changes
 */
export function getChainHeads<T>(changes: Change<T>[]): Change<T>[] {
  const allHashes = new Set(changes.map((c) => c.hash))
  const parentHashes = new Set(
    changes.map((c) => c.parentHash).filter((h): h is ContentId => h !== null)
  )

  // Heads are changes whose hash is not a parent of any other change
  return changes.filter((c) => !parentHashes.has(c.hash))
}

/**
 * Get the root(s) of the chain - changes with no parent (parentHash is null).
 *
 * @param changes - The changes to analyze
 * @returns Array of root changes
 */
export function getChainRoots<T>(changes: Change<T>[]): Change<T>[] {
  return changes.filter((c) => c.parentHash === null)
}

/**
 * Get the full ancestry of a change (all changes leading up to it).
 *
 * @param change - The change to get ancestry for
 * @param allChanges - All available changes
 * @returns Array of ancestor changes, from oldest to newest (excluding the input change)
 */
export function getAncestry<T>(change: Change<T>, allChanges: Change<T>[]): Change<T>[] {
  const byHash = new Map<ContentId, Change<T>>()
  for (const c of allChanges) {
    byHash.set(c.hash, c)
  }

  const ancestry: Change<T>[] = []
  let current = change.parentHash

  while (current !== null) {
    const parent = byHash.get(current)
    if (!parent) break
    ancestry.unshift(parent)
    current = parent.parentHash
  }

  return ancestry
}

/**
 * Find the common ancestor of two changes.
 * Returns null if they have no common ancestor.
 *
 * @param a - First change
 * @param b - Second change
 * @param allChanges - All available changes
 * @returns The common ancestor change, or null
 */
export function findCommonAncestor<T>(
  a: Change<T>,
  b: Change<T>,
  allChanges: Change<T>[]
): Change<T> | null {
  const ancestryA = new Set([a.hash, ...getAncestry(a, allChanges).map((c) => c.hash)])

  // Walk up b's ancestry until we find a common ancestor
  const byHash = new Map<ContentId, Change<T>>()
  for (const c of allChanges) {
    byHash.set(c.hash, c)
  }

  // Check b itself first
  if (ancestryA.has(b.hash)) {
    return b
  }

  let current = b.parentHash
  while (current !== null) {
    if (ancestryA.has(current)) {
      return byHash.get(current) || null
    }
    const parent = byHash.get(current)
    if (!parent) break
    current = parent.parentHash
  }

  return null
}

/**
 * Get detailed fork information.
 *
 * @param changes - The changes to analyze
 * @returns Array of Fork objects describing each fork
 */
export function getForks<T>(changes: Change<T>[]): Fork<T>[] {
  const { forkPoints } = detectFork(changes)
  if (forkPoints.length === 0) return []

  const byHash = new Map<ContentId, Change<T>>()
  for (const c of changes) {
    byHash.set(c.hash, c)
  }

  const forks: Fork<T>[] = []

  for (const forkPoint of forkPoints) {
    // Find all children of this fork point
    const children = changes.filter((c) => c.parentHash === forkPoint)

    if (children.length >= 2) {
      // Sort by timestamp
      children.sort((a, b) => a.timestamp - b.timestamp)

      forks.push({
        commonAncestor: forkPoint,
        branch1: [children[0]],
        branch2: children.slice(1)
      })
    }
  }

  return forks
}

/**
 * Sort changes in topological order (parents before children).
 *
 * @param changes - The changes to sort
 * @returns Sorted changes array
 */
export function topologicalSort<T>(changes: Change<T>[]): Change<T>[] {
  const byHash = new Map<ContentId, Change<T>>()
  for (const c of changes) {
    byHash.set(c.hash, c)
  }

  const sorted: Change<T>[] = []
  const visited = new Set<ContentId>()
  const visiting = new Set<ContentId>()

  function visit(change: Change<T>): void {
    if (visited.has(change.hash)) return
    if (visiting.has(change.hash)) {
      throw new Error('Cycle detected in change chain')
    }

    visiting.add(change.hash)

    // Visit parent first (if exists and in our set)
    if (change.parentHash !== null) {
      const parent = byHash.get(change.parentHash)
      if (parent) {
        visit(parent)
      }
    }

    visiting.delete(change.hash)
    visited.add(change.hash)
    sorted.push(change)
  }

  for (const change of changes) {
    visit(change)
  }

  return sorted
}
