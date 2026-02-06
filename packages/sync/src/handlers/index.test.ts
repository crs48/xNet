/**
 * Tests for the Change Handler Registry.
 */

import type { Change } from '../change'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ChangeHandlerRegistry,
  createHandler,
  createVersionedHandler,
  type ChangeHandler,
  type HandlerContext,
  type ValidationResult
} from './index'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockChange(type: string, protocolVersion?: number): Change<unknown> {
  return {
    id: `change-${Math.random().toString(36).slice(2)}`,
    type,
    protocolVersion,
    payload: { data: 'test' },
    hash: 'test-hash' as any,
    parentHash: null,
    authorDID: 'did:key:test' as any,
    signature: new Uint8Array(),
    lamport: { time: 1, author: 'did:key:test' as any },
    wallTime: Date.now()
  }
}

function createMockContext(): HandlerContext {
  return {
    storeUnknown: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn(),
    authorDID: 'did:key:test'
  }
}

// ─── ChangeHandlerRegistry Tests ─────────────────────────────────────────────

describe('ChangeHandlerRegistry', () => {
  let registry: ChangeHandlerRegistry

  beforeEach(() => {
    registry = new ChangeHandlerRegistry()
  })

  describe('register', () => {
    it('should register a handler', () => {
      const handler = createHandler('test-type', async () => {})
      registry.register(handler)

      expect(registry.getTypes()).toContain('test-type')
    })

    it('should allow multiple handlers for same type', () => {
      const handler1 = createVersionedHandler('test-type', 0, 1, async () => {})
      const handler2 = createVersionedHandler('test-type', 2, Infinity, async () => {})

      registry.register(handler1)
      registry.register(handler2)

      const handlers = registry.getHandlersForType('test-type')
      expect(handlers).toHaveLength(2)
    })

    it('should sort handlers by version (newest first)', () => {
      const handler1 = createVersionedHandler('test-type', 0, 1, async () => {})
      const handler2 = createVersionedHandler('test-type', 2, 5, async () => {})
      const handler3 = createVersionedHandler('test-type', 6, Infinity, async () => {})

      registry.register(handler1)
      registry.register(handler2)
      registry.register(handler3)

      const handlers = registry.getHandlersForType('test-type')
      expect(handlers[0].maxVersion).toBe(Infinity)
      expect(handlers[1].maxVersion).toBe(5)
      expect(handlers[2].maxVersion).toBe(1)
    })
  })

  describe('unregister', () => {
    it('should remove all handlers for a type', () => {
      const handler = createHandler('test-type', async () => {})
      registry.register(handler)

      expect(registry.getTypes()).toContain('test-type')

      registry.unregister('test-type')

      expect(registry.getTypes()).not.toContain('test-type')
    })

    it('should return false for non-existent type', () => {
      expect(registry.unregister('non-existent')).toBe(false)
    })
  })

  describe('getHandler', () => {
    it('should return handler for exact version match', () => {
      const handler = createVersionedHandler('test-type', 1, 2, async () => {})
      registry.register(handler)

      const change = createMockChange('test-type', 1)
      const result = registry.getHandler(change)

      expect(result).toBe(handler)
    })

    it('should return null for no matching type', () => {
      const change = createMockChange('unknown-type', 1)
      const result = registry.getHandler(change)

      expect(result).toBeNull()
    })

    it('should return null for version outside range', () => {
      const handler = createVersionedHandler('test-type', 2, 3, async () => {})
      registry.register(handler)

      const change = createMockChange('test-type', 5)
      const result = registry.getHandler(change)

      expect(result).toBeNull()
    })

    it('should treat undefined version as 0', () => {
      const handler = createVersionedHandler('test-type', 0, 1, async () => {})
      registry.register(handler)

      const change = createMockChange('test-type', undefined)
      const result = registry.getHandler(change)

      expect(result).toBe(handler)
    })

    it('should fallback to backward-compatible handler', () => {
      const oldHandler = createVersionedHandler('test-type', 0, 1, async () => {})
      const newHandler = createVersionedHandler('test-type', 0, Infinity, async () => {})

      registry.register(oldHandler)
      registry.register(newHandler)

      // Version 5 doesn't match oldHandler (0-1), but matches newHandler (0-Infinity)
      const change = createMockChange('test-type', 5)
      const result = registry.getHandler(change)

      expect(result).toBe(newHandler)
    })

    it('should check canHandle for additional filtering', () => {
      const handler: ChangeHandler<{ valid: boolean }> = {
        type: 'test-type',
        minVersion: 0,
        maxVersion: Infinity,
        canHandle: (change) => (change.payload as any).valid === true,
        process: async () => {},
        validate: () => ({ valid: true, errors: [] })
      }
      registry.register(handler)

      const validChange = createMockChange('test-type', 1)
      ;(validChange.payload as any).valid = true
      expect(registry.getHandler(validChange)).toBe(handler)

      const invalidChange = createMockChange('test-type', 1)
      ;(invalidChange.payload as any).valid = false
      expect(registry.getHandler(invalidChange)).toBeNull()
    })
  })

  describe('canProcess', () => {
    it('should return true when handler exists', () => {
      registry.register(createHandler('test-type', async () => {}))

      const change = createMockChange('test-type', 1)
      expect(registry.canProcess(change)).toBe(true)
    })

    it('should return false when no handler exists', () => {
      const change = createMockChange('unknown-type', 1)
      expect(registry.canProcess(change)).toBe(false)
    })
  })

  describe('process', () => {
    it('should call handler process function', async () => {
      const processFn = vi.fn().mockResolvedValue(undefined)
      const handler = createHandler('test-type', processFn)
      registry.register(handler)

      const change = createMockChange('test-type', 1)
      const context = createMockContext()

      await registry.process(change, context)

      expect(processFn).toHaveBeenCalledWith(change, context)
    })

    it('should store unknown change type', async () => {
      const change = createMockChange('unknown-type', 1)
      const context = createMockContext()

      await registry.process(change, context)

      expect(context.storeUnknown).toHaveBeenCalledWith(change)
      expect(context.emit).toHaveBeenCalledWith('unknownChangeType', { change })
    })

    it('should notify unknown type listeners', async () => {
      const listener = vi.fn()
      registry.onUnknownType(listener)

      const change = createMockChange('unknown-type', 1)
      const context = createMockContext()

      await registry.process(change, context)

      expect(listener).toHaveBeenCalledWith(change)
    })

    it('should reject invalid changes', async () => {
      const handler: ChangeHandler<unknown> = {
        type: 'test-type',
        minVersion: 0,
        maxVersion: Infinity,
        canHandle: () => true,
        process: vi.fn().mockResolvedValue(undefined),
        validate: () => ({ valid: false, errors: ['Missing required field'] })
      }
      registry.register(handler)

      const change = createMockChange('test-type', 1)
      const context = createMockContext()

      await registry.process(change, context)

      expect(handler.process).not.toHaveBeenCalled()
      expect(context.emit).toHaveBeenCalledWith('invalidChange', {
        change,
        errors: ['Missing required field']
      })
    })

    it('should notify invalid change listeners', async () => {
      const listener = vi.fn()
      registry.onInvalidChange(listener)

      const handler: ChangeHandler<unknown> = {
        type: 'test-type',
        minVersion: 0,
        maxVersion: Infinity,
        canHandle: () => true,
        process: async () => {},
        validate: () => ({ valid: false, errors: ['Bad data'] })
      }
      registry.register(handler)

      const change = createMockChange('test-type', 1)
      const context = createMockContext()

      await registry.process(change, context)

      expect(listener).toHaveBeenCalledWith(change, ['Bad data'])
    })
  })

  describe('event subscriptions', () => {
    it('should allow unsubscribing from unknown type events', async () => {
      const listener = vi.fn()
      const unsub = registry.onUnknownType(listener)

      const change1 = createMockChange('unknown-type', 1)
      await registry.process(change1, createMockContext())
      expect(listener).toHaveBeenCalledTimes(1)

      unsub()

      const change2 = createMockChange('unknown-type', 1)
      await registry.process(change2, createMockContext())
      expect(listener).toHaveBeenCalledTimes(1) // Still 1
    })

    it('should handle listener errors gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const badListener = () => {
        throw new Error('boom')
      }
      const goodListener = vi.fn()

      registry.onUnknownType(badListener)
      registry.onUnknownType(goodListener)

      const change = createMockChange('unknown-type', 1)
      await registry.process(change, createMockContext())

      expect(goodListener).toHaveBeenCalledOnce()
      expect(consoleError).toHaveBeenCalled()
      consoleError.mockRestore()
    })
  })

  describe('clear', () => {
    it('should remove all handlers', () => {
      registry.register(createHandler('type-a', async () => {}))
      registry.register(createHandler('type-b', async () => {}))

      expect(registry.getTypes()).toHaveLength(2)

      registry.clear()

      expect(registry.getTypes()).toHaveLength(0)
    })
  })
})

// ─── Helper Function Tests ───────────────────────────────────────────────────

describe('createHandler', () => {
  it('should create handler with defaults', () => {
    const processFn = vi.fn().mockResolvedValue(undefined)
    const handler = createHandler('test-type', processFn)

    expect(handler.type).toBe('test-type')
    expect(handler.minVersion).toBe(0)
    expect(handler.maxVersion).toBe(Infinity)
    expect(handler.canHandle({} as any)).toBe(true)
    expect(handler.validate({} as any)).toEqual({ valid: true, errors: [] })
  })

  it('should use custom validate function', () => {
    const validateFn = (): ValidationResult => ({ valid: false, errors: ['fail'] })
    const handler = createHandler('test-type', async () => {}, validateFn)

    expect(handler.validate({} as any)).toEqual({ valid: false, errors: ['fail'] })
  })
})

describe('createVersionedHandler', () => {
  it('should create handler with version range', () => {
    const handler = createVersionedHandler('test-type', 2, 5, async () => {})

    expect(handler.type).toBe('test-type')
    expect(handler.minVersion).toBe(2)
    expect(handler.maxVersion).toBe(5)
  })
})

// ─── Integration Tests ───────────────────────────────────────────────────────

describe('Integration: Version Migration', () => {
  let registry: ChangeHandlerRegistry

  beforeEach(() => {
    registry = new ChangeHandlerRegistry()
  })

  it('should process v0 changes with legacy handler', async () => {
    const v0Handler = createVersionedHandler('record', 0, 0, async (change, ctx) => {
      ctx.emit('processed', { version: 0, id: change.id })
    })
    const v1Handler = createVersionedHandler('record', 1, Infinity, async (change, ctx) => {
      ctx.emit('processed', { version: 1, id: change.id })
    })

    registry.register(v0Handler)
    registry.register(v1Handler)

    const v0Change = createMockChange('record', undefined) // Legacy
    const v1Change = createMockChange('record', 1)

    const ctx0 = createMockContext()
    const ctx1 = createMockContext()

    await registry.process(v0Change, ctx0)
    await registry.process(v1Change, ctx1)

    expect(ctx0.emit).toHaveBeenCalledWith('processed', { version: 0, id: v0Change.id })
    expect(ctx1.emit).toHaveBeenCalledWith('processed', { version: 1, id: v1Change.id })
  })

  it('should allow handler upgrade for new versions', async () => {
    // V1 handler that can also process v0
    const handler: ChangeHandler<{ data: string }> = {
      type: 'record',
      minVersion: 0,
      maxVersion: 1,
      canHandle: () => true,
      process: async (change, ctx) => {
        // Transform v0 format to v1 internally
        const payload = change.payload
        const normalizedData =
          change.protocolVersion === 0
            ? (payload as any).legacyData // v0 used different field name
            : payload.data
        ctx.emit('processed', { data: normalizedData })
      },
      validate: () => ({ valid: true, errors: [] })
    }

    registry.register(handler)

    const v0Change = createMockChange('record', 0)
    ;(v0Change.payload as any) = { legacyData: 'old format' }

    const v1Change = createMockChange('record', 1)
    ;(v1Change.payload as any) = { data: 'new format' }

    const ctx0 = createMockContext()
    const ctx1 = createMockContext()

    await registry.process(v0Change, ctx0)
    await registry.process(v1Change, ctx1)

    expect(ctx0.emit).toHaveBeenCalledWith('processed', { data: 'old format' })
    expect(ctx1.emit).toHaveBeenCalledWith('processed', { data: 'new format' })
  })
})
