/**
 * useGrants - Read and mutate grants for a node.
 */

import type { AuthAction, DID } from '@xnet/core'
import type { AuthGrant } from '@xnet/data'
import { useCallback, useEffect, useState } from 'react'
import { useNodeStore } from './useNodeStore'

const GRANT_SCHEMA_ID = 'xnet://xnet.fyi/Grant'

export interface GrantInput {
  to: DID
  actions: AuthAction[]
  resource?: string
  expiresIn?: string | number
  parentGrantId?: string
}

export interface UseGrantsResult {
  grants: AuthGrant[]
  loading: boolean
  error: Error | null
  grant: (input: GrantInput) => Promise<AuthGrant>
  revoke: (grantId: string) => Promise<void>
}

type ChangeEventLike = {
  node?: { schemaId?: string; properties?: Record<string, unknown> }
}

export function useGrants(nodeId: string): UseGrantsResult {
  const { store, isReady } = useNodeStore()
  const [grants, setGrants] = useState<AuthGrant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    if (!store || !store.auth || !isReady) return

    setLoading(true)
    setError(null)

    try {
      const next = await store.auth.listGrants({ nodeId })
      setGrants(next)
      setLoading(false)
    } catch (err) {
      const normalized = err instanceof Error ? err : new Error(String(err))
      setError(normalized)
      setLoading(false)
    }
  }, [isReady, nodeId, store])

  useEffect(() => {
    if (!store || !isReady) {
      setLoading(true)
      return
    }

    if (!store.auth) {
      setLoading(false)
      setError(new Error('Authorization API is not configured on this NodeStore'))
      return
    }

    void load()

    const unsubscribe = store.subscribe((event) => {
      const typedEvent = event as ChangeEventLike
      const isGrantUpdate = typedEvent.node?.schemaId === GRANT_SCHEMA_ID
      const resource = typedEvent.node?.properties?.resource
      if (isGrantUpdate && resource === nodeId) {
        void load()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [isReady, load, nodeId, store])

  const grant = useCallback(
    async (input: GrantInput): Promise<AuthGrant> => {
      if (!store?.auth) {
        throw new Error('Authorization API is not configured on this NodeStore')
      }

      const created = await store.auth.grant({ ...input, resource: input.resource ?? nodeId })
      await load()
      return created
    },
    [load, nodeId, store]
  )

  const revoke = useCallback(
    async (grantId: string): Promise<void> => {
      if (!store?.auth) {
        throw new Error('Authorization API is not configured on this NodeStore')
      }

      await store.auth.revoke({ grantId })
      await load()
    },
    [load, store]
  )

  return { grants, loading, error, grant, revoke }
}
