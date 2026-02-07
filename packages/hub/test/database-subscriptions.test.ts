/**
 * @xnet/hub - DatabaseSubscriptionManager tests.
 */

import type { WebSocket } from 'ws'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DatabaseSubscriptionManager } from '../src/services/database-subscriptions'

const createMockWebSocket = (): WebSocket => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  return {
    readyState: 1, // OPEN
    send: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set())
      }
      listeners.get(event)!.add(handler)
    }),
    emit: (event: string, ...args: unknown[]) => {
      const handlers = listeners.get(event)
      if (handlers) {
        for (const handler of handlers) {
          handler(...args)
        }
      }
    }
  } as unknown as WebSocket & { emit: (event: string, ...args: unknown[]) => void }
}

describe('DatabaseSubscriptionManager', () => {
  let manager: DatabaseSubscriptionManager

  beforeEach(() => {
    manager = new DatabaseSubscriptionManager()
  })

  describe('subscribe', () => {
    it('should add a subscription', () => {
      const ws = createMockWebSocket()
      manager.subscribe(ws, 'db-1')

      expect(manager.getSubscriberCount('db-1')).toBe(1)
    })

    it('should track multiple subscriptions per database', () => {
      const ws1 = createMockWebSocket()
      const ws2 = createMockWebSocket()

      manager.subscribe(ws1, 'db-1')
      manager.subscribe(ws2, 'db-1')

      expect(manager.getSubscriberCount('db-1')).toBe(2)
    })

    it('should track subscriptions across databases', () => {
      const ws = createMockWebSocket()

      manager.subscribe(ws, 'db-1')
      manager.subscribe(ws, 'db-2')

      expect(manager.getActiveSubscriptions()).toContain('db-1')
      expect(manager.getActiveSubscriptions()).toContain('db-2')
    })
  })

  describe('unsubscribe', () => {
    it('should remove a subscription', () => {
      const ws = createMockWebSocket()
      manager.subscribe(ws, 'db-1')
      manager.unsubscribe(ws, 'db-1')

      expect(manager.getSubscriberCount('db-1')).toBe(0)
    })

    it('should handle unsubscribe for non-existent subscription', () => {
      const ws = createMockWebSocket()
      // Should not throw
      manager.unsubscribe(ws, 'db-1')
      expect(manager.getSubscriberCount('db-1')).toBe(0)
    })
  })

  describe('removeAllSubscriptions', () => {
    it('should remove all subscriptions for a socket', () => {
      const ws = createMockWebSocket()
      manager.subscribe(ws, 'db-1')
      manager.subscribe(ws, 'db-2')

      manager.removeAllSubscriptions(ws)

      expect(manager.getSubscriberCount('db-1')).toBe(0)
      expect(manager.getSubscriberCount('db-2')).toBe(0)
    })

    it('should not affect other sockets', () => {
      const ws1 = createMockWebSocket()
      const ws2 = createMockWebSocket()

      manager.subscribe(ws1, 'db-1')
      manager.subscribe(ws2, 'db-1')

      manager.removeAllSubscriptions(ws1)

      expect(manager.getSubscriberCount('db-1')).toBe(1)
    })
  })

  describe('notify', () => {
    it('should send notifications to subscribers', () => {
      const ws = createMockWebSocket()
      manager.subscribe(ws, 'db-1')

      manager.notify('db-1', [
        {
          type: 'insert',
          rowId: 'row-1',
          row: { id: 'row-1', sortKey: 'a0', cells: {}, createdAt: Date.now(), createdBy: 'test' }
        }
      ])

      expect(ws.send).toHaveBeenCalledTimes(1)
      const sentData = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0])
      expect(sentData.type).toBe('database-change')
      expect(sentData.databaseId).toBe('db-1')
      expect(sentData.changes).toHaveLength(1)
    })

    it('should not notify unsubscribed databases', () => {
      const ws = createMockWebSocket()
      manager.subscribe(ws, 'db-1')

      manager.notify('db-2', [{ type: 'insert', rowId: 'row-1' }])

      expect(ws.send).not.toHaveBeenCalled()
    })

    it('should filter notifications by subscription filter', () => {
      const ws = createMockWebSocket()
      manager.subscribe(ws, 'db-1', {
        operator: 'and',
        conditions: [{ columnId: 'status', operator: 'equals', value: 'active' }]
      })

      // This should be filtered out
      manager.notify('db-1', [
        {
          type: 'insert',
          rowId: 'row-1',
          row: {
            id: 'row-1',
            sortKey: 'a0',
            cells: { status: 'inactive' },
            createdAt: Date.now(),
            createdBy: 'test'
          }
        }
      ])

      expect(ws.send).not.toHaveBeenCalled()

      // This should pass the filter
      manager.notify('db-1', [
        {
          type: 'insert',
          rowId: 'row-2',
          row: {
            id: 'row-2',
            sortKey: 'a1',
            cells: { status: 'active' },
            createdAt: Date.now(),
            createdBy: 'test'
          }
        }
      ])

      expect(ws.send).toHaveBeenCalledTimes(1)
    })

    it('should always notify deletes regardless of filter', () => {
      const ws = createMockWebSocket()
      manager.subscribe(ws, 'db-1', {
        operator: 'and',
        conditions: [{ columnId: 'status', operator: 'equals', value: 'active' }]
      })

      manager.notify('db-1', [{ type: 'delete', rowId: 'row-1' }])

      expect(ws.send).toHaveBeenCalledTimes(1)
    })

    it('should notify multiple subscribers', () => {
      const ws1 = createMockWebSocket()
      const ws2 = createMockWebSocket()

      manager.subscribe(ws1, 'db-1')
      manager.subscribe(ws2, 'db-1')

      manager.notify('db-1', [
        {
          type: 'insert',
          rowId: 'row-1',
          row: { id: 'row-1', sortKey: 'a0', cells: {}, createdAt: Date.now(), createdBy: 'test' }
        }
      ])

      expect(ws1.send).toHaveBeenCalledTimes(1)
      expect(ws2.send).toHaveBeenCalledTimes(1)
    })
  })

  describe('cleanup on disconnect', () => {
    it('should cleanup subscriptions when socket closes', () => {
      const ws = createMockWebSocket() as WebSocket & {
        emit: (event: string, ...args: unknown[]) => void
      }
      manager.subscribe(ws, 'db-1')

      expect(manager.getSubscriberCount('db-1')).toBe(1)

      // Simulate socket close
      ws.emit('close')

      expect(manager.getSubscriberCount('db-1')).toBe(0)
    })
  })

  describe('getActiveSubscriptions', () => {
    it('should return all databases with active subscriptions', () => {
      const ws = createMockWebSocket()
      manager.subscribe(ws, 'db-1')
      manager.subscribe(ws, 'db-2')
      manager.subscribe(ws, 'db-3')

      const active = manager.getActiveSubscriptions()

      expect(active).toHaveLength(3)
      expect(active).toContain('db-1')
      expect(active).toContain('db-2')
      expect(active).toContain('db-3')
    })

    it('should not include databases with no subscribers', () => {
      const ws = createMockWebSocket()
      manager.subscribe(ws, 'db-1')
      manager.unsubscribe(ws, 'db-1')

      const active = manager.getActiveSubscriptions()

      expect(active).not.toContain('db-1')
    })
  })
})
