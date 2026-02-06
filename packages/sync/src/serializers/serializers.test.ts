/**
 * Tests for version-specific serializers
 */
import type { Change } from '../change'
import type { DID } from '@xnet/core'
import { generateKeyPair } from '@xnet/crypto'
import { describe, it, expect } from 'vitest'
import { signChange, createUnsignedChange } from '../change'
import { createLamportClock, tick } from '../clock'
import {
  v1Serializer,
  V2Serializer,
  v2Serializer,
  serializerRegistry,
  getSerializer,
  getDefaultSerializer,
  autoDeserialize,
  autoSerialize
} from './index'

describe('serializers', () => {
  // Test fixtures
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID
  const keyPair = generateKeyPair()

  function createTestChange<T>(payload: T): Change<T> {
    const clock = createLamportClock(testDID)
    const [, lamport] = tick(clock)
    const unsigned = createUnsignedChange({
      id: 'test-change-001',
      type: 'test-type',
      payload,
      parentHash: null,
      authorDID: testDID,
      lamport
    })
    return signChange(unsigned, keyPair.privateKey)
  }

  describe('V1Serializer', () => {
    it('should serialize and deserialize a change', () => {
      const change = createTestChange({ message: 'hello' })
      const serialized = v1Serializer.serialize(change)
      const result = v1Serializer.deserialize(serialized)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.change.id).toBe(change.id)
        expect(result.change.type).toBe(change.type)
        expect(result.change.payload).toEqual(change.payload)
        expect(result.change.hash).toBe(change.hash)
        expect(result.change.authorDID).toBe(change.authorDID)
        expect(result.change.lamport.time).toBe(change.lamport.time)
        expect(result.change.lamport.author).toBe(change.lamport.author)
      }
    })

    it('should preserve batch fields', () => {
      const clock = createLamportClock(testDID)
      const [, lamport] = tick(clock)
      const unsigned = createUnsignedChange({
        id: 'batch-change-001',
        type: 'batch-type',
        payload: { data: 'test' },
        parentHash: null,
        authorDID: testDID,
        lamport,
        batchId: 'batch-123',
        batchIndex: 0,
        batchSize: 3
      })
      const change = signChange(unsigned, keyPair.privateKey)

      const serialized = v1Serializer.serialize(change)
      const result = v1Serializer.deserialize(serialized)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.change.batchId).toBe('batch-123')
        expect(result.change.batchIndex).toBe(0)
        expect(result.change.batchSize).toBe(3)
      }
    })

    it('should handle binary input', () => {
      const change = createTestChange({ value: 42 })
      const serialized = v1Serializer.serialize(change) as Record<string, unknown>
      const binary = new TextEncoder().encode(JSON.stringify(serialized))

      const result = v1Serializer.deserialize(binary)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.change.id).toBe(change.id)
      }
    })

    it('should detect v1 format', () => {
      const change = createTestChange({ test: true })
      const serialized = v1Serializer.serialize(change)

      expect(v1Serializer.canDeserialize(serialized)).toBe(true)
      expect(v1Serializer.canDeserialize({ v: 2, i: 'test' })).toBe(false)
    })

    it('should fail on missing required fields', () => {
      const result = v1Serializer.deserialize({ id: 'test' } as Record<string, unknown>)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('Missing required fields')
      }
    })

    it('should fail on invalid lamport timestamp', () => {
      const change = createTestChange({ test: true })
      const serialized = v1Serializer.serialize(change) as Record<string, unknown>
      serialized.lamport = { time: 'invalid' }

      const result = v1Serializer.deserialize(serialized)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('lamport')
      }
    })
  })

  describe('V2Serializer', () => {
    it('should serialize and deserialize a change', () => {
      const change = createTestChange({ message: 'hello v2' })
      // Override to v2 for this test
      const v2Change = { ...change, protocolVersion: 2 }

      const serialized = v2Serializer.serialize(v2Change)
      const result = v2Serializer.deserialize(serialized)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.change.id).toBe(change.id)
        expect(result.change.type).toBe(change.type)
        expect(result.change.protocolVersion).toBe(2)
        expect(result.change.payload).toEqual(change.payload)
      }
    })

    it('should use abbreviated field names', () => {
      const change = createTestChange({ data: 'test' })
      const serialized = v2Serializer.serialize(change) as Record<string, unknown>

      // Check abbreviated names
      expect(serialized.v).toBe(2)
      expect(serialized.i).toBe(change.id)
      expect(serialized.t).toBe(change.type)
      expect(serialized.h).toBe(change.hash)
      expect(serialized.a).toBe(change.authorDID)
      expect(serialized.l).toBeDefined()
    })

    it('should detect v2 format', () => {
      const change = createTestChange({ test: true })
      const serialized = v2Serializer.serialize(change)

      expect(v2Serializer.canDeserialize(serialized)).toBe(true)
      expect(v2Serializer.canDeserialize({ id: 'test', type: 'x' })).toBe(false)
    })

    it('should fail on wrong version marker', () => {
      const result = v2Serializer.deserialize({ v: 1, i: 'test' } as Record<string, unknown>)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('Expected v2')
      }
    })

    it('should add and extract schema version', () => {
      const payload = { name: 'Test Task', status: 'todo' }
      const withVersion = V2Serializer.addSchemaVersion(payload, 'Task@2.0.0')

      expect(withVersion._sv).toBe('Task@2.0.0')
      expect(withVersion.name).toBe('Test Task')

      const extracted = V2Serializer.getSchemaVersion(withVersion)
      expect(extracted).toBe('Task@2.0.0')
    })

    it('should return undefined for payload without schema version', () => {
      const payload = { name: 'Test' }
      expect(V2Serializer.getSchemaVersion(payload)).toBeUndefined()
      expect(V2Serializer.getSchemaVersion(null)).toBeUndefined()
      expect(V2Serializer.getSchemaVersion('string')).toBeUndefined()
    })
  })

  describe('serializerRegistry', () => {
    it('should have v1 and v2 serializers registered', () => {
      expect(serializerRegistry.get(1)).toBeDefined()
      expect(serializerRegistry.get(2)).toBeDefined()
      expect(serializerRegistry.getVersions()).toContain(1)
      expect(serializerRegistry.getVersions()).toContain(2)
    })

    it('should return undefined for unregistered version', () => {
      expect(serializerRegistry.get(99)).toBeUndefined()
    })

    it('should auto-detect v1 format', () => {
      const change = createTestChange({ test: 'v1' })
      const serialized = v1Serializer.serialize(change)

      const detected = serializerRegistry.detect(serialized)
      expect(detected).toBeDefined()
      expect(detected?.version).toBe(1)
    })

    it('should auto-detect v2 format', () => {
      const change = createTestChange({ test: 'v2' })
      const serialized = v2Serializer.serialize(change)

      const detected = serializerRegistry.detect(serialized)
      expect(detected).toBeDefined()
      expect(detected?.version).toBe(2)
    })

    it('should return undefined for unknown format', () => {
      expect(serializerRegistry.detect({ unknown: 'format' })).toBeUndefined()
      expect(serializerRegistry.detect('string')).toBeUndefined()
      expect(serializerRegistry.detect(null)).toBeUndefined()
    })
  })

  describe('getSerializer', () => {
    it('should return serializer for known version', () => {
      expect(getSerializer(1)).toBe(v1Serializer)
      expect(getSerializer(2)).toBe(v2Serializer)
    })

    it('should return undefined for unknown version', () => {
      expect(getSerializer(99)).toBeUndefined()
    })
  })

  describe('getDefaultSerializer', () => {
    it('should return default serializer', () => {
      const serializer = getDefaultSerializer()
      expect(serializer).toBeDefined()
      expect([1, 2]).toContain(serializer.version)
    })
  })

  describe('autoDeserialize', () => {
    it('should auto-detect and deserialize v1 format', () => {
      const change = createTestChange({ format: 'v1' })
      const serialized = v1Serializer.serialize(change)

      const result = autoDeserialize(serialized)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.change.id).toBe(change.id)
      }
    })

    it('should auto-detect and deserialize v2 format', () => {
      const change = createTestChange({ format: 'v2' })
      const serialized = v2Serializer.serialize(change)

      const result = autoDeserialize(serialized)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.change.id).toBe(change.id)
      }
    })

    it('should fail for unknown format', () => {
      const result = autoDeserialize({ unknown: 'data' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('Unable to detect')
      }
    })
  })

  describe('autoSerialize', () => {
    it('should use v1 serializer for v1 changes', () => {
      const change = createTestChange({ test: true })
      change.protocolVersion = 1

      const serialized = autoSerialize(change) as Record<string, unknown>
      // V1 uses full field names
      expect(serialized.id).toBeDefined()
      expect(serialized.type).toBeDefined()
    })

    it('should use v2 serializer for v2 changes', () => {
      const change = createTestChange({ test: true })
      change.protocolVersion = 2

      const serialized = autoSerialize(change) as Record<string, unknown>
      // V2 uses abbreviated field names
      expect(serialized.v).toBe(2)
      expect(serialized.i).toBeDefined()
    })

    it('should use v1 for changes without version', () => {
      const change = createTestChange({ test: true })
      delete change.protocolVersion

      const serialized = autoSerialize(change) as Record<string, unknown>
      // Should default to v1 (full field names)
      expect(serialized.id).toBeDefined()
    })
  })

  describe('round-trip compatibility', () => {
    it('should serialize v1 and deserialize with auto-detect', () => {
      const original = createTestChange({ round: 'trip1' })
      const serialized = v1Serializer.serialize(original)
      const result = autoDeserialize(serialized)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.change.payload).toEqual(original.payload)
      }
    })

    it('should serialize v2 and deserialize with auto-detect', () => {
      const original = createTestChange({ round: 'trip2' })
      const serialized = v2Serializer.serialize(original)
      const result = autoDeserialize(serialized)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.change.payload).toEqual(original.payload)
      }
    })
  })
})
