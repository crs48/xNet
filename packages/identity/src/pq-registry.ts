/**
 * Post-quantum key registry.
 *
 * Stores and retrieves PQ key attestations, associating DIDs with their
 * ML-DSA public keys for Level 1/2 signature verification.
 */

import type { PQKeyAttestation } from './pq-attestation'
import { verifyPQKeyAttestation } from './pq-attestation'

// ─── Registry Interface ──────────────────────────────────────────

/**
 * Interface for storing and retrieving PQ key associations.
 *
 * Implementations can use in-memory storage, IndexedDB, or remote services.
 */
export interface PQKeyRegistry {
  /**
   * Store a PQ key attestation.
   * Verifies the attestation before storing.
   * @throws If attestation is invalid
   */
  store(attestation: PQKeyAttestation): Promise<void>

  /**
   * Lookup PQ public key for a DID.
   * Returns null if no attestation exists.
   */
  lookup(did: string): Promise<Uint8Array | null>

  /**
   * Get the full attestation for a DID.
   * Useful for re-verification or inspection.
   */
  getAttestation(did: string): Promise<PQKeyAttestation | null>

  /**
   * Remove an attestation for a DID.
   */
  remove(did: string): Promise<void>

  /**
   * Check if a DID has a registered PQ key.
   */
  has(did: string): Promise<boolean>

  /**
   * Get all registered DIDs.
   */
  list(): Promise<string[]>

  /**
   * Subscribe to registry updates.
   * Returns unsubscribe function.
   */
  subscribe(callback: (did: string, pqPublicKey: Uint8Array | null) => void): () => void

  /**
   * Clear all attestations (useful for testing).
   */
  clear(): Promise<void>
}

// ─── In-Memory Implementation ────────────────────────────────────

/**
 * In-memory PQ key registry.
 * Useful for short-lived sessions and testing.
 */
export class MemoryPQKeyRegistry implements PQKeyRegistry {
  private attestations = new Map<string, PQKeyAttestation>()
  private listeners = new Set<(did: string, key: Uint8Array | null) => void>()

  async store(attestation: PQKeyAttestation): Promise<void> {
    // Verify before storing
    const result = verifyPQKeyAttestation(attestation)
    if (!result.valid) {
      throw new Error(`Invalid attestation: ${result.errors.join(', ')}`)
    }

    this.attestations.set(attestation.did, attestation)
    this.notify(attestation.did, attestation.pqPublicKey)
  }

  async lookup(did: string): Promise<Uint8Array | null> {
    const attestation = this.attestations.get(did)
    if (!attestation) return null

    // Check expiration on lookup
    if (attestation.expiresAt && Date.now() > attestation.expiresAt) {
      this.attestations.delete(did)
      this.notify(did, null)
      return null
    }

    return attestation.pqPublicKey
  }

  async getAttestation(did: string): Promise<PQKeyAttestation | null> {
    return this.attestations.get(did) ?? null
  }

  async remove(did: string): Promise<void> {
    this.attestations.delete(did)
    this.notify(did, null)
  }

  async has(did: string): Promise<boolean> {
    return this.attestations.has(did)
  }

  async list(): Promise<string[]> {
    return Array.from(this.attestations.keys())
  }

  subscribe(callback: (did: string, key: Uint8Array | null) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  async clear(): Promise<void> {
    this.attestations.clear()
  }

  private notify(did: string, key: Uint8Array | null): void {
    for (const listener of this.listeners) {
      try {
        listener(did, key)
      } catch {
        // Ignore listener errors
      }
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────

/**
 * Create a PQ key registry appropriate for the current environment.
 *
 * Currently returns an in-memory registry. In the future, this could
 * return an IndexedDB-backed registry for browser environments.
 */
export function createPQKeyRegistry(): PQKeyRegistry {
  return new MemoryPQKeyRegistry()
}
