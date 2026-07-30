/**
 * Owner-side management of public form links (exploration 0278).
 *
 * Mints hashed tokens on the connected hub, publishes the sanitized
 * definition snapshot (the leak barrier lives in
 * `buildPublicFormDefinition`), and keeps the snapshot fresh when the form
 * config changes. The raw token — and therefore the URL — is only known on
 * the device that minted it (share-link discipline); it is cached locally
 * so the dialog can re-show it.
 */

import {
  buildPublicFormDefinition,
  type FormFieldRule,
  type FormViewConfig,
  type PublicFormDefinition
} from '@xnetjs/data'
import { useXNet } from '@xnetjs/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildPublicFormUrl } from '../lib/form-links'
import { hubApiFetch, normalizeHubHttpUrl } from '../lib/share-links'

export type FormLink = {
  tokenHash: string
  viewId: string
  databaseId: string
  space: string
  label: string | null
  accepting: boolean
  disabled: boolean
  expiresAt: number
  createdAt: number
  pending: number
  rejected: number
  /** Full URL — only known on the device that created the link. */
  url?: string
}

export type FormFieldForPublish = {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
  options?: Array<{ id: string; name: string; color?: string }>
}

const urlCacheKey = (tokenHash: string): string => {
  const scope = (globalThis as { __XNET_STORAGE_SCOPE__?: string }).__XNET_STORAGE_SCOPE__
  return scope ? `xnet:form-link-url--${scope}:${tokenHash}` : `xnet:form-link-url:${tokenHash}`
}

const cacheUrl = (tokenHash: string, url: string): void => {
  try {
    localStorage.setItem(urlCacheKey(tokenHash), url)
  } catch {
    // best effort — the URL is still shown once
  }
}

const cachedUrl = (tokenHash: string): string | undefined => {
  try {
    return localStorage.getItem(urlCacheKey(tokenHash)) ?? undefined
  } catch {
    return undefined
  }
}

const dropCachedUrl = (tokenHash: string): void => {
  try {
    localStorage.removeItem(urlCacheKey(tokenHash))
  } catch {
    // ignore
  }
}

/** Publish-time snapshot from the grid field models the shells already hold. */
export function publishableDefinition(
  config: FormViewConfig | null,
  rules: Record<string, FormFieldRule>,
  fields: FormFieldForPublish[]
): PublicFormDefinition {
  const columns = fields.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type as never,
    config: f.config as never
  }))
  const fieldOptions: Record<string, Array<{ id: string; name: string; color?: string }>> = {}
  for (const f of fields) {
    if (f.options && f.options.length > 0) fieldOptions[f.id] = f.options
  }
  return buildPublicFormDefinition(config ?? { questions: [] }, rules, columns, fieldOptions)
}

export function useFormLinks(viewId: string): {
  forms: FormLink[]
  ready: boolean
  loading: boolean
  error: string | null
  refresh: () => void
  createForm: (input: {
    databaseId: string
    space: string
    definition: PublicFormDefinition
    label?: string
  }) => Promise<FormLink>
  updateForm: (
    tokenHash: string,
    patch: { accepting?: boolean; disabled?: boolean; definition?: PublicFormDefinition }
  ) => Promise<void>
  deleteForm: (tokenHash: string) => Promise<void>
} {
  const { hubUrl, getHubAuthToken } = useXNet()
  const hubHttpUrl = useMemo(() => (hubUrl ? normalizeHubHttpUrl(hubUrl) : null), [hubUrl])
  const ready = Boolean(hubHttpUrl && getHubAuthToken)

  const request = useCallback(
    async (path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> => {
      if (!hubHttpUrl || !getHubAuthToken) throw new Error('Hub connection is not configured')
      return hubApiFetch(hubHttpUrl, await getHubAuthToken(), path, init)
    },
    [hubHttpUrl, getHubAuthToken]
  )

  const [forms, setForms] = useState<FormLink[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!ready || !viewId) return
    let cancelled = false
    setLoading(true)
    request(`/forms?viewId=${encodeURIComponent(viewId)}`)
      .then((data) => {
        if (cancelled) return
        const items = ((data as { forms?: FormLink[] })?.forms ?? []).map((f) => ({
          ...f,
          url: cachedUrl(f.tokenHash)
        }))
        setForms(items)
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
  }, [ready, viewId, request, tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const createForm = useCallback(
    async (input: {
      databaseId: string
      space: string
      definition: PublicFormDefinition
      label?: string
    }): Promise<FormLink> => {
      const data = (await request('/forms', {
        method: 'POST',
        body: { viewId, ...input }
      })) as FormLink & { token: string }
      const url = buildPublicFormUrl(data.token, hubHttpUrl ?? '')
      cacheUrl(data.tokenHash, url)
      refresh()
      return { ...data, pending: 0, rejected: 0, url }
    },
    [request, viewId, hubHttpUrl, refresh]
  )

  const updateForm = useCallback(
    async (
      tokenHash: string,
      patch: { accepting?: boolean; disabled?: boolean; definition?: PublicFormDefinition }
    ): Promise<void> => {
      await request(`/forms/${encodeURIComponent(tokenHash)}`, { method: 'PATCH', body: patch })
      refresh()
    },
    [request, refresh]
  )

  const deleteForm = useCallback(
    async (tokenHash: string): Promise<void> => {
      await request(`/forms/${encodeURIComponent(tokenHash)}`, { method: 'DELETE' })
      dropCachedUrl(tokenHash)
      refresh()
    },
    [request, refresh]
  )

  return { forms, ready, loading, error, refresh, createForm, updateForm, deleteForm }
}
