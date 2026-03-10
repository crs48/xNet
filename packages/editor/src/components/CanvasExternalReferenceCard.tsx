/**
 * CanvasExternalReferenceCard - Provider-aware external reference previews for canvas nodes.
 */

import type { JSX } from 'react'
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

  return (
    <div
      className="flex h-full flex-col rounded-[22px] border border-border/70 bg-background/95 p-3 shadow-lg shadow-black/5"
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
        {status ? (
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {status}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
        <div className="space-y-1">
          <div className="line-clamp-2 text-base font-semibold leading-tight text-foreground">
            {title}
          </div>
          {subtitle ? (
            <p className="truncate text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {subtitle}
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
              title={`${providerLabel} embed for ${title}`}
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
