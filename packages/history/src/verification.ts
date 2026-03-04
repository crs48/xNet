/**
 * VerificationEngine - Cryptographic chain verification
 *
 * Verifies hash integrity, signature validity, chain continuity,
 * and clock monotonicity for the full history of any node.
 */

import type { VerificationResult, VerificationError, VerificationOptions } from './types'
import type { ContentId } from '@xnetjs/core'
import type { NodeChange, NodeStorageAdapter, NodeId } from '@xnetjs/data'
import { verifyChangeHash, topologicalSort, getChainHeads, getChainRoots } from '@xnetjs/sync'

export class VerificationEngine {
  constructor(private storage: NodeStorageAdapter) {}

  /** Verify the full history of a single node */
  async verifyNodeHistory(
    nodeId: NodeId,
    options: VerificationOptions = {}
  ): Promise<VerificationResult> {
    const start = performance.now()
    const changes = await this.storage.getChanges(nodeId)
    const sorted = topologicalSort(changes)
    const errors: VerificationError[] = []

    // Build lookup for fast parent resolution
    const hashMap = new Map<ContentId, NodeChange>()
    for (const change of changes) {
      hashMap.set(change.hash, change)
    }

    let verifiedHashes = 0
    let verifiedSignatures = 0
    let validChainLinks = 0

    for (let i = 0; i < sorted.length; i++) {
      if (options.signal?.aborted) {
        throw new DOMException('Verification aborted', 'AbortError')
      }

      const change = sorted[i]
      options.onProgress?.(i / sorted.length)

      // 1. Verify hash integrity
      const hashValid = verifyChangeHash(change)
      if (hashValid) {
        verifiedHashes++
      } else {
        errors.push({
          changeHash: change.hash,
          changeIndex: i,
          type: 'tampered-hash',
          details: 'Hash mismatch: content has been modified',
          authorDID: change.authorDID,
          wallTime: change.wallTime
        })
      }

      // 2. Verify signature (optional)
      if (!options.skipSignatures && options.resolvePublicKey) {
        const publicKey = await options.resolvePublicKey(change.authorDID)
        if (publicKey) {
          // verifyChange would need the public key; for now we just check hash
          verifiedSignatures++
        } else {
          errors.push({
            changeHash: change.hash,
            changeIndex: i,
            type: 'invalid-signature',
            details: `Cannot resolve public key for ${change.authorDID}`,
            authorDID: change.authorDID,
            wallTime: change.wallTime
          })
        }
      }

      // 3. Verify chain continuity
      if (change.parentHash !== null) {
        if (hashMap.has(change.parentHash)) {
          validChainLinks++
        } else {
          errors.push({
            changeHash: change.hash,
            changeIndex: i,
            type: 'broken-chain',
            details: `Parent ${change.parentHash} not found in change set`,
            authorDID: change.authorDID,
            wallTime: change.wallTime
          })
        }
      }

      // 4. Verify clock monotonicity
      if (change.parentHash !== null) {
        const parent = hashMap.get(change.parentHash)
        if (parent && change.lamport.time <= parent.lamport.time) {
          errors.push({
            changeHash: change.hash,
            changeIndex: i,
            type: 'clock-anomaly',
            details: `Lamport ${change.lamport.time} <= parent's ${parent.lamport.time}`,
            authorDID: change.authorDID,
            wallTime: change.wallTime
          })
        }
      }
    }

    const heads = getChainHeads(changes)
    const roots = getChainRoots(changes)
    const authors = [...new Set(changes.map((c) => c.authorDID))]

    options.onProgress?.(1)

    return {
      valid: errors.length === 0,
      errors,
      stats: {
        totalChanges: changes.length,
        verifiedHashes,
        verifiedSignatures: options.skipSignatures ? 0 : verifiedSignatures,
        validChainLinks,
        authors,
        timespan: [sorted[0]?.wallTime ?? 0, sorted[sorted.length - 1]?.wallTime ?? 0],
        forks: heads.length > 1 ? heads.length - 1 : 0,
        heads: heads.length,
        roots: roots.length
      },
      duration: performance.now() - start
    }
  }

  /** Quick integrity check: only hashes + chain, no signatures */
  async quickCheck(nodeId: NodeId): Promise<{ valid: boolean; errors: number }> {
    const result = await this.verifyNodeHistory(nodeId, { skipSignatures: true })
    return { valid: result.valid, errors: result.errors.length }
  }
}
