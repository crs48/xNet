/**
 * Tests for ChangeHandlerRegistry
 */

import type { Change } from '../change'
import type { ChangeHandler, ValidationResult } from './types'
import { describe, it, expect, vi } from 'vitest'
import { ChangeHandlerRegistry, createTestContext } from './registry'

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function createTestChange(overrides: Partial<Change<unknown>> = {}): Change<unknown> {
  return {
    id: 'change-1',
    type: 'test-change',
    payload: { data: 'test' },
    hash: 'hash-1' as any,
    parentHash: null,
    authorDID: 'did:key:test' as any,
    signature: new Uint8Array([1, 2, 3]),
    wallTime: Date.now(),
    lamport: { time: 1, author: 'did:key:test' as any },
    protocolVersion: 1,
    ...overrides
  }
}

function createTestHandler(
  overrides: Partial<ChangeHandler<unknown>> = {}
): ChangeHandler<unknown> {
  return {
    type: 'test-change',
    minVersion: 1,
    maxVersion: 99,
    canHandle: () => true,
    validate: (): ValidationResult => ({ valid: true, errors: [], warnings: [] }),
    process: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ChangeHandlerRegistry', () => {
  describe('register', () => {
    it('should register a handler', () => {
      const registry = new ChangeHandlerRegistry()
      const handler = createTestHandler()

      registry.register(handler)

      expect(registry.hasHandler('test-change')).toBe(true)
      expect(registry.getTypes()).toContain('test-change')
    })

    it('should register multiple handlers for the same type', () => {
      const registry = new ChangeHandlerRegistry()

      registry.register(createTestHandler({ minVersion: 1, maxVersion: 1 }))
      registry.register(createTestHandler({ minVersion: 2, maxVersion: 2 }))

      const stats = registry.getStats()
      expect(stats.byType['test-change']).toBe(2)
    })

    it('should sort handlers by version (newest first)', () => {
      const registry = new ChangeHandlerRegistry()

      registry.register(createTestHandler({ minVersion: 1, maxVersion: 1 }))
      registry.register(createTestHandler({ minVersion: 3, maxVersion: 3 }))
      registry.register(createTestHandler({ minVersion: 2, maxVersion: 2 }))

      // v3 handler should match for v3 changes
      const change = createTestChange({ protocolVersion: 3 })
      const handler = registry.getHandler(change)
      expect(handler?.maxVersion).toBe(3)
    })
  })

  describe('unregister', () => {
    it('should unregister a handler', () => {
      const registry = new ChangeHandlerRegistry()
      registry.register(createTestHandler({ minVersion: 1, maxVersion: 1 }))

      const result = registry.unregister('test-change', 1, 1)

      expect(result).toBe(true)
      expect(registry.hasHandler('test-change')).toBe(false)
    })

    it('should return false for non-existent handler', () => {
      const registry = new ChangeHandlerRegistry()

      const result = registry.unregister('nonexistent', 1, 1)

      expect(result).toBe(false)
    })
  })

  describe('getHandler', () => {
    it('should return handler matching version range', () => {
      const registry = new ChangeHandlerRegistry()
      const handler = createTestHandler({ minVersion: 1, maxVersion: 2 })
      registry.register(handler)

      const change = createTestChange({ protocolVersion: 1 })
      const result = registry.getHandler(change)

      expect(result).toBe(handler)
    })

    it('should return null for unknown change type', () => {
      const registry = new ChangeHandlerRegistry()

      const change = createTestChange({ type: 'unknown-type' })
      const result = registry.getHandler(change)

      expect(result).toBeNull()
    })

    it('should return null if version is out of range', () => {
      const registry = new ChangeHandlerRegistry()
      registry.register(createTestHandler({ minVersion: 2, maxVersion: 3 }))

      const change = createTestChange({ protocolVersion: 1 })
      const result = registry.getHandler(change)

      expect(result).toBeNull()
    })

    it('should treat undefined protocolVersion as v0', () => {
      const registry = new ChangeHandlerRegistry()
      registry.register(createTestHandler({ minVersion: 0, maxVersion: 1 }))

      const change = createTestChange({ protocolVersion: undefined })
      const result = registry.getHandler(change)

      expect(result).not.toBeNull()
    })

    it('should respect canHandle filter', () => {
      const registry = new ChangeHandlerRegistry()
      registry.register(
        createTestHandler({
          canHandle: (c) => (c.payload as any).special === true
        })
      )

      const normalChange = createTestChange({ payload: { special: false } })
      const specialChange = createTestChange({ payload: { special: true } })

      expect(registry.getHandler(normalChange)).toBeNull()
      expect(registry.getHandler(specialChange)).not.toBeNull()
    })
  })

  describe('process', () => {
    it('should process a valid change', async () => {
      const registry = new ChangeHandlerRegistry()
      const processFn = vi.fn().mockResolvedValue(undefined)
      registry.register(createTestHandler({ process: processFn }))

      const change = createTestChange()
      const context = createTestContext()
      const result = await registry.process(change, context)

      expect(result.success).toBe(true)
      expect(result.handlerType).toBe('test-change')
      expect(processFn).toHaveBeenCalledWith(change, context)
    })

    it('should store unknown change types', async () => {
      const registry = new ChangeHandlerRegistry()
      const storeUnknown = vi.fn().mockResolvedValue(undefined)
      const context = createTestContext()
      ;(context as any).storeUnknown = storeUnknown

      const change = createTestChange({ type: 'unknown-type' })
      const result = await registry.process(change, context)

      expect(result.success).toBe(true)
      expect(storeUnknown).toHaveBeenCalledWith(change)
    })

    it('should emit unknown-change-type event', async () => {
      const registry = new ChangeHandlerRegistry()
      const listener = vi.fn()
      registry.on(listener)

      const change = createTestChange({ type: 'unknown-type' })
      const context = createTestContext()
      await registry.process(change, context)

      expect(listener).toHaveBeenCalledWith({
        type: 'unknown-change-type',
        change
      })
    })

    it('should fail on validation errors', async () => {
      const registry = new ChangeHandlerRegistry()
      registry.register(
        createTestHandler({
          validate: () => ({
            valid: false,
            errors: [{ code: 'TEST_ERROR', message: 'Test error' }],
            warnings: []
          })
        })
      )

      const change = createTestChange()
      const context = createTestContext()
      const result = await registry.process(change, context)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Validation failed')
      expect(result.validation?.errors).toHaveLength(1)
    })

    it('should emit invalid-change event', async () => {
      const registry = new ChangeHandlerRegistry()
      const listener = vi.fn()
      registry.on(listener)
      registry.register(
        createTestHandler({
          validate: () => ({
            valid: false,
            errors: [{ code: 'TEST_ERROR', message: 'Test error' }],
            warnings: []
          })
        })
      )

      const change = createTestChange()
      const context = createTestContext()
      await registry.process(change, context)

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'invalid-change',
          change
        })
      )
    })

    it('should catch and report handler errors', async () => {
      const registry = new ChangeHandlerRegistry()
      registry.register(
        createTestHandler({
          process: vi.fn().mockRejectedValue(new Error('Process failed'))
        })
      )

      const change = createTestChange()
      const context = createTestContext()
      const result = await registry.process(change, context)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Handler error')
      expect(result.error).toContain('Process failed')
    })

    it('should emit change-processed event on success', async () => {
      const registry = new ChangeHandlerRegistry()
      const listener = vi.fn()
      registry.on(listener)
      registry.register(createTestHandler())

      const change = createTestChange()
      const context = createTestContext()
      await registry.process(change, context)

      expect(listener).toHaveBeenCalledWith({
        type: 'change-processed',
        change,
        handlerType: 'test-change'
      })
    })

    it('should upgrade old changes if handler supports it', async () => {
      const registry = new ChangeHandlerRegistry()
      const processFn = vi.fn().mockResolvedValue(undefined)
      const upgradedPayload = { data: 'upgraded', version: 2 }

      registry.register(
        createTestHandler({
          minVersion: 2,
          maxVersion: 2,
          upgrade: (change) => ({
            ...change,
            payload: upgradedPayload,
            protocolVersion: 2
          }),
          process: processFn
        })
      )

      const oldChange = createTestChange({ protocolVersion: 1 })
      const context = createTestContext()
      await registry.process(oldChange, context)

      expect(processFn).toHaveBeenCalledWith(
        expect.objectContaining({ payload: upgradedPayload }),
        context
      )
    })
  })

  describe('processAll', () => {
    it('should process multiple changes', async () => {
      const registry = new ChangeHandlerRegistry()
      registry.register(createTestHandler())

      const changes = [
        createTestChange({ id: '1' }),
        createTestChange({ id: '2' }),
        createTestChange({ id: '3' })
      ]

      const context = createTestContext()
      const { results, successful, failed } = await registry.processAll(changes, context)

      expect(results).toHaveLength(3)
      expect(successful).toBe(3)
      expect(failed).toBe(0)
    })

    it('should count failures correctly', async () => {
      const registry = new ChangeHandlerRegistry()
      let callCount = 0
      registry.register(
        createTestHandler({
          process: vi.fn().mockImplementation(() => {
            callCount++
            if (callCount === 2) throw new Error('Fail')
            return Promise.resolve()
          })
        })
      )

      const changes = [
        createTestChange({ id: '1' }),
        createTestChange({ id: '2' }),
        createTestChange({ id: '3' })
      ]

      const context = createTestContext()
      const { successful, failed } = await registry.processAll(changes, context)

      expect(successful).toBe(2)
      expect(failed).toBe(1)
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const registry = new ChangeHandlerRegistry()
      registry.register(createTestHandler({ type: 'type-a' }))
      registry.register(createTestHandler({ type: 'type-a', minVersion: 2, maxVersion: 2 }))
      registry.register(createTestHandler({ type: 'type-b' }))

      const stats = registry.getStats()

      expect(stats.handlerTypes).toBe(2)
      expect(stats.totalHandlers).toBe(3)
      expect(stats.byType['type-a']).toBe(2)
      expect(stats.byType['type-b']).toBe(1)
    })
  })

  describe('clear', () => {
    it('should remove all handlers', () => {
      const registry = new ChangeHandlerRegistry()
      registry.register(createTestHandler({ type: 'type-a' }))
      registry.register(createTestHandler({ type: 'type-b' }))

      registry.clear()

      expect(registry.getStats().handlerTypes).toBe(0)
      expect(registry.getStats().totalHandlers).toBe(0)
    })
  })

  describe('event handling', () => {
    it('should support multiple listeners', async () => {
      const registry = new ChangeHandlerRegistry()
      registry.register(createTestHandler())

      const listener1 = vi.fn()
      const listener2 = vi.fn()
      registry.on(listener1)
      registry.on(listener2)

      const change = createTestChange()
      const context = createTestContext()
      await registry.process(change, context)

      expect(listener1).toHaveBeenCalled()
      expect(listener2).toHaveBeenCalled()
    })

    it('should allow unsubscribing', async () => {
      const registry = new ChangeHandlerRegistry()
      registry.register(createTestHandler())

      const listener = vi.fn()
      const unsubscribe = registry.on(listener)

      unsubscribe()

      const change = createTestChange()
      const context = createTestContext()
      await registry.process(change, context)

      expect(listener).not.toHaveBeenCalled()
    })
  })
})
