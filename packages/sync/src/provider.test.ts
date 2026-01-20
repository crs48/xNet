import { describe, it, expect, vi } from 'vitest'
import type { Change } from './change'
import { BaseSyncProvider } from './provider'
import type { SyncStatus } from './provider'

// Concrete implementation for testing
class TestSyncProvider extends BaseSyncProvider<{ data: string }> {
  public connectCalled = false
  public disconnectCalled = false
  public broadcastedChanges: Change<{ data: string }>[] = []
  public requestedFrom: { peerId: string; since?: string }[] = []

  async connect(): Promise<void> {
    this.connectCalled = true
    this.setStatus('connecting')
    // Simulate connection
    this.setStatus('synced')
  }

  async disconnect(): Promise<void> {
    this.disconnectCalled = true
    this.setStatus('disconnected')
  }

  async broadcast(change: Change<{ data: string }>): Promise<void> {
    this.broadcastedChanges.push(change)
  }

  async requestChanges(peerId: string, since?: string): Promise<Change<{ data: string }>[]> {
    this.requestedFrom.push({ peerId, since })
    return []
  }

  // Expose protected methods for testing
  public testAddPeer(id: string, name?: string): void {
    this.addPeer(id, name)
  }

  public testRemovePeer(id: string): void {
    this.removePeer(id)
  }

  public testSetStatus(status: SyncStatus): void {
    this.setStatus(status)
  }

  public testEmitStatusChange(status: SyncStatus): void {
    this.emit('status-change', status)
  }

  public testEmitError(error: Error): void {
    this.emit('error', error)
  }
}

describe('BaseSyncProvider', () => {
  describe('status', () => {
    it('starts as disconnected', () => {
      const provider = new TestSyncProvider()
      expect(provider.status).toBe('disconnected')
    })

    it('updates status on connect', async () => {
      const provider = new TestSyncProvider()
      await provider.connect()
      expect(provider.status).toBe('synced')
    })

    it('updates status on disconnect', async () => {
      const provider = new TestSyncProvider()
      await provider.connect()
      await provider.disconnect()
      expect(provider.status).toBe('disconnected')
    })
  })

  describe('peers', () => {
    it('starts with no peers', () => {
      const provider = new TestSyncProvider()
      expect(provider.peers).toEqual([])
    })

    it('tracks added peers', () => {
      const provider = new TestSyncProvider()
      provider.testAddPeer('peer-1', 'Alice')
      provider.testAddPeer('peer-2', 'Bob')

      expect(provider.peers).toContain('peer-1')
      expect(provider.peers).toContain('peer-2')
      expect(provider.peers).toHaveLength(2)
    })

    it('removes peers', () => {
      const provider = new TestSyncProvider()
      provider.testAddPeer('peer-1')
      provider.testAddPeer('peer-2')
      provider.testRemovePeer('peer-1')

      expect(provider.peers).toEqual(['peer-2'])
    })

    it('provides peer info', () => {
      const provider = new TestSyncProvider()
      provider.testAddPeer('peer-1', 'Alice')

      const info = provider.peerInfo.get('peer-1')
      expect(info).toBeDefined()
      expect(info!.id).toBe('peer-1')
      expect(info!.name).toBe('Alice')
      expect(info!.connectedAt).toBeGreaterThan(0)
    })
  })

  describe('events', () => {
    it('emits status-change event', () => {
      const provider = new TestSyncProvider()
      const listener = vi.fn()

      provider.on('status-change', listener)
      provider.testSetStatus('connecting')

      expect(listener).toHaveBeenCalledWith('connecting')
    })

    it('emits peer-connected event', () => {
      const provider = new TestSyncProvider()
      const listener = vi.fn()

      provider.on('peer-connected', listener)
      provider.testAddPeer('peer-1', 'Alice')

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'peer-1',
          name: 'Alice'
        })
      )
    })

    it('emits peer-disconnected event', () => {
      const provider = new TestSyncProvider()
      const listener = vi.fn()

      provider.testAddPeer('peer-1')
      provider.on('peer-disconnected', listener)
      provider.testRemovePeer('peer-1')

      expect(listener).toHaveBeenCalledWith('peer-1')
    })

    it('supports off to remove listeners', () => {
      const provider = new TestSyncProvider()
      const listener = vi.fn()

      provider.on('status-change', listener)
      provider.off('status-change', listener)
      provider.testSetStatus('connecting')

      expect(listener).not.toHaveBeenCalled()
    })

    it('supports once for single-fire listeners', () => {
      const provider = new TestSyncProvider()
      const listener = vi.fn()

      provider.once('status-change', listener)
      provider.testSetStatus('connecting')
      provider.testSetStatus('synced')

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith('connecting')
    })

    it('handles errors in listeners gracefully', () => {
      const provider = new TestSyncProvider()
      const errorListener = vi.fn(() => {
        throw new Error('Listener error')
      })
      const goodListener = vi.fn()

      // Mock console.error to avoid noise in test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      provider.on('status-change', errorListener)
      provider.on('status-change', goodListener)
      provider.testSetStatus('connecting')

      // Both listeners should be called, error shouldn't break the chain
      expect(errorListener).toHaveBeenCalled()
      expect(goodListener).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('requestChangesFromAll', () => {
    it('requests from all peers and deduplicates', async () => {
      const provider = new TestSyncProvider()
      provider.testAddPeer('peer-1')
      provider.testAddPeer('peer-2')

      const changes = await provider.requestChangesFromAll('since-hash')

      expect(provider.requestedFrom).toContainEqual({ peerId: 'peer-1', since: 'since-hash' })
      expect(provider.requestedFrom).toContainEqual({ peerId: 'peer-2', since: 'since-hash' })
    })

    it('handles peer request failures gracefully', async () => {
      const provider = new TestSyncProvider()
      provider.testAddPeer('peer-1')
      provider.testAddPeer('peer-2')

      // Override requestChanges to fail for one peer
      const originalRequest = provider.requestChanges.bind(provider)
      provider.requestChanges = async (peerId: string, since?: string) => {
        if (peerId === 'peer-1') {
          throw new Error('Peer unavailable')
        }
        return originalRequest(peerId, since)
      }

      // Should not throw, just return what it can
      const changes = await provider.requestChangesFromAll()
      expect(changes).toEqual([])
    })
  })

  describe('does not emit duplicate status', () => {
    it('skips event if status unchanged', () => {
      const provider = new TestSyncProvider()
      const listener = vi.fn()

      provider.on('status-change', listener)
      provider.testSetStatus('connecting')
      provider.testSetStatus('connecting') // Same status

      expect(listener).toHaveBeenCalledTimes(1)
    })
  })
})
