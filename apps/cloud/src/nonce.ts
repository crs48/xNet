/**
 * xNet Cloud — single-use challenge nonces for the device-claim flow (0243, Phase 0).
 *
 * The device-grant flow used to accept a *client-supplied* nonce, which a captured
 * challenge could replay. Instead the server now mints a nonce at `/device/start`,
 * bound to that flow's `deviceCode`, and consumes it exactly once when the claim
 * completes. Combined with the real signature check (`verify-did.ts`), a challenge is
 * (a) provably signed by the DID's key and (b) usable only once, for this one flow.
 *
 * In-memory to start (same stance as the device-grant store); a durable adapter over
 * the `DocStore` port is provided for production (Firestore) so nonces survive a
 * control-plane restart mid-claim.
 */
import type { DocStore } from './stores/durable'
import { randomBytes } from 'node:crypto'

export interface NonceRecord {
  /** Opaque, single-use value the app signs. */
  nonce: string
  /** The device flow this nonce is bound to (must match at consume time). */
  deviceCode: string
  createdAtMs: number
}

/** How long an unconsumed nonce stays valid (5 minutes). */
export const NONCE_TTL_MS = 5 * 60 * 1000

export interface NonceStore {
  /** Mint a fresh nonce bound to `deviceCode`. */
  issue(deviceCode: string, nowMs: number): Promise<NonceRecord>
  /**
   * Atomically read-and-delete a nonce. Returns the record if it exists and is
   * within TTL, else null. A consumed (or expired) nonce never verifies again.
   */
  consume(nonce: string, nowMs: number): Promise<NonceRecord | null>
}

function freshNonce(): string {
  return randomBytes(32).toString('base64url')
}

export class MemoryNonceStore implements NonceStore {
  private readonly byNonce = new Map<string, NonceRecord>()

  async issue(deviceCode: string, nowMs: number): Promise<NonceRecord> {
    const record: NonceRecord = { nonce: freshNonce(), deviceCode, createdAtMs: nowMs }
    this.byNonce.set(record.nonce, record)
    return { ...record }
  }

  async consume(nonce: string, nowMs: number): Promise<NonceRecord | null> {
    const record = this.byNonce.get(nonce)
    if (!record) return null
    this.byNonce.delete(nonce) // single-use, even if expired
    if (nowMs - record.createdAtMs > NONCE_TTL_MS) return null
    return record
  }
}

/** Durable nonce store over a `DocStore` (Firestore in production). */
export function nonceStoreFromDocs(docs: DocStore<NonceRecord>): NonceStore {
  return {
    async issue(deviceCode, nowMs) {
      const record: NonceRecord = { nonce: freshNonce(), deviceCode, createdAtMs: nowMs }
      await docs.put(record.nonce, record)
      return record
    },
    async consume(nonce, nowMs) {
      const record = await docs.get(nonce)
      if (!record) return null
      await docs.delete(nonce) // single-use, even if expired
      if (nowMs - record.createdAtMs > NONCE_TTL_MS) return null
      return record
    }
  }
}
