/**
 * Update verification types and interfaces
 */
import type { SignedUpdate, VectorClock, Fork, ChainStatus } from './updates'
import { isValidProgression } from './updates'

/**
 * Interface for verifying signed updates
 */
export interface UpdateVerifier {
  /** Verify update signature and chain linkage */
  verify(update: SignedUpdate, publicKey: Uint8Array): Promise<boolean>

  /** Detect forks in update chain */
  detectFork(updates: SignedUpdate[]): Fork | null

  /** Check vector clock progression */
  isValidProgression(prev: VectorClock, next: VectorClock, authorId: string): boolean
}

/**
 * Detect forks in an update chain
 * A fork occurs when two updates have the same parent
 */
export function detectFork(updates: SignedUpdate[]): Fork | null {
  const byParent = new Map<string, SignedUpdate[]>()

  for (const update of updates) {
    const existing = byParent.get(update.parentHash) || []
    existing.push(update)
    byParent.set(update.parentHash, existing)
  }

  // Find a parent with multiple children (fork point)
  for (const [parentHash, children] of byParent) {
    if (children.length > 1) {
      // Build the branches from this fork point
      const branch1 = buildBranch(children[0], updates)
      const branch2 = buildBranch(children[1], updates)
      return {
        commonAncestor: parentHash,
        branch1,
        branch2
      }
    }
  }

  return null
}

/**
 * Build a branch of updates starting from a given update
 */
function buildBranch(start: SignedUpdate, allUpdates: SignedUpdate[]): SignedUpdate[] {
  const branch: SignedUpdate[] = [start]
  const byParent = new Map<string, SignedUpdate>()

  for (const update of allUpdates) {
    byParent.set(update.parentHash, update)
  }

  let current = start
  while (true) {
    const next = byParent.get(current.updateHash)
    if (!next) break
    branch.push(next)
    current = next
  }

  return branch
}

/**
 * Verify an update chain
 */
export async function verifyUpdateChain(
  updates: SignedUpdate[],
  getPublicKey: (did: string) => Promise<Uint8Array>,
  verifySignature: (data: Uint8Array, signature: Uint8Array, publicKey: Uint8Array) => boolean
): Promise<ChainStatus> {
  const errors: string[] = []
  const forks: Fork[] = []

  // Sort updates by their logical order
  const sorted = [...updates].sort((a, b) => a.timestamp - b.timestamp)

  // Check for forks
  const fork = detectFork(sorted)
  if (fork) {
    forks.push(fork)
    errors.push(`Fork detected at ${fork.commonAncestor}`)
  }

  // Verify each update
  for (let i = 0; i < sorted.length; i++) {
    const update = sorted[i]

    // Get author's public key
    let publicKey: Uint8Array
    try {
      publicKey = await getPublicKey(update.authorDID)
    } catch {
      errors.push(`Failed to get public key for ${update.authorDID}`)
      continue
    }

    // Verify signature
    const signatureData = new Uint8Array([
      ...update.update,
      ...new TextEncoder().encode(update.parentHash),
      ...new TextEncoder().encode(update.authorDID),
      ...new TextEncoder().encode(update.timestamp.toString())
    ])

    if (!verifySignature(signatureData, update.signature, publicKey)) {
      errors.push(`Invalid signature for update ${update.updateHash}`)
    }

    // Verify vector clock progression (except for first update)
    if (i > 0) {
      const prev = sorted[i - 1]
      if (update.parentHash === prev.updateHash) {
        if (!isValidProgression(prev.vectorClock, update.vectorClock, update.authorDID)) {
          errors.push(`Invalid vector clock progression at ${update.updateHash}`)
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    forks
  }
}
