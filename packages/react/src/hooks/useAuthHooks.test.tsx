import type { XNetContextValue } from '../context'
import type { AuthDecision, AuthTrace, DID } from '@xnetjs/core'
import type { AuthGrant } from '@xnetjs/data'
import { act, renderHook, waitFor } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { XNetContext } from '../context'
import { useCan } from './useCan'
import { useCanEdit } from './useCanEdit'
import { useGrants } from './useGrants'

const did = 'did:key:z6Mkfakesubject' as DID

const decision = (
  action: AuthDecision['action'],
  allowed: boolean,
  cached = false
): AuthDecision => ({
  allowed,
  action,
  subject: did,
  resource: 'node-1',
  roles: allowed ? ['owner'] : [],
  grants: [],
  reasons: allowed ? [] : ['DENY_NO_ROLE_MATCH'],
  cached,
  evaluatedAt: Date.now(),
  duration: 1
})

const trace: AuthTrace = {
  ...decision('read', true),
  steps: []
}

function createWrapper(input?: {
  can?: (action: AuthDecision['action']) => Promise<AuthDecision>
  listGrants?: () => Promise<AuthGrant[]>
}) {
  let listener: ((event: unknown) => void) | null = null

  const auth = {
    can: vi.fn(async ({ action }: { action: AuthDecision['action'] }) =>
      input?.can ? input.can(action) : decision(action, action !== 'delete')
    ),
    explain: vi.fn(async () => trace),
    grant: vi.fn(async () => ({
      id: 'grant-1',
      issuer: did,
      grantee: 'did:key:z6Mkother' as DID,
      resource: 'node-1',
      resourceSchema: 'xnet://test/Task',
      actions: ['read'],
      expiresAt: 0,
      revokedAt: 0,
      proofDepth: 0
    })),
    revoke: vi.fn(async () => undefined),
    listGrants: vi.fn(async () => (input?.listGrants ? input.listGrants() : [])),
    listIssuedGrants: vi.fn(async () => []),
    listReceivedGrants: vi.fn(async () => []),
    getOfflinePolicy: vi.fn(),
    setOfflinePolicy: vi.fn()
  }

  const store = {
    auth,
    subscribe: vi.fn((next: (event: unknown) => void) => {
      listener = next
      return () => {
        listener = null
      }
    })
  }

  const value: XNetContextValue = {
    nodeStore: store as unknown as XNetContextValue['nodeStore'],
    nodeStoreReady: true,
    identity: undefined,
    authorDID: did,
    syncManager: null,
    hubUrl: null,
    hubStatus: 'disconnected',
    hubConnection: null,
    encryptionKey: null,
    blobStore: null,
    pluginRegistry: null,
    runtimeStatus: {
      requestedMode: 'main-thread',
      activeMode: 'main-thread',
      fallbackMode: null,
      usedFallback: false,
      phase: 'ready',
      reason: null
    }
  }

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <XNetContext.Provider value={value}>{children}</XNetContext.Provider>
  )

  return {
    Wrapper,
    auth,
    emit: (event: unknown) => listener?.(event)
  }
}

describe('authorization hooks', () => {
  it('useCan returns permission booleans and refreshes on grant changes', async () => {
    const setup = createWrapper()
    const { result } = renderHook(() => useCan('node-1'), { wrapper: setup.Wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.canRead).toBe(true)
      expect(result.current.canWrite).toBe(true)
      expect(result.current.canDelete).toBe(false)
      expect(result.current.canShare).toBe(true)
    })

    expect(setup.auth.can).toHaveBeenCalledTimes(4)

    act(() => {
      setup.emit({
        node: { schemaId: 'xnet://xnet.fyi/Grant', properties: { resource: 'node-1' } }
      })
    })

    await waitFor(() => {
      expect(setup.auth.can).toHaveBeenCalledTimes(8)
    })
  })

  it('useGrants lists grants and wires grant/revoke callbacks', async () => {
    const grants: AuthGrant[] = [
      {
        id: 'grant-1',
        issuer: did,
        grantee: 'did:key:z6Mkother' as DID,
        resource: 'node-1',
        resourceSchema: 'xnet://test/Task',
        actions: ['read'],
        expiresAt: 0,
        revokedAt: 0,
        proofDepth: 0
      }
    ]

    const setup = createWrapper({ listGrants: async () => grants })
    const { result } = renderHook(() => useGrants('node-1'), { wrapper: setup.Wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.grants).toHaveLength(1)
    })

    await act(async () => {
      await result.current.grant({ to: 'did:key:z6Mkother' as DID, actions: ['read'] })
      await result.current.revoke('grant-1')
    })

    expect(setup.auth.grant).toHaveBeenCalledWith({
      to: 'did:key:z6Mkother',
      actions: ['read'],
      resource: 'node-1'
    })
    expect(setup.auth.revoke).toHaveBeenCalledWith({ grantId: 'grant-1' })
  })

  it('useCanEdit resolves edit/view mode and merged roles', async () => {
    const setup = createWrapper({
      can: async (action) => {
        if (action === 'read') {
          return {
            ...decision('read', true),
            roles: ['viewer']
          }
        }

        if (action === 'write') {
          return {
            ...decision('write', false),
            roles: ['viewer']
          }
        }

        return decision(action, false)
      }
    })

    const { result } = renderHook(() => useCanEdit('node-1'), { wrapper: setup.Wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.canEdit).toBe(false)
      expect(result.current.canView).toBe(true)
      expect(result.current.roles).toEqual(['viewer'])
    })

    act(() => {
      setup.emit({
        node: { schemaId: 'xnet://xnet.fyi/Grant', properties: { resource: 'node-1' } }
      })
    })

    await waitFor(() => {
      expect(setup.auth.can).toHaveBeenCalledTimes(4)
    })
  })
})
