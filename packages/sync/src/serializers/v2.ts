/**
 * V2 Serializer - Enhanced change format with schema versioning.
 *
 * Protocol v2 extends v1 with:
 * - Required protocolVersion field (always 2)
 * - Schema version in payload (_sv field)
 * - Abbreviated field names for compact transmission
 * - Support for binary payload compression (future)
 *
 * Wire format (JSON, abbreviated):
 * {
 *   v: 2,                        // protocolVersion
 *   i: string,                   // id
 *   t: string,                   // type
 *   p: { ..., _sv?: string },    // payload with optional schema version
 *   h: string,                   // hash
 *   ph: string | null,           // parentHash
 *   a: string,                   // authorDID
 *   s: string,                   // signature (base64)
 *   w: number,                   // wallTime
 *   l: { t: number, a: string }, // lamport { time, author }
 *   bi?: string,                 // batchId
 *   bx?: number,                 // batchIndex
 *   bs?: number                  // batchSize
 * }
 */

import type { Change } from '../change'
import type { ChangeSerializer, DeserializeOutcome, SerializedChange } from './types'

/**
 * Base64 encode a Uint8Array.
 * Uses loop instead of spread to avoid stack overflow on large arrays.
 */
function encodeBase64(data: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = ''
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i])
    }
    return btoa(binary)
  }
  return Buffer.from(data).toString('base64')
}

/**
 * Base64 decode to Uint8Array.
 */
function decodeBase64(str: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(str)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
  return new Uint8Array(Buffer.from(str, 'base64'))
}

/**
 * V2 wire format with abbreviated field names.
 */
interface V2WireFormat {
  v: 2 // Protocol version marker
  i: string // id
  t: string // type
  p: unknown // payload (may include _sv for schema version)
  h: string // hash
  ph: string | null // parentHash
  a: string // authorDID
  s: string // signature (base64)
  w: number // wallTime
  l: { t: number; a: string } // lamport { time, author }
  bi?: string // batchId
  bx?: number // batchIndex
  bs?: number // batchSize
}

/**
 * Payload with optional schema version marker.
 */
interface PayloadWithSchemaVersion {
  _sv?: string // Schema version (e.g., "Task@2.0.0")
  [key: string]: unknown
}

/**
 * V2 Serializer implementation.
 * Uses abbreviated field names for more compact wire format.
 */
export class V2Serializer implements ChangeSerializer {
  readonly version = 2
  readonly name = 'V2 Compact Serializer'

  serialize<T>(change: Change<T>): SerializedChange {
    const wire: V2WireFormat = {
      v: 2,
      i: change.id,
      t: change.type,
      p: change.payload,
      h: change.hash,
      ph: change.parentHash,
      a: change.authorDID,
      s: encodeBase64(change.signature),
      w: change.wallTime,
      l: { t: change.lamport.time, a: change.lamport.author }
    }

    // Include batch fields if present (abbreviated)
    if (change.batchId !== undefined) {
      wire.bi = change.batchId
      wire.bx = change.batchIndex
      wire.bs = change.batchSize
    }

    return wire as unknown as Record<string, unknown>
  }

  deserialize<T = unknown>(data: SerializedChange): DeserializeOutcome<T> {
    try {
      let wire: V2WireFormat

      if (data instanceof Uint8Array) {
        const json = new TextDecoder().decode(data)
        wire = JSON.parse(json) as V2WireFormat
      } else {
        wire = data as unknown as V2WireFormat
      }

      // Validate version marker
      if (wire.v !== 2) {
        return {
          success: false,
          error: `Expected v2 format, got v${wire.v}`,
          rawData: data
        }
      }

      // Validate required fields
      if (!wire.i || !wire.t || !wire.h || !wire.a || !wire.s) {
        return {
          success: false,
          error: 'Missing required fields in V2 change',
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

      // Reconstruct change with full field names
      const change: Change<T> = {
        protocolVersion: 2,
        id: wire.i,
        type: wire.t,
        payload: wire.p as T,
        hash: wire.h as Change<T>['hash'],
        parentHash: wire.ph as Change<T>['parentHash'],
        authorDID: wire.a as Change<T>['authorDID'],
        signature: decodeBase64(wire.s),
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

    // V2 format: has v=2 marker
    return obj.v === 2 && typeof obj.i === 'string' && typeof obj.t === 'string'
  }

  /**
   * Add schema version to a payload.
   * Used when serializing node changes with schema versioning.
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
}

/**
 * Default V2 serializer instance.
 */
export const v2Serializer = new V2Serializer()
