import { describe, it, expect, vi } from 'vitest'
import {
  createInitialSyncManager,
  type SyncProgress,
  type InitialSyncMessage
} from './InitialSyncManager'

describe('InitialSyncManager', () => {
  describe('initial state', () => {
    it('starts in connecting phase', () => {
      const manager = createInitialSyncManager()
      const progress = manager.getProgress()
      expect(progress.phase).toBe('connecting')
      expect(progress.roomsSynced).toBe(0)
      expect(progress.roomsTotal).toBe(0)
      expect(progress.bytesReceived).toBe(0)
    })
  })

  describe('progress tracking', () => {
    it('tracks room sync progress', () => {
      const manager = createInitialSyncManager()

      manager.handleMessage({
        type: 'initial-sync',
        room: 'room1',
        update: new Uint8Array(100)
      })

      const p = manager.getProgress()
      expect(p.phase).toBe('syncing')
      expect(p.roomsSynced).toBe(1)
      expect(p.bytesReceived).toBe(100)
    })

    it('counts unique rooms synced', () => {
      const manager = createInitialSyncManager()

      manager.handleMessage({
        type: 'initial-sync',
        room: 'room1',
        update: new Uint8Array(50)
      })
      manager.handleMessage({
        type: 'initial-sync',
        room: 'room2',
        update: new Uint8Array(75)
      })

      const p = manager.getProgress()
      expect(p.roomsSynced).toBe(2)
      expect(p.bytesReceived).toBe(125)
    })

    it('does not double-count duplicate room messages', () => {
      const manager = createInitialSyncManager()

      manager.handleMessage({
        type: 'initial-sync',
        room: 'room1',
        update: new Uint8Array(50)
      })
      // Second message for same room (e.g. incremental update)
      manager.handleMessage({
        type: 'initial-sync',
        room: 'room1',
        update: new Uint8Array(30)
      })

      const p = manager.getProgress()
      expect(p.roomsSynced).toBe(1) // Only 1 unique room
      expect(p.bytesReceived).toBe(80) // Bytes still accumulate
    })

    it('handles node-changes messages', () => {
      const manager = createInitialSyncManager()

      manager.handleMessage({
        type: 'node-changes',
        room: 'room1',
        changes: [
          { id: '1', data: 'test' },
          { id: '2', data: 'test2' }
        ]
      })

      const p = manager.getProgress()
      expect(p.bytesReceived).toBeGreaterThan(0)
    })

    it('completes on initial-sync-complete message', () => {
      const manager = createInitialSyncManager()

      manager.handleMessage({
        type: 'initial-sync',
        room: 'room1',
        update: new Uint8Array(100)
      })

      manager.handleMessage({
        type: 'initial-sync-complete',
        roomCount: 5
      })

      const p = manager.getProgress()
      expect(p.phase).toBe('complete')
      expect(p.roomsTotal).toBe(5)
    })
  })

  describe('listeners', () => {
    it('notifies listeners on progress changes', () => {
      const manager = createInitialSyncManager()
      const updates: SyncProgress[] = []

      manager.onProgress((p) => updates.push(p))

      manager.handleMessage({
        type: 'initial-sync',
        room: 'room1',
        update: new Uint8Array(50)
      })
      manager.handleMessage({
        type: 'initial-sync-complete',
        roomCount: 1
      })

      // First call is immediate (current state), then 2 more from messages
      expect(updates.length).toBe(3)
      expect(updates[0].phase).toBe('connecting')
      expect(updates[1].phase).toBe('syncing')
      expect(updates[2].phase).toBe('complete')
    })

    it('unsubscribe stops notifications', () => {
      const manager = createInitialSyncManager()
      const listener = vi.fn()

      const unsub = manager.onProgress(listener)
      expect(listener).toHaveBeenCalledTimes(1) // immediate

      unsub()

      manager.handleMessage({
        type: 'initial-sync',
        room: 'room1',
        update: new Uint8Array(50)
      })

      // Still only called once (the initial call)
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('provides snapshot copies (not references)', () => {
      const manager = createInitialSyncManager()
      const updates: SyncProgress[] = []

      manager.onProgress((p) => updates.push(p))

      manager.handleMessage({
        type: 'initial-sync',
        room: 'room1',
        update: new Uint8Array(50)
      })

      // Each update is a separate object
      expect(updates[0]).not.toBe(updates[1])
      expect(updates[0].phase).toBe('connecting')
      expect(updates[1].phase).toBe('syncing')
    })
  })

  describe('error handling', () => {
    it('transitions to error phase', () => {
      const manager = createInitialSyncManager()
      const error = new Error('Connection lost')

      manager.setError(error)

      const p = manager.getProgress()
      expect(p.phase).toBe('error')
      expect(p.error).toBe(error)
    })

    it('notifies listeners on error', () => {
      const manager = createInitialSyncManager()
      const listener = vi.fn()

      manager.onProgress(listener)
      manager.setError(new Error('fail'))

      // Initial call + error notification
      expect(listener).toHaveBeenCalledTimes(2)
      expect(listener.mock.calls[1][0].phase).toBe('error')
    })
  })

  describe('reset', () => {
    it('resets to initial state and clears listeners', () => {
      const manager = createInitialSyncManager()
      const listener = vi.fn()

      manager.onProgress(listener)
      manager.handleMessage({
        type: 'initial-sync',
        room: 'room1',
        update: new Uint8Array(50)
      })

      manager.reset()

      const p = manager.getProgress()
      expect(p.phase).toBe('connecting')
      expect(p.roomsSynced).toBe(0)

      // Listener should not fire after reset
      manager.handleMessage({
        type: 'initial-sync',
        room: 'room2',
        update: new Uint8Array(50)
      })

      // listener was called: 1 (initial) + 1 (first message) = 2
      // After reset, no more calls
      expect(listener).toHaveBeenCalledTimes(2)
    })
  })

  describe('start', () => {
    it('resets progress and notifies', () => {
      const manager = createInitialSyncManager()

      manager.handleMessage({
        type: 'initial-sync',
        room: 'room1',
        update: new Uint8Array(50)
      })

      const listener = vi.fn()
      manager.onProgress(listener)

      manager.start()

      // Last call should have connecting phase
      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0]
      expect(lastCall.phase).toBe('connecting')
      expect(lastCall.roomsSynced).toBe(0)
    })
  })
})
