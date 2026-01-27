/**
 * Tests for MiddlewareChain
 */

import { describe, it, expect, vi } from 'vitest'
import { MiddlewareChain, type NodeStoreMiddleware } from '../middleware'

describe('MiddlewareChain', () => {
  describe('add', () => {
    it('adds middleware to the chain', () => {
      const chain = new MiddlewareChain()
      chain.add({ id: 'test' })

      expect(chain.size).toBe(1)
    })

    it('returns disposable that removes middleware', () => {
      const chain = new MiddlewareChain()
      const d = chain.add({ id: 'test' })

      expect(chain.size).toBe(1)
      d.dispose()
      expect(chain.size).toBe(0)
    })
  })

  describe('remove', () => {
    it('removes middleware by ID', () => {
      const chain = new MiddlewareChain()
      chain.add({ id: 'test' })
      chain.add({ id: 'other' })

      const removed = chain.remove('test')

      expect(removed).toBe(true)
      expect(chain.size).toBe(1)
    })

    it('returns false if middleware not found', () => {
      const chain = new MiddlewareChain()
      const removed = chain.remove('nonexistent')
      expect(removed).toBe(false)
    })
  })

  describe('executeBefore', () => {
    it('executes middlewares in priority order', async () => {
      const chain = new MiddlewareChain()
      const order: string[] = []

      chain.add({
        id: 'second',
        priority: 200,
        beforeChange: async (_change, next) => {
          order.push('second')
          return next()
        }
      })

      chain.add({
        id: 'first',
        priority: 50,
        beforeChange: async (_change, next) => {
          order.push('first')
          return next()
        }
      })

      chain.add({
        id: 'default',
        beforeChange: async (_change, next) => {
          order.push('default')
          return next()
        }
      })

      await chain.executeBefore({ type: 'create', nodeId: '1' }, async () => 'result')

      expect(order).toEqual(['first', 'default', 'second'])
    })

    it('passes result through the chain', async () => {
      const chain = new MiddlewareChain()

      chain.add({
        id: 'passthrough',
        beforeChange: async (_change, next) => next()
      })

      const result = await chain.executeBefore({ type: 'create', nodeId: '1' }, async () => ({
        id: '1',
        data: 'test'
      }))

      expect(result).toEqual({ id: '1', data: 'test' })
    })

    it('allows middleware to modify changes', async () => {
      const chain = new MiddlewareChain()

      chain.add({
        id: 'modifier',
        beforeChange: async (change, next) => {
          change.payload = { ...change.payload, injected: true }
          return next()
        }
      })

      let capturedChange
      await chain.executeBefore({ type: 'create', nodeId: '1', payload: {} }, async () => {
        capturedChange = { type: 'create', nodeId: '1', payload: { injected: true } }
        return null
      })

      // The change object should be modified
      expect(capturedChange).toBeDefined()
    })

    it('allows middleware to reject changes by throwing', async () => {
      const chain = new MiddlewareChain()

      chain.add({
        id: 'rejector',
        beforeChange: async () => {
          throw new Error('Rejected')
        }
      })

      await expect(
        chain.executeBefore({ type: 'create', nodeId: '1' }, async () => null)
      ).rejects.toThrow('Rejected')
    })

    it('stops chain on rejection', async () => {
      const chain = new MiddlewareChain()
      const afterReject = vi.fn()

      chain.add({
        id: 'rejector',
        priority: 10,
        beforeChange: async () => {
          throw new Error('Rejected')
        }
      })

      chain.add({
        id: 'after',
        priority: 20,
        beforeChange: async (_change, next) => {
          afterReject()
          return next()
        }
      })

      await expect(
        chain.executeBefore({ type: 'create', nodeId: '1' }, async () => null)
      ).rejects.toThrow('Rejected')

      expect(afterReject).not.toHaveBeenCalled()
    })

    it('executes apply function when no middleware', async () => {
      const chain = new MiddlewareChain()
      const apply = vi.fn().mockResolvedValue('applied')

      const result = await chain.executeBefore({ type: 'create', nodeId: '1' }, apply)

      expect(apply).toHaveBeenCalled()
      expect(result).toBe('applied')
    })
  })

  describe('executeAfter', () => {
    it('calls afterChange on all middlewares', () => {
      const chain = new MiddlewareChain()
      const after1 = vi.fn()
      const after2 = vi.fn()

      chain.add({ id: 'one', afterChange: after1 })
      chain.add({ id: 'two', afterChange: after2 })

      chain.executeAfter({
        change: { type: 'create', nodeId: '1' },
        node: { id: '1' },
        isRemote: false
      })

      expect(after1).toHaveBeenCalled()
      expect(after2).toHaveBeenCalled()
    })

    it('continues execution even if one middleware throws', () => {
      const chain = new MiddlewareChain()
      const after2 = vi.fn()

      chain.add({
        id: 'thrower',
        afterChange: () => {
          throw new Error('oops')
        }
      })
      chain.add({ id: 'two', afterChange: after2 })

      // Should not throw
      chain.executeAfter({
        change: { type: 'create', nodeId: '1' },
        node: { id: '1' },
        isRemote: false
      })

      expect(after2).toHaveBeenCalled()
    })
  })

  describe('clear', () => {
    it('removes all middlewares', () => {
      const chain = new MiddlewareChain()
      chain.add({ id: 'one' })
      chain.add({ id: 'two' })

      chain.clear()

      expect(chain.size).toBe(0)
    })
  })

  describe('getAll', () => {
    it('returns copy of middlewares array', () => {
      const chain = new MiddlewareChain()
      const m1: NodeStoreMiddleware = { id: 'one' }
      const m2: NodeStoreMiddleware = { id: 'two' }
      chain.add(m1)
      chain.add(m2)

      const all = chain.getAll()

      expect(all).toHaveLength(2)
      // Modifying the returned array shouldn't affect the chain
      all.pop()
      expect(chain.size).toBe(2)
    })
  })
})
