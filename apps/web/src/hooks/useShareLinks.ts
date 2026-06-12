/**
 * Hooks for managing share links and grants against the connected hub
 * (exploration 0169). All calls authenticate with this identity's UCAN via
 * `getHubAuthToken` from XNet context.
 */

import { useXNet } from '@xnetjs/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeHubHttpUrl } from '../lib/share-links'

export type ShareDocType = 'page' | 'database' | 'canvas' | 'dashboard' | 'view'
export type ShareRole = 'read' | 'comment' | 'write'

export type ShareLink = {
  linkId: string
  docId: string
  docType: ShareDocType
  role: ShareRole
  label: string | null
  expiresAt: number
  maxUses: number
  useCount: number
  disabled: boolean
  createdBy: string
  createdAt: number
  /** Full URL with secret — only known on the device that created the link. */
  url?: string
}

export type ShareGrant = {
  grantId: string
  granteeDid: string
  actions: string[]
  revokedAt: number
  expiresAt: number
  createdAt: number
  viaLinkId: string | null
  viaLinkLabel: string | null
}

export type CreateLinkOptions = {
  role: ShareRole
  label?: string
  expiresAt?: number
  maxUses?: number
}

const URL_CACHE_PREFIX = 'xnet:share-link-url:'

const cacheLinkUrl = (linkId: string, url: string): void => {
  try {
    localStorage.setItem(`${URL_CACHE_PREFIX}${linkId}`, url)
  } catch {
    // Best effort — the URL is still shown once in the dialog.
  }
}

const cachedLinkUrl = (linkId: string): string | undefined => {
  try {
    return localStorage.getItem(`${URL_CACHE_PREFIX}${linkId}`) ?? undefined
  } catch {
    return undefined
  }
}

const dropCachedLinkUrl = (linkId: string): void => {
  try {
    localStorage.removeItem(`${URL_CACHE_PREFIX}${linkId}`)
  } catch {
    // ignore
  }
}

type HubApi = {
  ready: boolean
  hubHttpUrl: string | null
  request: (path: string, init?: { method?: string; body?: unknown }) => Promise<unknown>
}

const useHubApi = (): HubApi => {
  const { hubUrl, getHubAuthToken } = useXNet()
  const hubHttpUrl = useMemo(() => (hubUrl ? normalizeHubHttpUrl(hubUrl) : null), [hubUrl])

  const request = useCallback(
    async (path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> => {
      if (!hubHttpUrl || !getHubAuthToken) {
        throw new Error('Hub connection is not configured')
      }
      const token = await getHubAuthToken()
      const response = await fetch(`${hubHttpUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        cache: 'no-store'
      })
      const data = (await response.json().catch(() => null)) as {
        error?: string
        code?: string
      } | null
      if (!response.ok) {
        throw new Error(data?.error ?? `Hub request failed (${response.status})`)
      }
      return data
    },
    [hubHttpUrl, getHubAuthToken]
  )

  return { ready: Boolean(hubHttpUrl && getHubAuthToken), hubHttpUrl, request }
}

export function useShareLinks(
  docId: string,
  docType: ShareDocType
): {
  links: ShareLink[]
  loading: boolean
  error: string | null
  hubHttpUrl: string | null
  ready: boolean
  refresh: () => void
  createLink: (options: CreateLinkOptions) => Promise<ShareLink>
  setLinkDisabled: (linkId: string, disabled: boolean) => Promise<void>
  deleteLink: (linkId: string) => Promise<void>
} {
  const { ready, hubHttpUrl, request } = useHubApi()
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!ready || !docId) return
    let cancelled = false
    setLoading(true)
    request(`/shares/links?docId=${encodeURIComponent(docId)}`)
      .then((data) => {
        if (cancelled) return
        const rows = ((data as { links?: ShareLink[] })?.links ?? []).map((link) => ({
          ...link,
          url: cachedLinkUrl(link.linkId)
        }))
        setLinks(rows)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ready, docId, request, refreshTick])

  const refresh = useCallback(() => setRefreshTick((tick) => tick + 1), [])

  const createLink = useCallback(
    async (options: CreateLinkOptions): Promise<ShareLink> => {
      const data = (await request('/shares/links', {
        method: 'POST',
        body: {
          docId,
          docType,
          role: options.role,
          label: options.label,
          expiresAt: options.expiresAt,
          maxUses: options.maxUses
        }
      })) as ShareLink & { url: string }
      cacheLinkUrl(data.linkId, data.url)
      refresh()
      return data
    },
    [request, docId, docType, refresh]
  )

  const setLinkDisabled = useCallback(
    async (linkId: string, disabled: boolean): Promise<void> => {
      await request(`/shares/links/${encodeURIComponent(linkId)}`, {
        method: 'PATCH',
        body: { disabled }
      })
      refresh()
    },
    [request, refresh]
  )

  const deleteLink = useCallback(
    async (linkId: string): Promise<void> => {
      await request(`/shares/links/${encodeURIComponent(linkId)}`, { method: 'DELETE' })
      dropCachedLinkUrl(linkId)
      refresh()
    },
    [request, refresh]
  )

  return {
    links,
    loading,
    error,
    hubHttpUrl,
    ready,
    refresh,
    createLink,
    setLinkDisabled,
    deleteLink
  }
}

export function useShareGrants(docId: string): {
  grants: ShareGrant[]
  loading: boolean
  error: string | null
  refresh: () => void
  revokeGrant: (grantId: string) => Promise<void>
} {
  const { ready, request } = useHubApi()
  const [grants, setGrants] = useState<ShareGrant[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!ready || !docId) return
    let cancelled = false
    setLoading(true)
    request(`/shares/grants?docId=${encodeURIComponent(docId)}`)
      .then((data) => {
        if (cancelled) return
        setGrants((data as { grants?: ShareGrant[] })?.grants ?? [])
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ready, docId, request, refreshTick])

  const refresh = useCallback(() => setRefreshTick((tick) => tick + 1), [])

  const revokeGrant = useCallback(
    async (grantId: string): Promise<void> => {
      await request(
        `/shares/grants/${encodeURIComponent(grantId)}?docId=${encodeURIComponent(docId)}`,
        { method: 'DELETE' }
      )
      refresh()
    },
    [request, docId, refresh]
  )

  return { grants, loading, error, refresh, revokeGrant }
}

export const roleFromGrantActions = (actions: string[]): ShareRole => {
  if (actions.includes('write')) return 'write'
  if (actions.includes('comment')) return 'comment'
  return 'read'
}
