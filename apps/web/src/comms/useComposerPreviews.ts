/**
 * Composer-side external URL preview resolution (exploration 0295).
 *
 * Watches the draft for external URLs and resolves preview metadata ONCE,
 * through the hub's SSRF-guarded /unfurl proxy — the sender-generated
 * model, so readers never fetch. Resolution is debounced, capped at
 * MAX_LINK_PREVIEWS_PER_MESSAGE, times out quietly, and never blocks send:
 * with no hub (or offline) the message simply goes out with bare URLs.
 */
import { MAX_LINK_PREVIEWS_PER_MESSAGE, type MessageLinkPreview } from '@xnetjs/data'
import { findLinkTokens } from '@xnetjs/ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHubApi } from '../hooks/useShareLinks'
import { classifyUrl, type UrlEnv } from '../lib/url-upres'

const DEBOUNCE_MS = 400
const RESOLVE_TIMEOUT_MS = 3000

type UnfurlResponse = {
  status?: string
  metadata?: {
    title?: string | null
    description?: string | null
    providerName?: string | null
  } | null
}

/** One resolution per URL per session — failures cached too (no retry storms). */
const resolutionCache = new Map<string, Promise<MessageLinkPreview | null>>()

/** Test hook: clear the module cache between cases. */
export function clearComposerPreviewCache(): void {
  resolutionCache.clear()
}

/**
 * Resolve one external URL to the shared MessageLinkPreview shape through
 * the hub's /unfurl proxy. Shared by the chat composer and the page
 * editor's rich-link hydration, so every surface stores the same shape.
 */
export function resolveExternalPreview(
  request: (path: string) => Promise<unknown>,
  url: string,
  href: string = url
): Promise<MessageLinkPreview | null> {
  const cached = resolutionCache.get(url)
  if (cached) return cached
  const resolution = Promise.race([
    request(`/unfurl/metadata?url=${encodeURIComponent(href)}`).then((data) =>
      toPreview(url, (data ?? {}) as UnfurlResponse)
    ),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), RESOLVE_TIMEOUT_MS))
  ]).catch(() => null)
  resolutionCache.set(url, resolution)
  return resolution
}

function domainOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function toPreview(url: string, data: UnfurlResponse): MessageLinkPreview | null {
  if (data.status !== 'resolved' || !data.metadata) return null
  const title = data.metadata.title?.trim()
  if (!title) return null
  return {
    url,
    kind: 'external',
    title: title.slice(0, 200),
    ...(data.metadata.description?.trim()
      ? { description: data.metadata.description.trim().slice(0, 300) }
      : {}),
    ...(data.metadata.providerName?.trim()
      ? { providerName: data.metadata.providerName.trim().slice(0, 100) }
      : {}),
    domain: domainOf(url),
    resolvedAt: Date.now()
  }
}

/** The draft's external URL tokens, in order, deduped by verbatim text. */
export function externalUrlsIn(text: string, env: UrlEnv): Array<{ text: string; href: string }> {
  const seen = new Set<string>()
  const urls: Array<{ text: string; href: string }> = []
  for (const token of findLinkTokens(text)) {
    if (token.type !== 'url' || seen.has(token.text)) continue
    if (classifyUrl(token.href, env).kind !== 'external') continue
    seen.add(token.text)
    urls.push({ text: token.text, href: token.href })
  }
  return urls
}

export interface ComposerPreviewsApi {
  /** Resolved, non-dismissed previews for URLs still present in the draft. */
  offers: MessageLinkPreview[]
  dismiss: (url: string) => void
  dismissAll: () => void
  /** Clear dismissals after a successful send. */
  reset: () => void
}

export function useComposerPreviews(text: string, env: UrlEnv): ComposerPreviewsApi {
  const { ready, request } = useHubApi()
  const [debouncedText, setDebouncedText] = useState(text)
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const [resolved, setResolved] = useState<ReadonlyMap<string, MessageLinkPreview | null>>(
    new Map()
  )
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedText(text), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text])

  const candidates = useMemo(
    () =>
      externalUrlsIn(debouncedText, env)
        .filter((url) => !dismissed.has(url.text))
        .slice(0, MAX_LINK_PREVIEWS_PER_MESSAGE),
    [debouncedText, env, dismissed]
  )

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    void Promise.all(
      candidates.map(async (candidate) => {
        const preview = await resolveExternalPreview(request, candidate.text, candidate.href)
        return [candidate.text, preview] as const
      })
    ).then((entries) => {
      if (cancelled || !alive.current) return
      setResolved((prev) => {
        const next = new Map(prev)
        for (const [url, preview] of entries) next.set(url, preview)
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [ready, candidates, request])

  const offers = useMemo(
    () =>
      candidates
        .map((candidate) => resolved.get(candidate.text))
        .filter((preview): preview is MessageLinkPreview => Boolean(preview)),
    [candidates, resolved]
  )

  const dismiss = useCallback((url: string) => {
    setDismissed((prev) => new Set(prev).add(url))
  }, [])

  const dismissAll = useCallback(() => {
    setDismissed((prev) => {
      const next = new Set(prev)
      for (const offer of offers) next.add(offer.url)
      return next
    })
  }, [offers])

  const reset = useCallback(() => {
    setDismissed(new Set())
  }, [])

  return { offers, dismiss, dismissAll, reset }
}
