/**
 * V1 Serializer - Original change format.
 *
 * Protocol v1 uses JSON encoding with the following characteristics:
 * - protocolVersion field may be missing (legacy) or 1
 * - Signature is base64 encoded
 * - All fields use full names (no abbreviations)
 *
 * Wire format (JSON):
 * {
 *   protocolVersion?: 1,
 *   id: string,
 *   type: string,
 *   payload: T,
 *   hash: string,
 *   parentHash: string | null,
 *   authorDID: string,
 *   signature: string (base64),
 *   wallTime: number,
 *   lamport: { time: number, did: string },
 *   batchId?: string,
 *   batchIndex?: number,
 *   batchSize?: number
 * }
 */

import type { Change } from '../change'
import type { ChangeSerializer, DeserializeOutcome, SerializedChange } from './types'

/**
 * Base64 encode a Uint8Array.
 * Uses loop instead of spread to avoid stack overflow on large arrays.
 */
function encodeBase64(data: Uint8Array): string {
  // Browser-compatible base64 encoding
  if (typeof btoa === 'function') {
    let binary = ''
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i])
    }
    return btoa(binary)
  }
  // Node.js fallback
  return Buffer.from(data).toString('base64')
}

/**
 * Base64 decode to Uint8Array.
 */
function decodeBase64(str: string): Uint8Array {
  // Browser-compatible base64 decoding
  if (typeof atob === 'function') {
    const binary = atob(str)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
  // Node.js fallback
  return new Uint8Array(Buffer.from(str, 'base64'))
}

/**
 * V1 wire format for a change.
 */
interface V1WireFormat {
  protocolVersion?: number
  id: string
  type: string
  payload: unknown
  hash: string
  parentHash: string | null
  authorDID: string
  signature: string // base64
  wallTime: number
  lamport: { time: number; author: string }
  batchId?: string
  batchIndex?: number
  batchSize?: number
}

/**
 * V1 Serializer implementation.
 */
export class V1Serializer implements ChangeSerializer {
  readonly version = 1
  readonly name = 'V1 JSON Serializer'

  serialize<T>(change: Change<T>): SerializedChange {
    const wire: V1WireFormat = {
      id: change.id,
      type: change.type,
      payload: change.payload,
      hash: change.hash,
      parentHash: change.parentHash,
      authorDID: change.authorDID,
      signature: encodeBase64(change.signature),
      wallTime: change.wallTime,
      lamport: { time: change.lamport.time, author: change.lamport.author }
    }

    // Include protocolVersion if present (may be undefined for legacy)
    if (change.protocolVersion !== undefined) {
      wire.protocolVersion = change.protocolVersion
    }

    // Include batch fields if present
    if (change.batchId !== undefined) {
      wire.batchId = change.batchId
      wire.batchIndex = change.batchIndex
      wire.batchSize = change.batchSize
    }

    return wire as unknown as Record<string, unknown>
  }

  deserialize<T = unknown>(data: SerializedChange): DeserializeOutcome<T> {
    try {
      // Handle both binary (Uint8Array) and JSON object
      let wire: V1WireFormat

      if (data instanceof Uint8Array) {
        const json = new TextDecoder().decode(data)
        wire = JSON.parse(json) as V1WireFormat
      } else {
        wire = data as unknown as V1WireFormat
      }

      // Validate required fields
      if (!wire.id || !wire.type || !wire.hash || !wire.authorDID || !wire.signature) {
        return {
          success: false,
          error: 'Missing required fields in V1 change',
          rawData: data
        }
      }

      // Validate lamport timestamp
      if (!wire.lamport || typeof wire.lamport.time !== 'number' || !wire.lamport.author) {
        return {
          success: false,
          error: 'Invalid or missing lamport timestamp',
          rawData: data
        }
      }

      // Reconstruct change
      const change: Change<T> = {
        id: wire.id,
        type: wire.type,
        payload: wire.payload as T,
        hash: wire.hash as Change<T>['hash'],
        parentHash: wire.parentHash as Change<T>['parentHash'],
        authorDID: wire.authorDID as Change<T>['authorDID'],
        signature: decodeBase64(wire.signature),
        wallTime: wire.wallTime,
        lamport: {
          time: wire.lamport.time,
          author: wire.lamport.author as Change<T>['lamport']['author']
        }
      }

      // Include protocolVersion if present
      if (wire.protocolVersion !== undefined) {
        change.protocolVersion = wire.protocolVersion
      }

      // Include batch fields if present
      if (wire.batchId !== undefined) {
        change.batchId = wire.batchId
        change.batchIndex = wire.batchIndex
        change.batchSize = wire.batchSize
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

    // V1 format: has id, type, hash, signature as strings
    // protocolVersion is undefined or 1
    if (obj.protocolVersion !== undefined && obj.protocolVersion !== 1) {
      return false
    }

    return (
      typeof obj.id === 'string' &&
      typeof obj.type === 'string' &&
      typeof obj.hash === 'string' &&
      typeof obj.signature === 'string'
    )
  }
}

/**
 * Default V1 serializer instance.
 */
export const v1Serializer = new V1Serializer()
