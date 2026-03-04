/**
 * Binary Serialization for NodeState
 *
 * Provides efficient binary encoding for NodeState objects when transferring
 * between main thread and worker via postMessage. This is more efficient than
 * JSON for large datasets with typed arrays.
 *
 * Format:
 * - Uses TextEncoder/TextDecoder for strings
 * - Preserves Uint8Array as-is (transferable)
 * - Compacts property timestamps
 *
 * Note: This is an optimization for large transfers. For small payloads,
 * structured clone (default postMessage behavior) may be faster.
 */

import type { DID } from '@xnetjs/core'
import type { NodeState, PropertyTimestamp, SchemaIRI } from '@xnetjs/data'

// ─── Constants ───────────────────────────────────────────────────────────────

// Type tags for values
const TAG_NULL = 0
const TAG_UNDEFINED = 1
const TAG_BOOLEAN_FALSE = 2
const TAG_BOOLEAN_TRUE = 3
const TAG_NUMBER = 4
const TAG_STRING = 5
const TAG_UINT8ARRAY = 6
const TAG_ARRAY = 7
const TAG_OBJECT = 8
const TAG_BIGINT = 9

// ─── Encoder ─────────────────────────────────────────────────────────────────

/**
 * Binary encoder for NodeState arrays.
 *
 * Encodes an array of NodeState objects to a single Uint8Array.
 * The result can be transferred via postMessage as a Transferable.
 */
export class NodeStateEncoder {
  private chunks: Uint8Array[] = []
  private textEncoder = new TextEncoder()

  /**
   * Encode an array of NodeState objects.
   */
  encode(states: NodeState[]): Uint8Array {
    this.chunks = []

    // Write count
    this.writeUint32(states.length)

    // Write each state
    for (const state of states) {
      this.writeNodeState(state)
    }

    return this.finish()
  }

  private writeNodeState(state: NodeState): void {
    // id
    this.writeString(state.id)

    // schemaId
    this.writeString(state.schemaId)

    // properties
    this.writeProperties(state.properties)

    // timestamps
    this.writeTimestamps(state.timestamps)

    // deleted flag
    this.writeByte(state.deleted ? 1 : 0)

    // deletedAt (optional)
    if (state.deletedAt) {
      this.writeByte(1)
      this.writeTimestamp(state.deletedAt)
    } else {
      this.writeByte(0)
    }

    // createdAt, createdBy, updatedAt, updatedBy
    this.writeFloat64(state.createdAt)
    this.writeString(state.createdBy)
    this.writeFloat64(state.updatedAt)
    this.writeString(state.updatedBy)

    // documentContent (optional Uint8Array)
    if (state.documentContent) {
      this.writeByte(1)
      this.writeUint8Array(state.documentContent)
    } else {
      this.writeByte(0)
    }

    // _unknown (optional)
    if (state._unknown && Object.keys(state._unknown).length > 0) {
      this.writeByte(1)
      this.writeProperties(state._unknown)
    } else {
      this.writeByte(0)
    }

    // _schemaVersion (optional)
    if (state._schemaVersion) {
      this.writeByte(1)
      this.writeString(state._schemaVersion)
    } else {
      this.writeByte(0)
    }
  }

  private writeProperties(props: Record<string, unknown>): void {
    const keys = Object.keys(props)
    this.writeUint32(keys.length)

    for (const key of keys) {
      this.writeString(key)
      this.writeValue(props[key])
    }
  }

  private writeTimestamps(timestamps: Record<string, PropertyTimestamp>): void {
    const keys = Object.keys(timestamps)
    this.writeUint32(keys.length)

    for (const key of keys) {
      this.writeString(key)
      this.writeTimestamp(timestamps[key])
    }
  }

  private writeTimestamp(ts: PropertyTimestamp): void {
    // LamportTimestamp has time (number) and author (DID)
    this.writeUint32(ts.lamport.time)
    this.writeString(ts.lamport.author)
    this.writeFloat64(ts.wallTime)
  }

  private writeValue(value: unknown): void {
    if (value === null) {
      this.writeByte(TAG_NULL)
    } else if (value === undefined) {
      this.writeByte(TAG_UNDEFINED)
    } else if (typeof value === 'boolean') {
      this.writeByte(value ? TAG_BOOLEAN_TRUE : TAG_BOOLEAN_FALSE)
    } else if (typeof value === 'number') {
      this.writeByte(TAG_NUMBER)
      this.writeFloat64(value)
    } else if (typeof value === 'string') {
      this.writeByte(TAG_STRING)
      this.writeString(value)
    } else if (value instanceof Uint8Array) {
      this.writeByte(TAG_UINT8ARRAY)
      this.writeUint8Array(value)
    } else if (Array.isArray(value)) {
      this.writeByte(TAG_ARRAY)
      this.writeUint32(value.length)
      for (const item of value) {
        this.writeValue(item)
      }
    } else if (typeof value === 'bigint') {
      this.writeByte(TAG_BIGINT)
      this.writeString(value.toString())
    } else if (typeof value === 'object') {
      this.writeByte(TAG_OBJECT)
      const obj = value as Record<string, unknown>
      const keys = Object.keys(obj)
      this.writeUint32(keys.length)
      for (const key of keys) {
        this.writeString(key)
        this.writeValue(obj[key])
      }
    } else {
      // Fallback: encode as JSON string
      this.writeByte(TAG_STRING)
      this.writeString(JSON.stringify(value))
    }
  }

  private writeByte(value: number): void {
    this.chunks.push(new Uint8Array([value]))
  }

  private writeUint32(value: number): void {
    const buf = new ArrayBuffer(4)
    new DataView(buf).setUint32(0, value, true) // little-endian
    this.chunks.push(new Uint8Array(buf))
  }

  private writeFloat64(value: number): void {
    const buf = new ArrayBuffer(8)
    new DataView(buf).setFloat64(0, value, true)
    this.chunks.push(new Uint8Array(buf))
  }

  private writeString(value: string): void {
    const bytes = this.textEncoder.encode(value)
    this.writeUint32(bytes.length)
    this.chunks.push(bytes)
  }

  private writeUint8Array(value: Uint8Array): void {
    this.writeUint32(value.length)
    this.chunks.push(value)
  }

  private finish(): Uint8Array {
    // Calculate total size
    let totalSize = 0
    for (const chunk of this.chunks) {
      totalSize += chunk.length
    }

    // Combine chunks
    const result = new Uint8Array(totalSize)
    let offset = 0
    for (const chunk of this.chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }

    return result
  }
}

// ─── Decoder ─────────────────────────────────────────────────────────────────

/**
 * Binary decoder for NodeState arrays.
 */
export class NodeStateDecoder {
  private data: Uint8Array
  private view: DataView
  private offset: number = 0
  private textDecoder = new TextDecoder()

  constructor(data: Uint8Array) {
    this.data = data
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  }

  /**
   * Decode a Uint8Array back to an array of NodeState objects.
   */
  decode(): NodeState[] {
    const count = this.readUint32()
    const states: NodeState[] = []

    for (let i = 0; i < count; i++) {
      states.push(this.readNodeState())
    }

    return states
  }

  private readNodeState(): NodeState {
    const id = this.readString()
    const schemaId = this.readString()
    const properties = this.readProperties()
    const timestamps = this.readTimestamps()
    const deleted = this.readByte() === 1

    const hasDeletedAt = this.readByte() === 1
    const deletedAt = hasDeletedAt ? this.readTimestamp() : undefined

    const createdAt = this.readFloat64()
    const createdBy = this.readString()
    const updatedAt = this.readFloat64()
    const updatedBy = this.readString()

    const hasDocumentContent = this.readByte() === 1
    const documentContent = hasDocumentContent ? this.readUint8Array() : undefined

    const hasUnknown = this.readByte() === 1
    const _unknown = hasUnknown ? this.readProperties() : undefined

    const hasSchemaVersion = this.readByte() === 1
    const _schemaVersion = hasSchemaVersion ? this.readString() : undefined

    const state: NodeState = {
      id,
      schemaId: schemaId as SchemaIRI,
      properties,
      timestamps,
      deleted,
      createdAt,
      createdBy: createdBy as DID,
      updatedAt,
      updatedBy: updatedBy as DID
    }

    if (deletedAt) state.deletedAt = deletedAt
    if (documentContent) state.documentContent = documentContent
    if (_unknown) state._unknown = _unknown
    if (_schemaVersion) state._schemaVersion = _schemaVersion

    return state
  }

  private readProperties(): Record<string, unknown> {
    const count = this.readUint32()
    const props: Record<string, unknown> = {}

    for (let i = 0; i < count; i++) {
      const key = this.readString()
      const value = this.readValue()
      props[key] = value
    }

    return props
  }

  private readTimestamps(): Record<string, PropertyTimestamp> {
    const count = this.readUint32()
    const timestamps: Record<string, PropertyTimestamp> = {}

    for (let i = 0; i < count; i++) {
      const key = this.readString()
      timestamps[key] = this.readTimestamp()
    }

    return timestamps
  }

  private readTimestamp(): PropertyTimestamp {
    const time = this.readUint32()
    const author = this.readString() as DID
    const wallTime = this.readFloat64()
    return {
      lamport: { time, author },
      wallTime
    }
  }

  private readValue(): unknown {
    const tag = this.readByte()

    switch (tag) {
      case TAG_NULL:
        return null
      case TAG_UNDEFINED:
        return undefined
      case TAG_BOOLEAN_FALSE:
        return false
      case TAG_BOOLEAN_TRUE:
        return true
      case TAG_NUMBER:
        return this.readFloat64()
      case TAG_STRING:
        return this.readString()
      case TAG_UINT8ARRAY:
        return this.readUint8Array()
      case TAG_ARRAY: {
        const length = this.readUint32()
        const arr: unknown[] = []
        for (let i = 0; i < length; i++) {
          arr.push(this.readValue())
        }
        return arr
      }
      case TAG_BIGINT:
        return BigInt(this.readString())
      case TAG_OBJECT: {
        const length = this.readUint32()
        const obj: Record<string, unknown> = {}
        for (let i = 0; i < length; i++) {
          const key = this.readString()
          obj[key] = this.readValue()
        }
        return obj
      }
      default:
        throw new Error(`Unknown tag: ${tag}`)
    }
  }

  private readByte(): number {
    return this.data[this.offset++]
  }

  private readUint32(): number {
    const value = this.view.getUint32(this.offset, true)
    this.offset += 4
    return value
  }

  private readFloat64(): number {
    const value = this.view.getFloat64(this.offset, true)
    this.offset += 8
    return value
  }

  private readString(): string {
    const length = this.readUint32()
    const bytes = this.data.subarray(this.offset, this.offset + length)
    this.offset += length
    return this.textDecoder.decode(bytes)
  }

  private readUint8Array(): Uint8Array {
    const length = this.readUint32()
    const bytes = this.data.slice(this.offset, this.offset + length)
    this.offset += length
    return bytes
  }
}

// ─── Convenience Functions ───────────────────────────────────────────────────

/**
 * Encode an array of NodeState to binary.
 */
export function encodeNodeStates(states: NodeState[]): Uint8Array {
  return new NodeStateEncoder().encode(states)
}

/**
 * Decode binary back to NodeState array.
 */
export function decodeNodeStates(data: Uint8Array): NodeState[] {
  return new NodeStateDecoder(data).decode()
}

/**
 * Check if binary encoding would be beneficial for this payload size.
 * For small payloads, structured clone may be faster.
 */
export function shouldUseBinaryEncoding(states: NodeState[]): boolean {
  // Heuristic: Use binary for > 100 nodes or if any has document content
  if (states.length > 100) return true
  return states.some((s) => s.documentContent && s.documentContent.length > 1000)
}
