/**
 * V3 Serializer - Multi-level cryptography format with hybrid signatures.
 *
 * Protocol v3 extends v2 with:
 * - Multi-level signature support (Level 0, 1, 2)
 * - Unified signature format { l, e?, p? }
 * - Post-quantum ready from day one
 *
 * Wire format (JSON, abbreviated):
 * {
 *   v: 3,                          // protocolVersion
 *   i: string,                     // id
 *   t: string,                     // type
 *   p: { ..., _sv?: string },      // payload with optional schema version
 *   h: string,                     // hash
 *   ph: string | null,             // parentHash
 *   a: string,                     // authorDID
 *   sig: {                         // multi-level signature
 *     l: 0|1|2,                    // security level
 *     e?: string,                  // Ed25519 signature (base64)
 *     p?: string                   // ML-DSA signature (base64)
 *   },
 *   w: number,                     // wallTime
 *   l: { t: number, a: string },   // lamport { time, author }
 *   bi?: string,                   // batchId
 *   bx?: number,                   // batchIndex
 *   bs?: number                    // batchSize
 * }
 */

import type { Change } from '../change'
import type { ChangeSerializer, DeserializeOutcome, SerializedChange } from './types'
import {
  encodeSignature,
  decodeSignature,
  type SignatureWire,
  type UnifiedSignature,
  type SecurityLevel
} from '@xnet/crypto'

// ─── V3 Wire Format Types ────────────────────────────────────────

/**
 * V3 wire format with multi-level signature support.
 */
export interface V3WireFormat {
  /** Protocol version (always 3) */
  v: 3

  /** Change ID */
  i: string

  /** Change type */
  t: string

  /** Payload (may include _sv for schema version) */
  p: unknown

  /** Content hash (BLAKE3) */
  h: string

  /** Parent hash (null for first change) */
  ph: string | null

  /** Author DID */
  a: string

  /**
   * Multi-level signature.
   * - l: security level (0, 1, or 2)
   * - e: Ed25519 signature (base64) - present at Level 0 and 1
   * - p: ML-DSA signature (base64) - present at Level 1 and 2
   */
  sig: SignatureWire

  /** Wall clock time (ms since epoch) */
  w: number

  /** Lamport timestamp { time, author } */
  l: { t: number; a: string }

  /** Batch ID for grouped changes (optional) */
  bi?: string

  /** Batch index (optional) */
  bx?: number

  /** Batch size (optional) */
  bs?: number
}

/**
 * Payload with optional schema version marker.
 */
interface PayloadWithSchemaVersion {
  _sv?: string
  [key: string]: unknown
}

// ─── Helper Functions ────────────────────────────────────────────

/**
 * Check if a value is a valid UnifiedSignature.
 */
function isUnifiedSignature(sig: unknown): sig is UnifiedSignature {
  if (!sig || typeof sig !== 'object') return false
  const s = sig as Record<string, unknown>
  if (typeof s.level !== 'number') return false
  if (s.level < 0 || s.level > 2) return false
  return true
}

/**
 * Convert legacy Uint8Array signature to UnifiedSignature.
 * Used for backward compatibility during migration.
 */
function legacyToUnifiedSignature(sig: Uint8Array): UnifiedSignature {
  return {
    level: 0,
    ed25519: sig
  }
}

// ─── V3 Serializer Implementation ────────────────────────────────

/**
 * V3 Serializer with multi-level signature support.
 *
 * Key differences from V2:
 * - signature field replaced with sig object containing level and components
 * - Supports Level 0 (Ed25519), Level 1 (Hybrid), Level 2 (ML-DSA)
 * - No backward compatibility with V2 (clean break for prerelease)
 */
export class V3Serializer implements ChangeSerializer {
  readonly version = 3
  readonly name = 'V3 Multi-Level Crypto Serializer'

  serialize<T>(change: Change<T>): SerializedChange {
    // Get signature - could be UnifiedSignature (new) or Uint8Array (legacy)
    let sig: SignatureWire

    if (isUnifiedSignature(change.signature)) {
      sig = encodeSignature(change.signature)
    } else if (change.signature instanceof Uint8Array) {
      // Legacy Ed25519-only signature
      sig = encodeSignature(legacyToUnifiedSignature(change.signature))
    } else {
      throw new Error('Invalid signature type in change')
    }

    const wire: V3WireFormat = {
      v: 3,
      i: change.id,
      t: change.type,
      p: change.payload,
      h: change.hash,
      ph: change.parentHash,
      a: change.authorDID,
      sig,
      w: change.wallTime,
      l: { t: change.lamport.time, a: change.lamport.author }
    }

    // Include batch fields if present
    if (change.batchId !== undefined) {
      wire.bi = change.batchId
      wire.bx = change.batchIndex
      wire.bs = change.batchSize
    }

    return wire as unknown as Record<string, unknown>
  }

  deserialize<T = unknown>(data: SerializedChange): DeserializeOutcome<T> {
    try {
      let wire: V3WireFormat

      if (data instanceof Uint8Array) {
        const json = new TextDecoder().decode(data)
        wire = JSON.parse(json) as V3WireFormat
      } else {
        wire = data as unknown as V3WireFormat
      }

      // Validate version marker
      if (wire.v !== 3) {
        return {
          success: false,
          error: `Expected v3 format, got v${wire.v}. Clear your database and start fresh.`,
          rawData: data
        }
      }

      // Validate required fields
      if (!wire.i || !wire.t || !wire.h || !wire.a || !wire.sig) {
        return {
          success: false,
          error: 'Missing required fields in V3 change',
          rawData: data
        }
      }

      // Validate signature format
      if (typeof wire.sig !== 'object' || typeof wire.sig.l !== 'number') {
        return {
          success: false,
          error: 'Invalid signature format in V3 change',
          rawData: data
        }
      }

      // Validate lamport timestamp
      if (!wire.l || typeof wire.l.t !== 'number' || !wire.l.a) {
        return {
          success: false,
          error: 'Invalid or missing lamport timestamp',
          rawData: data
        }
      }

      // Decode signature
      const signature = decodeSignature(wire.sig)

      // Reconstruct change with full field names
      const change: Change<T> = {
        protocolVersion: 3,
        id: wire.i,
        type: wire.t,
        payload: wire.p as T,
        hash: wire.h as Change<T>['hash'],
        parentHash: wire.ph as Change<T>['parentHash'],
        authorDID: wire.a as Change<T>['authorDID'],
        signature: signature as unknown as Uint8Array, // Type cast for compatibility
        wallTime: wire.w,
        lamport: {
          time: wire.l.t,
          author: wire.l.a as Change<T>['lamport']['author']
        }
      }

      // Include batch fields if present
      if (wire.bi !== undefined) {
        change.batchId = wire.bi
        change.batchIndex = wire.bx
        change.batchSize = wire.bs
      }

      return { success: true, change }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        rawData: data
      }
    }
  }

  canDeserialize(data: unknown): boolean {
    if (!data || typeof data !== 'object') {
      return false
    }

    const obj = data as Record<string, unknown>

    // V3 format: has v=3 marker and sig object
    return (
      obj.v === 3 &&
      typeof obj.i === 'string' &&
      typeof obj.t === 'string' &&
      typeof obj.sig === 'object' &&
      obj.sig !== null
    )
  }

  /**
   * Add schema version to a payload.
   */
  static addSchemaVersion<T extends Record<string, unknown>>(
    payload: T,
    schemaVersion: string
  ): T & { _sv: string } {
    return { ...payload, _sv: schemaVersion }
  }

  /**
   * Extract schema version from a payload.
   */
  static getSchemaVersion(payload: unknown): string | undefined {
    if (payload && typeof payload === 'object') {
      const p = payload as PayloadWithSchemaVersion
      return p._sv
    }
    return undefined
  }

  /**
   * Get the security level of a serialized change.
   */
  static getSecurityLevel(wire: V3WireFormat): SecurityLevel {
    return wire.sig.l
  }
}

/**
 * Default V3 serializer instance.
 */
export const v3Serializer = new V3Serializer()
