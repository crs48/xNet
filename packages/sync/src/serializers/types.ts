/**
 * Serializer types for version-specific change encoding.
 *
 * Each protocol version may have a different wire format for changes.
 * Serializers handle encoding and decoding for their specific version.
 */

import type { Change } from '../change'

/**
 * Serialized change format.
 * Can be either binary (Uint8Array) or JSON-compatible object.
 */
export type SerializedChange = Uint8Array | Record<string, unknown>

/**
 * Result of deserializing a change.
 */
export interface DeserializeResult<T = unknown> {
  success: true
  change: Change<T>
}

export interface DeserializeError {
  success: false
  error: string
  /** Raw data that failed to deserialize */
  rawData?: unknown
}

export type DeserializeOutcome<T = unknown> = DeserializeResult<T> | DeserializeError

/**
 * Interface for version-specific change serializers.
 *
 * Each serializer handles:
 * - Encoding changes for network transmission
 * - Decoding changes from network
 * - Validating change format
 */
export interface ChangeSerializer {
  /**
   * Protocol version this serializer handles.
   */
  readonly version: number

  /**
   * Human-readable name for this serializer.
   */
  readonly name: string

  /**
   * Serialize a change for transmission.
   *
   * @param change - The change to serialize
   * @returns Serialized data (binary or JSON object)
   */
  serialize<T>(change: Change<T>): SerializedChange

  /**
   * Deserialize a change from received data.
   *
   * @param data - Raw data (binary or JSON object)
   * @returns Deserialized change or error
   */
  deserialize<T = unknown>(data: SerializedChange): DeserializeOutcome<T>

  /**
   * Check if this serializer can handle the given data.
   * Used for format detection.
   *
   * @param data - Raw data to check
   * @returns true if this serializer can deserialize the data
   */
  canDeserialize(data: unknown): boolean
}

/**
 * Options for serialization.
 */
export interface SerializeOptions {
  /**
   * Whether to use binary encoding (more compact) or JSON (more readable).
   * Default: true for production, false for debugging.
   */
  binary?: boolean

  /**
   * Whether to include optional fields with default values.
   * Default: false (omit default values).
   */
  includeDefaults?: boolean
}

/**
 * Registry for managing multiple serializer versions.
 */
export interface SerializerRegistry {
  /**
   * Get serializer for a specific version.
   */
  get(version: number): ChangeSerializer | undefined

  /**
   * Get the default (latest) serializer.
   */
  getDefault(): ChangeSerializer

  /**
   * Register a serializer.
   */
  register(serializer: ChangeSerializer): void

  /**
   * Get all registered versions.
   */
  getVersions(): number[]

  /**
   * Auto-detect serializer for incoming data.
   */
  detect(data: unknown): ChangeSerializer | undefined
}
