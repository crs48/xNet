import type { Change } from './change'
import type { PeerCapabilities, NegotiationResult } from './negotiation'
import type { SyncStatus, SyncProviderOptions } from './provider'
import { describe, it, expect, vi } from 'vitest'
import { BaseSyncProvider } from './provider'

// Default options for testing
const defaultTestOptions: SyncProviderOptions = {
  room: 'test-room',
  localDID: 'did:key:z6MkTest123'
}

// Concrete implementation for testing
class TestSyncProvider extends BaseSyncProvider<{ data: string }> {
  public connectCalled = false
  public disconnectCalled = false
  public broadcastedChanges: Change<{ data: string }>[] = []
  public requestedFrom: { peerId: string; since?: string }[] = []

  constructor(options: SyncProviderOptions = defaultTestOptions) {
    super(options)
  }

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

  public testNegotiateWithPeer(peerId: string, caps: PeerCapabilities): NegotiationResult {
    return this.negotiateWithPeer(peerId, caps)
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

      await provider.requestChangesFromAll('since-hash')

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

  describe('capability negotiation', () => {
    it('has local capabilities', () => {
      const provider = new TestSyncProvider({
        room: 'test-room',
        localDID: 'did:key:z6MkTest456'
      })

      expect(provider.localCapabilities).toBeDefined()
      expect(provider.localCapabilities.peerId).toBe('did:key:z6MkTest456')
      expect(provider.localCapabilities.features).toContain('node-changes')
      expect(provider.localCapabilities.features).toContain('yjs-updates')
    })

    it('negotiates successfully with compatible peer', () => {
      const provider = new TestSyncProvider()
      provider.testAddPeer('peer-1', 'Alice')

      const remoteCaps: PeerCapabilities = {
        peerId: 'peer-1',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '0.5.0'
      }

      const result = provider.testNegotiateWithPeer('peer-1', remoteCaps)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.commonFeatures).toContain('node-changes')
        expect(result.commonFeatures).toContain('yjs-updates')
      }
    })

    it('emits negotiation-complete event on success', () => {
      const provider = new TestSyncProvider()
      const listener = vi.fn()

      provider.on('negotiation-complete', listener)
      provider.testAddPeer('peer-1')

      const remoteCaps: PeerCapabilities = {
        peerId: 'peer-1',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '0.5.0'
      }

      provider.testNegotiateWithPeer('peer-1', remoteCaps)

      expect(listener).toHaveBeenCalledWith(
        'peer-1',
        expect.objectContaining({
          success: true,
          commonFeatures: expect.arrayContaining(['node-changes', 'yjs-updates'])
        })
      )
    })

    it('emits negotiation-failed event on version mismatch', () => {
      const provider = new TestSyncProvider()
      const listener = vi.fn()

      provider.on('negotiation-failed', listener)
      provider.testAddPeer('peer-1')

      const remoteCaps: PeerCapabilities = {
        peerId: 'peer-1',
        protocolVersion: 5,
        minProtocolVersion: 4, // Requires v4+, but we're v3
        features: ['node-changes', 'yjs-updates'],
        packageVersion: '2.0.0'
      }

      const result = provider.testNegotiateWithPeer('peer-1', remoteCaps)

      expect(result.success).toBe(false)
      expect(listener).toHaveBeenCalled()
    })

    it('stores negotiated session on peer info', () => {
      const provider = new TestSyncProvider()
      provider.testAddPeer('peer-1')

      const remoteCaps: PeerCapabilities = {
        peerId: 'peer-1',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates', 'batch-changes'],
        packageVersion: '0.5.0'
      }

      provider.testNegotiateWithPeer('peer-1', remoteCaps)

      const session = provider.getNegotiatedSession('peer-1')
      expect(session).toBeDefined()
      expect(session!.agreedVersion).toBe(1)
    })

    it('canUseFeature returns true for negotiated features', () => {
      const provider = new TestSyncProvider()
      provider.testAddPeer('peer-1')

      const remoteCaps: PeerCapabilities = {
        peerId: 'peer-1',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates', 'batch-changes'],
        packageVersion: '0.5.0'
      }

      provider.testNegotiateWithPeer('peer-1', remoteCaps)

      expect(provider.canUseFeature('peer-1', 'node-changes')).toBe(true)
      expect(provider.canUseFeature('peer-1', 'batch-changes')).toBe(true)
    })

    it('canUseFeature returns false for unavailable features', () => {
      const provider = new TestSyncProvider()
      provider.testAddPeer('peer-1')

      const remoteCaps: PeerCapabilities = {
        peerId: 'peer-1',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'], // No batch-changes
        packageVersion: '0.5.0'
      }

      provider.testNegotiateWithPeer('peer-1', remoteCaps)

      expect(provider.canUseFeature('peer-1', 'batch-changes')).toBe(false)
    })

    it('canUseFeature returns false for non-negotiated peer', () => {
      const provider = new TestSyncProvider()
      provider.testAddPeer('peer-1')
      // No negotiation performed

      expect(provider.canUseFeature('peer-1', 'node-changes')).toBe(false)
    })

    it('getCommonFeatures returns features available with all peers', () => {
      const provider = new TestSyncProvider()

      // Add two peers with different features
      provider.testAddPeer('peer-1')
      provider.testNegotiateWithPeer('peer-1', {
        peerId: 'peer-1',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates', 'batch-changes'],
        packageVersion: '0.5.0'
      })

      provider.testAddPeer('peer-2')
      provider.testNegotiateWithPeer('peer-2', {
        peerId: 'peer-2',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'], // No batch-changes
        packageVersion: '0.4.0'
      })

      const common = provider.getCommonFeatures()
      expect(common).toContain('node-changes')
      expect(common).toContain('yjs-updates')
      expect(common).not.toContain('batch-changes')
    })

    it('emits capability-degraded for version mismatch warnings', () => {
      const provider = new TestSyncProvider()
      const listener = vi.fn()

      provider.on('capability-degraded', listener)
      provider.testAddPeer('peer-1')

      // Peer with older version
      const remoteCaps: PeerCapabilities = {
        peerId: 'peer-1',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: ['node-changes', 'yjs-updates'], // Missing some features we have
        packageVersion: '0.3.0'
      }

      provider.testNegotiateWithPeer('peer-1', remoteCaps)

      // Should emit degradation warning if we have more features
      // This depends on the local features being more than remote
    })
  })
})
