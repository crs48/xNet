import { describe, expect, it, vi } from 'vitest'
import { createSyncLifecycleState, deriveSyncLifecyclePhase } from './sync-runtime'

describe('sync-runtime', () => {
  describe('deriveSyncLifecyclePhase', () => {
    it('maps the canonical startup and recovery phases', () => {
      expect(
        deriveSyncLifecyclePhase({
          started: false,
          stopped: false,
          localReady: false,
          everConnected: false,
          connectionStatus: 'disconnected'
        })
      ).toBe('idle')

      expect(
        deriveSyncLifecyclePhase({
          started: true,
          stopped: false,
          localReady: false,
          everConnected: false,
          connectionStatus: 'disconnected'
        })
      ).toBe('starting')

      expect(
        deriveSyncLifecyclePhase({
          started: true,
          stopped: false,
          localReady: true,
          everConnected: false,
          connectionStatus: 'disconnected'
        })
      ).toBe('local-ready')

      expect(
        deriveSyncLifecyclePhase({
          started: true,
          stopped: false,
          localReady: true,
          everConnected: false,
          connectionStatus: 'connecting'
        })
      ).toBe('connecting')

      expect(
        deriveSyncLifecyclePhase({
          started: true,
          stopped: false,
          localReady: true,
          everConnected: true,
          connectionStatus: 'connected'
        })
      ).toBe('healthy')

      expect(
        deriveSyncLifecyclePhase({
          started: true,
          stopped: false,
          localReady: true,
          everConnected: true,
          connectionStatus: 'connected',
          replaying: true
        })
      ).toBe('replaying')

      expect(
        deriveSyncLifecyclePhase({
          started: true,
          stopped: false,
          localReady: true,
          everConnected: true,
          connectionStatus: 'error'
        })
      ).toBe('degraded')

      expect(
        deriveSyncLifecyclePhase({
          started: true,
          stopped: false,
          localReady: true,
          everConnected: true,
          connectionStatus: 'disconnected'
        })
      ).toBe('degraded')

      expect(
        deriveSyncLifecyclePhase({
          started: true,
          stopped: true,
          localReady: true,
          everConnected: true,
          connectionStatus: 'disconnected'
        })
      ).toBe('stopped')
    })
  })

  describe('createSyncLifecycleState', () => {
    it('keeps the transition timestamp stable until the snapshot changes', () => {
      const now = vi
        .spyOn(Date, 'now')
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(250)
        .mockReturnValueOnce(400)

      const initial = createSyncLifecycleState({
        started: true,
        stopped: false,
        localReady: false,
        everConnected: false,
        connectionStatus: 'disconnected'
      })

      const unchanged = createSyncLifecycleState(
        {
          started: true,
          stopped: false,
          localReady: false,
          everConnected: false,
          connectionStatus: 'disconnected'
        },
        initial
      )

      const changed = createSyncLifecycleState(
        {
          started: true,
          stopped: false,
          localReady: true,
          everConnected: false,
          connectionStatus: 'connecting'
        },
        unchanged
      )

      expect(initial.lastTransitionAt).toBe(100)
      expect(unchanged.lastTransitionAt).toBe(100)
      expect(changed.lastTransitionAt).toBe(250)

      now.mockRestore()
    })
  })
})
