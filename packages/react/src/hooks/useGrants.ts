/**
 * useGrants - Read and mutate grants for a node.
 */

import type { AuthAction, DID } from '@xnetjs/core'
import type { AuthGrant } from '@xnetjs/data'
import { useCallback, useEffect, useState } from 'react'
import { useNodeStore } from './useNodeStore'

const GRANT_SCHEMA_ID = 'xnet://xnet.fyi/Grant'
const DEFAULT_GRANT_TTL_MS = 7 * 24 * 60 * 60 * 1000

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

export type GrantConsentSummary = {
  grantee: DID
  resource: string
  actions: AuthAction[]
  expiresAt: number
  what: string
  where: string
  howLong: string
}

type ChangeEventLike = {
  node?: { schemaId?: string; properties?: Record<string, unknown> }
}

export function describeGrantConsent(
  input: GrantInput,
  defaultResource: string,
  now = Date.now()
): GrantConsentSummary {
  const resource = input.resource ?? defaultResource
  const expiresAt = computeGrantExpiration(input.expiresIn, now)
  const actions = [...input.actions]

  return {
    grantee: input.to,
    resource,
    actions,
    expiresAt,
    what: actions.join(', '),
    where: resource,
    howLong: formatGrantExpiration(expiresAt, now)
  }
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

function computeGrantExpiration(expiresIn: string | number | undefined, now: number): number {
  if (typeof expiresIn === 'number') {
    return expiresIn
  }

  if (typeof expiresIn === 'string') {
    const parsed = parseDuration(expiresIn)
    if (parsed !== null) {
      return now + parsed
    }
  }

  return now + DEFAULT_GRANT_TTL_MS
}

function formatGrantExpiration(expiresAt: number, now: number): string {
  const durationMs = Math.max(0, expiresAt - now)
  const roundedDays = Math.round(durationMs / (24 * 60 * 60 * 1000))
  const roundedHours = Math.round(durationMs / (60 * 60 * 1000))
  const roundedMinutes = Math.round(durationMs / (60 * 1000))

  if (roundedDays >= 1) {
    return `${roundedDays}d`
  }

  if (roundedHours >= 1) {
    return `${roundedHours}h`
  }

  if (roundedMinutes >= 1) {
    return `${roundedMinutes}m`
  }

  return `${Math.round(durationMs / 1000)}s`
}

function parseDuration(value: string): number | null {
  const match = value.match(/^(\d+)([smhdw])$/)
  if (!match) {
    return null
  }

  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }

  const unit = match[2]
  switch (unit) {
    case 's':
      return amount * 1000
    case 'm':
      return amount * 60 * 1000
    case 'h':
      return amount * 60 * 60 * 1000
    case 'd':
      return amount * 24 * 60 * 60 * 1000
    case 'w':
      return amount * 7 * 24 * 60 * 60 * 1000
    default:
      return null
  }
}
