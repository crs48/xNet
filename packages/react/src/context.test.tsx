import type { SyncManager } from './sync/sync-manager'
import type { DID } from '@xnetjs/core'
import type { Identity } from '@xnetjs/identity'
import { renderHook, waitFor } from '@testing-library/react'
import { MemoryNodeStorageAdapter } from '@xnetjs/data'
import React, { type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { XNetProvider, useXNet, type XNetConfig } from './context'

const TEST_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID
const TEST_KEY = new Uint8Array(32).fill(1)
const CONNECTED_LIFECYCLE = {
  phase: 'healthy' as const,
  connectionStatus: 'connected' as const,
  replaying: false,
  lastTransitionAt: 0
}

function createWrapper(config: XNetConfig) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(XNetProvider, { config, children })
  }
}

function createSyncManagerStub(): SyncManager {
  return {
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    track: vi.fn(),
    untrack: vi.fn(),
    acquire: vi.fn(async () => new Y.Doc()),
    release: vi.fn(),
    getAwareness: vi.fn(() => new Awareness(new Y.Doc())),
    onAwarenessSnapshot: vi.fn(() => () => {}),
    requestBlobs: vi.fn(async () => undefined),
    announceBlobs: vi.fn(),
    status: 'connected',
    lifecycle: CONNECTED_LIFECYCLE,
    poolSize: 0,
    trackedCount: 0,
    queueSize: 0,
    pendingBlobCount: 0,
    on: vi.fn(() => () => {})
  }
}

describe('XNetContext', () => {
  it('should throw error when useXNet is used outside provider', () => {
    expect(() => {
      renderHook(() => useXNet())
    }).toThrow('useXNet must be used within an XNetProvider')
  })

  it('should provide context value when inside provider', async () => {
    const { result } = renderHook(() => useXNet(), {
      wrapper: createWrapper({
        nodeStorage: new MemoryNodeStorageAdapter(),
        authorDID: TEST_DID,
        signingKey: TEST_KEY
      })
    })

    // Initially not ready
    expect(result.current.nodeStore).toBeNull()

    // Wait for NodeStore to initialize
    await waitFor(() => {
      expect(result.current.nodeStoreReady).toBe(true)
    })

    expect(result.current.nodeStore).not.toBeNull()
    expect(result.current.identity).toBeUndefined()
    expect(result.current.runtimeStatus.requestedMode).toBe('worker')
    expect(result.current.runtimeStatus.activeMode).toBe('main-thread')
    expect(result.current.runtimeStatus.usedFallback).toBe(true)
  })

  it('should provide identity when configured', async () => {
    const mockIdentity: Identity = {
      did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      publicKey: new Uint8Array(32),
      created: Date.now()
    }

    const { result } = renderHook(() => useXNet(), {
      wrapper: createWrapper({
        nodeStorage: new MemoryNodeStorageAdapter(),
        authorDID: TEST_DID,
        signingKey: TEST_KEY,
        identity: mockIdentity
      })
    })

    expect(result.current.identity).toBe(mockIdentity)
  })

  it('should expose worker fallback instead of silently drifting', async () => {
    const { result } = renderHook(() => useXNet(), {
      wrapper: createWrapper({
        nodeStorage: new MemoryNodeStorageAdapter(),
        authorDID: TEST_DID,
        signingKey: TEST_KEY,
        runtime: {
          mode: 'worker',
          fallback: 'main-thread'
        }
      })
    })

    await waitFor(() => {
      expect(result.current.runtimeStatus.phase).toBe('ready')
      expect(result.current.runtimeStatus.usedFallback).toBe(true)
    })

    expect(result.current.runtimeStatus.requestedMode).toBe('worker')
    expect(result.current.runtimeStatus.activeMode).toBe('main-thread')
    expect(result.current.runtimeStatus.reason).toContain('Worker runtime unavailable')
  })

  it('should fail closed when fallback is disabled', async () => {
    const { result } = renderHook(() => useXNet(), {
      wrapper: createWrapper({
        nodeStorage: new MemoryNodeStorageAdapter(),
        authorDID: TEST_DID,
        signingKey: TEST_KEY,
        runtime: {
          mode: 'worker',
          fallback: 'error'
        }
      })
    })

    await waitFor(() => {
      expect(result.current.runtimeStatus.phase).toBe('error')
    })

    expect(result.current.nodeStore).toBeNull()
    expect(result.current.nodeStoreReady).toBe(false)
    expect(result.current.runtimeStatus.activeMode).toBeNull()
    expect(result.current.runtimeStatus.reason).toContain('Worker runtime unavailable')
  })

  it('should respect explicit ipc runtime when an external sync manager is provided', async () => {
    const syncManager = createSyncManagerStub()

    const { result } = renderHook(() => useXNet(), {
      wrapper: createWrapper({
        nodeStorage: new MemoryNodeStorageAdapter(),
        authorDID: TEST_DID,
        signingKey: TEST_KEY,
        runtime: {
          mode: 'ipc',
          fallback: 'error'
        },
        syncManager
      })
    })

    await waitFor(() => {
      expect(result.current.runtimeStatus.phase).toBe('ready')
      expect(result.current.runtimeStatus.activeMode).toBe('ipc')
    })

    expect(result.current.runtimeStatus.usedFallback).toBe(false)
  })
})
