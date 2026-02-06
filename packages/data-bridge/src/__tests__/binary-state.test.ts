/**
 * Tests for binary NodeState serialization
 */

import type { DID } from '@xnet/core'
import type { NodeState } from '@xnet/data'
import { describe, it, expect } from 'vitest'
import { encodeNodeStates, decodeNodeStates, shouldUseBinaryEncoding } from '../utils/binary-state'

function createTestState(id: string, props: Record<string, unknown> = {}): NodeState {
  const did = 'did:key:z6MkTest' as DID
  return {
    id,
    schemaId: 'xnet://test/schema' as NodeState['schemaId'],
    properties: { title: 'Test', ...props },
    timestamps: {
      title: { lamport: { time: 1, author: did }, wallTime: Date.now() }
    },
    deleted: false,
    createdAt: Date.now(),
    createdBy: did,
    updatedAt: Date.now(),
    updatedBy: did
  }
}

describe('binary-state', () => {
  describe('encodeNodeStates / decodeNodeStates', () => {
    it('should encode and decode a single node', () => {
      const states = [createTestState('node1')]

      const encoded = encodeNodeStates(states)
      expect(encoded).toBeInstanceOf(Uint8Array)
      expect(encoded.length).toBeGreaterThan(0)

      const decoded = decodeNodeStates(encoded)
      expect(decoded).toHaveLength(1)
      expect(decoded[0].id).toBe('node1')
      expect(decoded[0].properties.title).toBe('Test')
    })

    it('should encode and decode multiple nodes', () => {
      const states = [
        createTestState('node1', { title: 'First' }),
        createTestState('node2', { title: 'Second' }),
        createTestState('node3', { title: 'Third' })
      ]

      const encoded = encodeNodeStates(states)
      const decoded = decodeNodeStates(encoded)

      expect(decoded).toHaveLength(3)
      expect(decoded[0].properties.title).toBe('First')
      expect(decoded[1].properties.title).toBe('Second')
      expect(decoded[2].properties.title).toBe('Third')
    })

    it('should handle different property types', () => {
      const states = [
        createTestState('node1', {
          string: 'hello',
          number: 42,
          float: 3.14,
          boolTrue: true,
          boolFalse: false,
          nullValue: null,
          array: [1, 2, 3],
          object: { nested: 'value' }
        })
      ]

      const encoded = encodeNodeStates(states)
      const decoded = decodeNodeStates(encoded)

      const props = decoded[0].properties
      expect(props.string).toBe('hello')
      expect(props.number).toBe(42)
      expect(props.float).toBe(3.14)
      expect(props.boolTrue).toBe(true)
      expect(props.boolFalse).toBe(false)
      expect(props.nullValue).toBeNull()
      expect(props.array).toEqual([1, 2, 3])
      expect(props.object).toEqual({ nested: 'value' })
    })

    it('should handle Uint8Array values', () => {
      const binaryData = new Uint8Array([1, 2, 3, 4, 5])
      const states = [createTestState('node1', { data: binaryData })]

      const encoded = encodeNodeStates(states)
      const decoded = decodeNodeStates(encoded)

      expect(decoded[0].properties.data).toBeInstanceOf(Uint8Array)
      expect(decoded[0].properties.data).toEqual(binaryData)
    })

    it('should handle documentContent', () => {
      const docContent = new Uint8Array([10, 20, 30, 40, 50])
      const state = createTestState('node1')
      state.documentContent = docContent

      const encoded = encodeNodeStates([state])
      const decoded = decodeNodeStates(encoded)

      expect(decoded[0].documentContent).toBeInstanceOf(Uint8Array)
      expect(decoded[0].documentContent).toEqual(docContent)
    })

    it('should handle deleted nodes', () => {
      const did = 'did:key:z6MkTest' as DID
      const state = createTestState('node1')
      state.deleted = true
      state.deletedAt = { lamport: { time: 5, author: did }, wallTime: Date.now() }

      const encoded = encodeNodeStates([state])
      const decoded = decodeNodeStates(encoded)

      expect(decoded[0].deleted).toBe(true)
      expect(decoded[0].deletedAt).toBeDefined()
      expect(decoded[0].deletedAt?.lamport.time).toBe(5)
    })

    it('should handle _unknown properties', () => {
      const state = createTestState('node1')
      state._unknown = { futureField: 'value', anotherField: 123 }

      const encoded = encodeNodeStates([state])
      const decoded = decodeNodeStates(encoded)

      expect(decoded[0]._unknown).toEqual({ futureField: 'value', anotherField: 123 })
    })

    it('should handle _schemaVersion', () => {
      const state = createTestState('node1')
      state._schemaVersion = '2.0.0'

      const encoded = encodeNodeStates([state])
      const decoded = decodeNodeStates(encoded)

      expect(decoded[0]._schemaVersion).toBe('2.0.0')
    })

    it('should handle empty array', () => {
      const states: NodeState[] = []

      const encoded = encodeNodeStates(states)
      const decoded = decodeNodeStates(encoded)

      expect(decoded).toHaveLength(0)
    })

    it('should handle bigint values', () => {
      const states = [createTestState('node1', { bigValue: BigInt(9007199254740991) })]

      const encoded = encodeNodeStates(states)
      const decoded = decodeNodeStates(encoded)

      expect(decoded[0].properties.bigValue).toBe(BigInt(9007199254740991))
    })

    it('should preserve timestamp structure', () => {
      const did = 'did:key:z6MkTest' as DID
      const wallTime = Date.now()
      const state = createTestState('node1')
      state.timestamps = {
        title: { lamport: { time: 42, author: did }, wallTime },
        desc: { lamport: { time: 43, author: did }, wallTime: wallTime + 1000 }
      }

      const encoded = encodeNodeStates([state])
      const decoded = decodeNodeStates(encoded)

      expect(decoded[0].timestamps.title.lamport.time).toBe(42)
      expect(decoded[0].timestamps.title.lamport.author).toBe(did)
      expect(decoded[0].timestamps.title.wallTime).toBe(wallTime)
      expect(decoded[0].timestamps.desc.lamport.time).toBe(43)
    })
  })

  describe('shouldUseBinaryEncoding', () => {
    it('should return true for > 100 nodes', () => {
      const states = Array.from({ length: 101 }, (_, i) => createTestState(`node${i}`))
      expect(shouldUseBinaryEncoding(states)).toBe(true)
    })

    it('should return false for small arrays', () => {
      const states = [createTestState('node1'), createTestState('node2')]
      expect(shouldUseBinaryEncoding(states)).toBe(false)
    })

    it('should return true for nodes with large documentContent', () => {
      const state = createTestState('node1')
      state.documentContent = new Uint8Array(2000) // > 1000 bytes
      expect(shouldUseBinaryEncoding([state])).toBe(true)
    })

    it('should return false for nodes with small documentContent', () => {
      const state = createTestState('node1')
      state.documentContent = new Uint8Array(100) // < 1000 bytes
      expect(shouldUseBinaryEncoding([state])).toBe(false)
    })
  })

  describe('performance', () => {
    it('should handle 1000 nodes efficiently', () => {
      const states = Array.from({ length: 1000 }, (_, i) =>
        createTestState(`node${i}`, {
          title: `Node ${i}`,
          count: i,
          active: i % 2 === 0
        })
      )

      const start = performance.now()
      const encoded = encodeNodeStates(states)
      const encodeTime = performance.now() - start

      const decodeStart = performance.now()
      const decoded = decodeNodeStates(encoded)
      const decodeTime = performance.now() - decodeStart

      expect(decoded).toHaveLength(1000)
      expect(encodeTime).toBeLessThan(100) // Should be < 100ms
      expect(decodeTime).toBeLessThan(100)

      // Log for reference
      console.log(`Encoded 1000 nodes: ${encoded.length} bytes in ${encodeTime.toFixed(2)}ms`)
      console.log(`Decoded 1000 nodes in ${decodeTime.toFixed(2)}ms`)
    })
  })
})
