/**
 * Serializer registry and exports.
 *
 * This module provides:
 * - Version-specific serializers (V1, V2)
 * - A registry for managing serializers
 * - Auto-detection for incoming data
 * - Helper function for selecting serializer by version
 */

import type { Change } from '../change'
import type {
  ChangeSerializer,
  SerializerRegistry,
  SerializedChange,
  DeserializeOutcome
} from './types'
import { CURRENT_PROTOCOL_VERSION } from '../change'
import { v1Serializer } from './v1'
import { v2Serializer } from './v2'

// Re-export types
export type {
  ChangeSerializer,
  SerializerRegistry,
  SerializedChange,
  DeserializeOutcome,
  DeserializeResult,
  DeserializeError,
  SerializeOptions
} from './types'

// Re-export serializers
export { V1Serializer, v1Serializer } from './v1'
export { V2Serializer, v2Serializer } from './v2'

// ─── Serializer Registry Implementation ──────────────────────────────────────

/**
 * Default serializer registry implementation.
 */
class DefaultSerializerRegistry implements SerializerRegistry {
  private serializers = new Map<number, ChangeSerializer>()
  private defaultVersion: number

  constructor(defaultVersion: number = CURRENT_PROTOCOL_VERSION) {
    this.defaultVersion = defaultVersion
    // Register built-in serializers
    this.register(v1Serializer)
    this.register(v2Serializer)
  }

  get(version: number): ChangeSerializer | undefined {
    return this.serializers.get(version)
  }

  getDefault(): ChangeSerializer {
    const serializer = this.serializers.get(this.defaultVersion)
    if (!serializer) {
      throw new Error(`No serializer registered for default version ${this.defaultVersion}`)
    }
    return serializer
  }

  register(serializer: ChangeSerializer): void {
    this.serializers.set(serializer.version, serializer)
  }

  getVersions(): number[] {
    return [...this.serializers.keys()].sort((a, b) => a - b)
  }

  detect(data: unknown): ChangeSerializer | undefined {
    // Try serializers in reverse order (newest first)
    const versions = this.getVersions().reverse()
    for (const version of versions) {
      const serializer = this.serializers.get(version)!
      if (serializer.canDeserialize(data)) {
        return serializer
      }
    }
    return undefined
  }
}

/**
 * Default serializer registry instance.
 */
export const serializerRegistry = new DefaultSerializerRegistry()

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Get a serializer for a specific protocol version.
 *
 * @param version - Protocol version number
 * @returns Serializer for that version, or undefined if not found
 */
export function getSerializer(version: number): ChangeSerializer | undefined {
  return serializerRegistry.get(version)
}

/**
 * Get the default serializer (for current protocol version).
 */
export function getDefaultSerializer(): ChangeSerializer {
  return serializerRegistry.getDefault()
}

/**
 * Detect and deserialize a change from raw data.
 * Automatically detects the format and uses appropriate serializer.
 *
 * @param data - Raw serialized data
 * @returns Deserialized change or error
 */
export function autoDeserialize<T = unknown>(data: SerializedChange): DeserializeOutcome<T> {
  const serializer = serializerRegistry.detect(data)
  if (!serializer) {
    return {
      success: false,
      error: 'Unable to detect serializer format',
      rawData: data
    }
  }
  return serializer.deserialize<T>(data)
}

/**
 * Serialize a change using the appropriate serializer for its protocol version.
 *
 * @param change - Change to serialize
 * @returns Serialized data
 */
export function autoSerialize<T>(change: Change<T>): SerializedChange {
  const version = change.protocolVersion ?? 1
  const serializer = serializerRegistry.get(version) ?? serializerRegistry.getDefault()
  return serializer.serialize(change)
}

/**
 * Create a serializer registry with custom serializers.
 *
 * @param defaultVersion - Default protocol version to use
 * @param serializers - Optional additional serializers to register
 * @returns New serializer registry
 */
export function createSerializerRegistry(
  defaultVersion: number = CURRENT_PROTOCOL_VERSION,
  serializers?: ChangeSerializer[]
): SerializerRegistry {
  const registry = new DefaultSerializerRegistry(defaultVersion)
  if (serializers) {
    for (const serializer of serializers) {
      registry.register(serializer)
    }
  }
  return registry
}
