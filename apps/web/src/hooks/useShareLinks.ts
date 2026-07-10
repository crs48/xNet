/**
 * Hooks for managing share links and grants against the connected hub
 * (exploration 0169). All calls authenticate with this identity's UCAN via
 * `getHubAuthToken` from XNet context.
 */

import { useXNet } from '@xnetjs/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { hubApiFetch, normalizeHubHttpUrl } from '../lib/share-links'

// 'space' invites bootstrap Space membership — one link shares the whole Space
// (exploration 0179).
export type ShareDocType =
  | 'page'
  | 'database'
  | 'canvas'
  | 'dashboard'
  | 'view'
  | 'space'
  // Saved shell layouts (exploration 0280) — a bench travels like a node.
  | 'workspace'
  // Chat channels — comment role lets the recipient post messages.
  | 'channel'
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
  /** Owner-published preview snapshot (0295); null when previews are off. */
  preview?: { title: string; icon: string | null } | null
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
  /** Publish this title as the link's preview snapshot at mint (0295). */
  previewTitle?: string
}

// Scope-aware key so Pages preview deploys (which share production's
// browser-storage origin) never read or write production's cached URLs.
const urlCacheKey = (linkId: string): string => {
  const scope = (globalThis as { __XNET_STORAGE_SCOPE__?: string }).__XNET_STORAGE_SCOPE__
  return scope ? `xnet:share-link-url--${scope}:${linkId}` : `xnet:share-link-url:${linkId}`
}

const cacheLinkUrl = (linkId: string, url: string): void => {
  try {
    localStorage.setItem(urlCacheKey(linkId), url)
  } catch {
    // Best effort — the URL is still shown once in the dialog.
  }
}

const cachedLinkUrl = (linkId: string): string | undefined => {
  try {
    return localStorage.getItem(urlCacheKey(linkId)) ?? undefined
  } catch {
    return undefined
  }
}

const dropCachedLinkUrl = (linkId: string): void => {
  try {
    localStorage.removeItem(urlCacheKey(linkId))
  } catch {
    // ignore
  }
}

export type HubApi = {
  ready: boolean
  hubHttpUrl: string | null
  request: (path: string, init?: { method?: string; body?: unknown }) => Promise<unknown>
}

/** Authenticated JSON client for the connected hub's HTTP API. */
export const useHubApi = (): HubApi => {
  const { hubUrl, getHubAuthToken } = useXNet()
  const hubHttpUrl = useMemo(() => (hubUrl ? normalizeHubHttpUrl(hubUrl) : null), [hubUrl])

  const request = useCallback(
    async (path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> => {
      if (!hubHttpUrl || !getHubAuthToken) {
        throw new Error('Hub connection is not configured')
      }
      return hubApiFetch(hubHttpUrl, await getHubAuthToken(), path, init)
    },
    [hubHttpUrl, getHubAuthToken]
  )

  return { ready: Boolean(hubHttpUrl && getHubAuthToken), hubHttpUrl, request }
}

type HubCollection<T> = {
  items: T[]
  loading: boolean
  error: string | null
  refresh: () => void
  api: HubApi
}

/** Shared fetch-list-with-refresh state for hub-backed collections. */
const useHubCollection = <T>(
  docId: string,
  path: string,
  extract: (data: unknown) => T[]
): HubCollection<T> => {
  const api = useHubApi()
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const { ready, request } = api

  useEffect(() => {
    if (!ready || !docId) return
    let cancelled = false
    setLoading(true)
    request(path)
      .then((data) => {
        if (cancelled) return
        setItems(extract(data))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- extract is identity-stable per call site
  }, [ready, docId, path, request, refreshTick])

  const refresh = useCallback(() => setRefreshTick((tick) => tick + 1), [])

  return { items, loading, error, refresh, api }
}

const extractLinks = (data: unknown): ShareLink[] =>
  ((data as { links?: ShareLink[] })?.links ?? []).map((link) => ({
    ...link,
    url: cachedLinkUrl(link.linkId)
  }))

const extractGrants = (data: unknown): ShareGrant[] =>
  (data as { grants?: ShareGrant[] })?.grants ?? []

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
  /** Publish (title) or retract (null) a link's preview snapshot (0295). */
  setLinkPreview: (linkId: string, title: string | null) => Promise<void>
} {
  const { items, loading, error, refresh, api } = useHubCollection<ShareLink>(
    docId,
    `/shares/links?docId=${encodeURIComponent(docId)}`,
    extractLinks
  )
  const { request, ready, hubHttpUrl } = api

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
      const previewTitle = options.previewTitle?.trim()
      if (previewTitle) {
        // Best effort — a failed preview publish must not lose the fresh link.
        await request(`/shares/links/${encodeURIComponent(data.linkId)}/preview`, {
          method: 'PUT',
          body: { title: previewTitle }
        }).catch(() => undefined)
      }
      refresh()
      return data
    },
    [request, docId, docType, refresh]
  )

  const setLinkPreview = useCallback(
    async (linkId: string, title: string | null): Promise<void> => {
      const path = `/shares/links/${encodeURIComponent(linkId)}/preview`
      if (title && title.trim()) {
        await request(path, { method: 'PUT', body: { title: title.trim() } })
      } else {
        await request(path, { method: 'DELETE' })
      }
      refresh()
    },
    [request, refresh]
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
    links: items,
    loading,
    error,
    hubHttpUrl,
    ready,
    refresh,
    createLink,
    setLinkDisabled,
    deleteLink,
    setLinkPreview
  }
}

export function useShareGrants(docId: string): {
  grants: ShareGrant[]
  loading: boolean
  error: string | null
  refresh: () => void
  revokeGrant: (grantId: string) => Promise<void>
} {
  const { items, loading, error, refresh, api } = useHubCollection<ShareGrant>(
    docId,
    `/shares/grants?docId=${encodeURIComponent(docId)}`,
    extractGrants
  )
  const { request } = api

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

  return { grants: items, loading, error, refresh, revokeGrant }
}

export const roleFromGrantActions = (actions: string[]): ShareRole => {
  if (actions.includes('write')) return 'write'
  if (actions.includes('comment')) return 'comment'
  return 'read'
}
