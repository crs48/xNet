/**
 * CanvasExternalReferenceCard - Provider-aware external reference previews for canvas nodes.
 */

import type { JSX } from 'react'
import React, { useEffect, useMemo, useState } from 'react'
import { EMBED_PROVIDERS, parseEmbedUrl, type EmbedProvider } from '../extensions/embed'
import { cn } from '../utils'

export interface CanvasExternalReferenceCardProps {
  title: string
  url: string
  themeMode: 'light' | 'dark'
  provider?: string | null
  embedUrl?: string | null
  subtitle?: string | null
  status?: string | null
}

type CanvasLifecycleTone = 'neutral' | 'progress' | 'success' | 'danger'

type CanvasLifecycleStatusConfig = {
  status: string
  label: string
  tone: CanvasLifecycleTone
}

function getProvider(name: string | null | undefined): EmbedProvider | null {
  if (!name) {
    return null
  }

  return EMBED_PROVIDERS.find((provider) => provider.name === name) ?? null
}

function normalizeValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeLifecycleStatus(
  status: string | null | undefined
): CanvasLifecycleStatusConfig | null {
  const normalized = normalizeValue(status)?.toLowerCase()
  if (!normalized) {
    return null
  }

  switch (normalized) {
    case 'resolving':
      return { status: normalized, label: 'Resolving', tone: 'progress' }
    case 'uploading':
      return { status: normalized, label: 'Uploading', tone: 'progress' }
    case 'ready':
      return { status: normalized, label: 'Ready', tone: 'success' }
    case 'error':
      return { status: normalized, label: 'Error', tone: 'danger' }
    default:
      return { status: normalized, label: normalized, tone: 'neutral' }
  }
}

export function CanvasLifecycleStatusBadge({
  status
}: {
  status?: string | null
}): JSX.Element | null {
  const config = normalizeLifecycleStatus(status)
  if (!config) {
    return null
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium uppercase tracking-[0.18em]',
        config.tone === 'progress'
          ? 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200'
          : '',
        config.tone === 'success'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
          : '',
        config.tone === 'danger'
          ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200'
          : '',
        config.tone === 'neutral' ? 'border-border/70 bg-muted text-muted-foreground' : ''
      )}
      data-canvas-lifecycle-status={config.status}
      data-canvas-lifecycle-tone={config.tone}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-current"
        data-canvas-lifecycle-marker="true"
      />
      {config.label}
    </span>
  )
}

type ExternalReferenceMetadata = {
  title: string
  subtitle: string | null
}

type OEmbedResponse = {
  title?: string
  author_name?: string
  provider_name?: string
}

const EXTERNAL_REFERENCE_METADATA_CACHE = new Map<string, ExternalReferenceMetadata | null>()

function getOEmbedEndpoint(url: string, providerId: string): string | null {
  const encodedUrl = encodeURIComponent(url)

  switch (providerId) {
    case 'youtube':
      return `https://www.youtube.com/oembed?url=${encodedUrl}&format=json`
    case 'twitter':
      return `https://publish.twitter.com/oembed?url=${encodedUrl}&omit_script=true`
    default:
      return null
  }
}

function toAuthorHandle(value: string | null | undefined): string | null {
  const normalized = normalizeValue(value)
  if (!normalized) {
    return null
  }

  return normalized.startsWith('@') ? normalized : `@${normalized}`
}

function toAuthorName(value: string | null | undefined): string | null {
  return normalizeValue(value)
}

function resolveExternalReferenceMetadata(
  providerId: string,
  payload: OEmbedResponse,
  fallbackTitle: string,
  fallbackSubtitle: string | null
): ExternalReferenceMetadata | null {
  const providerName = normalizeValue(payload.provider_name)
  const title = normalizeValue(payload.title)
  const authorHandle = toAuthorHandle(payload.author_name)
  const authorName = toAuthorName(payload.author_name)

  if (providerId === 'youtube') {
    if (!title && !authorName) {
      return null
    }

    return {
      title: title ?? fallbackTitle,
      subtitle: authorName ?? providerName ?? fallbackSubtitle
    }
  }

  if (providerId === 'twitter') {
    if (!title && !authorHandle) {
      return null
    }

    return {
      title: title ?? (authorHandle ? `Post from ${authorHandle}` : fallbackTitle),
      subtitle: authorHandle ?? providerName ?? fallbackSubtitle
    }
  }

  return null
}

export function CanvasExternalReferenceCard({
  title,
  url,
  themeMode,
  provider,
  embedUrl,
  subtitle,
  status
}: CanvasExternalReferenceCardProps): JSX.Element {
  const parsedEmbed = parseEmbedUrl(url)
  const resolvedProvider = getProvider(provider) ?? parsedEmbed?.provider ?? null
  const resolvedEmbedUrl = normalizeValue(embedUrl) ?? parsedEmbed?.embedUrl ?? null
  const providerLabel = resolvedProvider?.displayName ?? 'Link preview'
  const providerId = resolvedProvider?.name ?? normalizeValue(provider) ?? 'generic'
  const fallbackSubtitle = normalizeValue(subtitle)
  const [resolvedMetadata, setResolvedMetadata] = useState<ExternalReferenceMetadata | null>(null)

  useEffect(() => {
    const cacheKey = `${providerId}:${url}`
    if (EXTERNAL_REFERENCE_METADATA_CACHE.has(cacheKey)) {
      setResolvedMetadata(EXTERNAL_REFERENCE_METADATA_CACHE.get(cacheKey) ?? null)
      return
    }

    const endpoint = getOEmbedEndpoint(url, providerId)
    if (!endpoint) {
      EXTERNAL_REFERENCE_METADATA_CACHE.set(cacheKey, null)
      setResolvedMetadata(null)
      return
    }

    const controller = new AbortController()

    void fetch(endpoint, {
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`External reference metadata request failed (${response.status})`)
        }

        return (await response.json()) as OEmbedResponse
      })
      .then((payload) => {
        const metadata = resolveExternalReferenceMetadata(
          providerId,
          payload,
          title,
          fallbackSubtitle
        )
        EXTERNAL_REFERENCE_METADATA_CACHE.set(cacheKey, metadata)
        setResolvedMetadata(metadata)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        EXTERNAL_REFERENCE_METADATA_CACHE.set(cacheKey, null)
        setResolvedMetadata(null)
      })

    return () => {
      controller.abort()
    }
  }, [fallbackSubtitle, providerId, title, url])

  const resolvedTitle = resolvedMetadata?.title ?? title
  const resolvedSubtitle = resolvedMetadata?.subtitle ?? fallbackSubtitle
  const embedFrameTitle = useMemo(
    () => `${providerLabel} embed for ${resolvedTitle}`,
    [providerLabel, resolvedTitle]
  )

  return (
    <div
      className="flex h-full flex-col rounded-[22px] border border-border/70 bg-background p-3 shadow-lg shadow-black/5"
      data-canvas-node-card="true"
      data-canvas-card-kind="external-reference"
      data-canvas-theme={themeMode}
      data-canvas-embed-provider={providerId}
      data-canvas-embed-active={resolvedEmbedUrl ? 'true' : 'false'}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {resolvedEmbedUrl ? `${providerLabel} embed` : providerLabel}
        </span>
        <CanvasLifecycleStatusBadge status={status} />
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
        <div className="space-y-1">
          <div
            className="line-clamp-2 text-base font-semibold leading-tight text-foreground"
            data-canvas-embed-title="true"
          >
            {resolvedTitle}
          </div>
          {resolvedSubtitle ? (
            <p
              className="truncate text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
              data-canvas-embed-subtitle="true"
            >
              {resolvedSubtitle}
            </p>
          ) : null}
        </div>

        {resolvedEmbedUrl ? (
          <div
            className={cn(
              'relative min-h-[116px] flex-1 overflow-hidden rounded-[18px] border border-border/60 bg-muted/40',
              themeMode === 'dark' ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]' : ''
            )}
            data-canvas-embed-node="true"
            data-canvas-embed-provider={providerId}
            data-canvas-embed-theme={themeMode}
          >
            <iframe
              title={embedFrameTitle}
              src={resolvedEmbedUrl}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              tabIndex={-1}
              className="pointer-events-none absolute inset-0 h-full w-full border-0 bg-transparent"
              data-canvas-embed-iframe="true"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white">
              {providerLabel}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center rounded-[18px] border border-dashed border-border/60 bg-muted/30 px-3 py-4">
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{url}</p>
          </div>
        )}

        <p className="truncate text-xs text-muted-foreground">{url}</p>
      </div>
    </div>
  )
}
