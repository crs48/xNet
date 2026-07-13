/**
 * CanvasExternalReferenceCard - Provider-aware external reference previews for canvas nodes.
 */

import type { JSX } from 'react'
import {
  evaluateExternalReferenceEmbedPolicy,
  resolveExternalReferenceMetadata,
  type ExternalReferenceEmbedPolicy,
  type ExternalReferenceMetadataResult
} from '@xnetjs/data'
import React, { useEffect, useMemo, useState } from 'react'
import { EMBED_PROVIDERS, parseEmbedUrl, type EmbedProvider } from '@xnetjs/data'
import { cn } from '../utils'
import {
  createCanvasExternalReferenceCardRenderer,
  type CanvasExternalReferenceCardAccent,
  type CanvasExternalReferenceRenderMode
} from './canvasExternalReferenceCardRenderers'
import { createCanvasExternalReferenceEmbedFallback } from './canvasExternalReferenceEmbedFallbacks'
import {
  createCanvasPermissionedCardField,
  createCanvasPermissionedCardFields,
  type CanvasRestrictedCardField
} from './canvasPermissionedCardFields'

export interface CanvasExternalReferenceCardProps {
  title: string
  url: string
  themeMode: 'light' | 'dark'
  provider?: string | null
  embedUrl?: string | null
  subtitle?: string | null
  status?: string | null
  embedPolicy?: ExternalReferenceEmbedPolicy | null
  renderMode?: CanvasExternalReferenceRenderMode
  defaultEmbedActivated?: boolean
  restrictedFields?: readonly CanvasRestrictedCardField[] | null
  onEmbedActivationChange?: (activated: boolean) => void
  onFailedAction?: (action: CanvasFailedCardActionKind) => void
}

type CanvasLifecycleTone = 'neutral' | 'progress' | 'success' | 'danger'

type CanvasLifecycleStatusConfig = {
  status: string
  label: string
  tone: CanvasLifecycleTone
}

export type CanvasFailedCardActionKind = 'retry' | 'replace-source' | 'open-source' | 'copy-link'

export type CanvasFailedCardActionsProps = {
  url?: string | null
  themeMode: 'light' | 'dark'
  onAction?: (action: CanvasFailedCardActionKind) => void
}

type CanvasFailedCardActionConfig = {
  kind: CanvasFailedCardActionKind
  label: string
  ariaLabel: string
}

const FAILED_CARD_ACTIONS: readonly CanvasFailedCardActionConfig[] = [
  { kind: 'retry', label: 'Retry', ariaLabel: 'Retry failed card' },
  { kind: 'replace-source', label: 'Replace', ariaLabel: 'Replace source failed card' },
  { kind: 'open-source', label: 'Open', ariaLabel: 'Open source failed card' },
  { kind: 'copy-link', label: 'Copy', ariaLabel: 'Copy link failed card' }
]

const PROVIDER_ACCENT_CLASSES: Record<
  CanvasExternalReferenceCardAccent,
  {
    badge: string
    icon: string
    preview: string
    footer: string
    metadata: string
  }
> = {
  neutral: {
    badge: 'bg-muted text-muted-foreground',
    icon: 'bg-background text-foreground',
    preview: 'border-border/60 bg-muted/40',
    footer: 'from-black/45 via-black/10 text-white',
    metadata: 'border-border/50 bg-muted/25 text-muted-foreground'
  },
  blue: {
    badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-200',
    icon: 'bg-sky-500 text-white',
    preview: 'border-sky-500/25 bg-sky-500/10',
    footer: 'from-sky-950/70 via-sky-950/20 text-white',
    metadata: 'border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-100'
  },
  green: {
    badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
    icon: 'bg-emerald-500 text-white',
    preview: 'border-emerald-500/25 bg-emerald-500/10',
    footer: 'from-emerald-950/70 via-emerald-950/20 text-white',
    metadata: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100'
  },
  purple: {
    badge: 'bg-violet-500/10 text-violet-700 dark:text-violet-200',
    icon: 'bg-violet-500 text-white',
    preview: 'border-violet-500/25 bg-violet-500/10',
    footer: 'from-violet-950/70 via-violet-950/20 text-white',
    metadata: 'border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-100'
  },
  red: {
    badge: 'bg-red-500/10 text-red-700 dark:text-red-200',
    icon: 'bg-red-500 text-white',
    preview: 'border-red-500/25 bg-red-500/10',
    footer: 'from-red-950/70 via-red-950/20 text-white',
    metadata: 'border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-100'
  },
  pink: {
    badge: 'bg-pink-500/10 text-pink-700 dark:text-pink-200',
    icon: 'bg-pink-500 text-white',
    preview: 'border-pink-500/25 bg-pink-500/10',
    footer: 'from-pink-950/70 via-pink-950/20 text-white',
    metadata: 'border-pink-500/25 bg-pink-500/10 text-pink-800 dark:text-pink-100'
  },
  amber: {
    badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-200',
    icon: 'bg-amber-500 text-white',
    preview: 'border-amber-500/25 bg-amber-500/10',
    footer: 'from-amber-950/70 via-amber-950/20 text-white',
    metadata: 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-100'
  },
  slate: {
    badge: 'bg-slate-500/10 text-slate-700 dark:text-slate-200',
    icon: 'bg-slate-700 text-white',
    preview: 'border-slate-500/25 bg-slate-500/10',
    footer: 'from-slate-950/70 via-slate-950/20 text-white',
    metadata: 'border-slate-500/25 bg-slate-500/10 text-slate-800 dark:text-slate-100'
  }
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
    case 'offline':
      return { status: normalized, label: 'Offline', tone: 'neutral' }
    case 'blocked':
      return { status: normalized, label: 'Blocked', tone: 'danger' }
    case 'provider-denied':
      return { status: normalized, label: 'Provider denied', tone: 'danger' }
    case 'error':
      return { status: normalized, label: 'Error', tone: 'danger' }
    default:
      return { status: normalized, label: normalized, tone: 'neutral' }
  }
}

function resolveCanvasExternalReferenceRenderMode(
  requestedMode: CanvasExternalReferenceRenderMode,
  supportedModes: readonly CanvasExternalReferenceRenderMode[]
): CanvasExternalReferenceRenderMode {
  if (supportedModes.includes(requestedMode)) {
    return requestedMode
  }

  if (supportedModes.includes('compact')) {
    return 'compact'
  }

  return supportedModes[0] ?? 'read-only'
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

export function CanvasFailedCardActions({
  url,
  themeMode,
  onAction
}: CanvasFailedCardActionsProps): JSX.Element {
  const normalizedUrl = normalizeValue(url)

  const handleAction = (action: CanvasFailedCardActionKind) => {
    onAction?.(action)

    if (action === 'open-source' && normalizedUrl) {
      window.open(normalizedUrl, '_blank', 'noopener,noreferrer')
    }

    if (action === 'copy-link' && normalizedUrl && navigator.clipboard) {
      void navigator.clipboard.writeText(normalizedUrl).catch(() => undefined)
    }
  }

  return (
    <div
      className="grid grid-cols-4 gap-1.5"
      data-canvas-failed-card-actions="true"
      data-canvas-failed-card-theme={themeMode}
    >
      {FAILED_CARD_ACTIONS.map((action) => {
        const requiresUrl = action.kind === 'open-source' || action.kind === 'copy-link'
        const disabled = requiresUrl && !normalizedUrl

        return (
          <button
            key={action.kind}
            type="button"
            className={cn(
              'min-w-0 rounded-md border px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors',
              themeMode === 'dark'
                ? 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'
                : 'border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted',
              disabled
                ? 'cursor-not-allowed opacity-45 hover:bg-muted/40 dark:hover:bg-white/5'
                : ''
            )}
            aria-label={action.ariaLabel}
            disabled={disabled}
            data-canvas-failed-card-action={action.kind}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              handleAction(action.kind)
            }}
          >
            {action.label}
          </button>
        )
      })}
    </div>
  )
}

const EXTERNAL_REFERENCE_METADATA_CACHE = new Map<string, ExternalReferenceMetadataResult | null>()

export function CanvasExternalReferenceCard({
  title,
  url,
  themeMode,
  provider,
  embedUrl,
  subtitle,
  status,
  embedPolicy,
  renderMode = 'compact',
  defaultEmbedActivated = false,
  restrictedFields,
  onEmbedActivationChange,
  onFailedAction
}: CanvasExternalReferenceCardProps): JSX.Element {
  const parsedEmbed = parseEmbedUrl(url)
  const resolvedProvider = getProvider(provider) ?? parsedEmbed?.provider ?? null
  const resolvedEmbedUrl = normalizeValue(embedUrl) ?? parsedEmbed?.embedUrl ?? null
  const cardRenderer = useMemo(
    () =>
      createCanvasExternalReferenceCardRenderer({
        url,
        provider,
        embedUrl: resolvedEmbedUrl,
        title,
        subtitle
      }),
    [provider, resolvedEmbedUrl, subtitle, title, url]
  )
  const providerLabel = resolvedProvider?.displayName ?? cardRenderer.providerLabel
  const providerId = resolvedProvider?.name ?? cardRenderer.providerId
  const embedPolicyDecision = useMemo(
    () =>
      evaluateExternalReferenceEmbedPolicy({
        sourceUrl: url,
        embedUrl: resolvedEmbedUrl,
        provider: providerId,
        policy: embedPolicy
      }),
    [embedPolicy, providerId, resolvedEmbedUrl, url]
  )
  const allowedEmbedPolicy = embedPolicyDecision.allowed ? embedPolicyDecision : null
  const allowedEmbedUrl = allowedEmbedPolicy?.embedUrl ?? null
  const accentClasses = PROVIDER_ACCENT_CLASSES[cardRenderer.accent]
  const resolvedRenderMode = resolveCanvasExternalReferenceRenderMode(
    renderMode,
    cardRenderer.renderModes
  )
  const fallbackSubtitle = normalizeValue(subtitle)
  const [metadataResult, setMetadataResult] = useState<ExternalReferenceMetadataResult | null>(null)
  const [isEmbedActivated, setIsEmbedActivated] = useState(defaultEmbedActivated)

  const setEmbedActivated = (activated: boolean) => {
    setIsEmbedActivated(activated)
    onEmbedActivationChange?.(activated)
  }

  useEffect(() => {
    const cacheKey = `${providerId}:${url}`
    if (EXTERNAL_REFERENCE_METADATA_CACHE.has(cacheKey)) {
      setMetadataResult(EXTERNAL_REFERENCE_METADATA_CACHE.get(cacheKey) ?? null)
      return
    }

    const controller = new AbortController()

    void resolveExternalReferenceMetadata({
      url,
      provider: providerId,
      fallbackTitle: title,
      fallbackSubtitle,
      signal: controller.signal
    })
      .then((result) => {
        EXTERNAL_REFERENCE_METADATA_CACHE.set(cacheKey, result)
        setMetadataResult(result)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        EXTERNAL_REFERENCE_METADATA_CACHE.set(cacheKey, null)
        setMetadataResult(null)
      })

    return () => {
      controller.abort()
    }
  }, [fallbackSubtitle, providerId, title, url])

  useEffect(() => {
    setIsEmbedActivated(defaultEmbedActivated)
  }, [allowedEmbedUrl, defaultEmbedActivated])

  const resolvedMetadata = metadataResult?.status === 'resolved' ? metadataResult.metadata : null
  const resolvedTitle = resolvedMetadata?.title ?? title
  const resolvedSubtitle = resolvedMetadata?.subtitle ?? fallbackSubtitle
  const permissionedTitle = createCanvasPermissionedCardField(
    { fieldId: 'title', label: 'Title', value: resolvedTitle },
    restrictedFields
  )
  const permissionedSubtitle = resolvedSubtitle
    ? createCanvasPermissionedCardField(
        { fieldId: 'subtitle', label: 'Subtitle', value: resolvedSubtitle },
        restrictedFields
      )
    : null
  const permissionedMetadata = createCanvasPermissionedCardFields(
    cardRenderer.metadata,
    restrictedFields
  )
  const lifecycle = normalizeLifecycleStatus(status)
  const embedFallback = createCanvasExternalReferenceEmbedFallback({
    policyDecision: embedPolicyDecision,
    metadataResult,
    lifecycleStatus: lifecycle?.status,
    providerLabel,
    emptyStateLabel: cardRenderer.emptyStateLabel
  })
  const canRenderLiveEmbed =
    Boolean(allowedEmbedUrl && allowedEmbedPolicy) && embedFallback?.disablesLiveEmbed !== true
  const shouldMountLiveEmbed =
    canRenderLiveEmbed && (resolvedRenderMode !== 'compact' || isEmbedActivated)
  const embedFrameTitle = useMemo(
    () => `${providerLabel} embed for ${permissionedTitle.displayValue}`,
    [permissionedTitle.displayValue, providerLabel]
  )

  return (
    <div
      className="flex h-full flex-col rounded-[22px] border border-border/70 bg-background p-3 shadow-lg shadow-black/5"
      data-canvas-node-card="true"
      data-canvas-card-kind="external-reference"
      data-canvas-theme={themeMode}
      data-canvas-embed-provider={providerId}
      data-canvas-embed-active={canRenderLiveEmbed ? 'true' : 'false'}
      data-canvas-embed-render-mode={resolvedRenderMode}
      data-canvas-embed-iframe-mounted={shouldMountLiveEmbed ? 'true' : 'false'}
      data-canvas-embed-policy={embedPolicyDecision.allowed ? 'allowed' : 'blocked'}
      data-canvas-embed-policy-reason={
        embedPolicyDecision.allowed ? undefined : embedPolicyDecision.reason
      }
      data-canvas-embed-fallback-reason={canRenderLiveEmbed ? undefined : embedFallback?.reason}
      data-canvas-provider-renderer={cardRenderer.kind}
      data-canvas-provider-accent={cardRenderer.accent}
      data-canvas-card-has-restricted-fields={
        [
          ...permissionedMetadata,
          permissionedTitle,
          ...(permissionedSubtitle ? [permissionedSubtitle] : [])
        ].some((field) => field.restricted)
          ? 'true'
          : 'false'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]',
            accentClasses.badge
          )}
          data-canvas-provider-badge="true"
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold',
              accentClasses.icon
            )}
          >
            {cardRenderer.iconLabel}
          </span>
          {allowedEmbedUrl ? cardRenderer.liveBadgeLabel : cardRenderer.badgeLabel}
        </span>
        <CanvasLifecycleStatusBadge status={status} />
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
        <div className="space-y-1">
          <div
            className="line-clamp-2 text-base font-semibold leading-tight text-foreground"
            data-canvas-embed-title="true"
            data-canvas-card-field="title"
            data-canvas-card-field-restricted={permissionedTitle.restricted ? 'true' : 'false'}
            data-canvas-card-field-restricted-reason={permissionedTitle.restrictionReason}
            data-canvas-card-field-required-permission={permissionedTitle.requiredPermission}
          >
            {permissionedTitle.displayValue}
          </div>
          {permissionedSubtitle ? (
            <p
              className="truncate text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
              data-canvas-embed-subtitle="true"
              data-canvas-card-field="subtitle"
              data-canvas-card-field-restricted={permissionedSubtitle.restricted ? 'true' : 'false'}
              data-canvas-card-field-restricted-reason={permissionedSubtitle.restrictionReason}
              data-canvas-card-field-required-permission={permissionedSubtitle.requiredPermission}
            >
              {permissionedSubtitle.displayValue}
            </p>
          ) : null}
        </div>

        {permissionedMetadata.length > 0 ? (
          <dl className="grid grid-cols-2 gap-2" data-canvas-provider-metadata="true">
            {permissionedMetadata.map((entry) => (
              <div
                key={`${entry.label}:${entry.fieldId}`}
                className={cn(
                  'min-w-0 rounded-lg border px-2 py-1.5 text-[11px]',
                  accentClasses.metadata
                )}
                data-canvas-card-field={entry.fieldId}
                data-canvas-card-field-restricted={entry.restricted ? 'true' : 'false'}
                data-canvas-card-field-restricted-reason={entry.restrictionReason}
                data-canvas-card-field-required-permission={entry.requiredPermission}
              >
                <dt className="font-medium">{entry.label}</dt>
                <dd className="truncate">{entry.displayValue}</dd>
                {entry.restricted && entry.requiredPermission ? (
                  <span className="sr-only" data-canvas-card-field-required-permission-label="true">
                    Requires {entry.requiredPermission}
                  </span>
                ) : null}
              </div>
            ))}
          </dl>
        ) : null}

        {canRenderLiveEmbed && allowedEmbedUrl && allowedEmbedPolicy ? (
          <div
            className={cn(
              'relative min-h-[116px] flex-1 overflow-hidden rounded-[18px] border',
              accentClasses.preview,
              themeMode === 'dark' ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]' : ''
            )}
            data-canvas-embed-node="true"
            data-canvas-embed-provider={providerId}
            data-canvas-embed-theme={themeMode}
            data-canvas-embed-activation={isEmbedActivated ? 'interactive' : 'shell'}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && isEmbedActivated) {
                event.stopPropagation()
                setEmbedActivated(false)
              }
            }}
          >
            {shouldMountLiveEmbed ? (
              <iframe
                title={embedFrameTitle}
                src={allowedEmbedUrl}
                loading="lazy"
                allow={allowedEmbedPolicy.allow}
                allowFullScreen
                sandbox={allowedEmbedPolicy.sandbox}
                referrerPolicy={allowedEmbedPolicy.referrerPolicy}
                tabIndex={isEmbedActivated ? 0 : -1}
                className={cn(
                  'absolute inset-0 h-full w-full border-0 bg-transparent',
                  isEmbedActivated ? 'pointer-events-auto' : 'pointer-events-none'
                )}
                data-canvas-embed-iframe="true"
              />
            ) : (
              <div
                className="absolute inset-0 grid place-items-center px-4 text-center"
                data-canvas-embed-compact-preview="true"
              >
                <div>
                  <div
                    className={cn(
                      'mx-auto grid h-12 w-12 place-items-center rounded-2xl text-sm font-bold shadow-sm',
                      accentClasses.icon
                    )}
                    aria-hidden="true"
                  >
                    {cardRenderer.iconLabel}
                  </div>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {cardRenderer.previewLabel}
                  </p>
                </div>
              </div>
            )}
            {isEmbedActivated ? (
              <button
                type="button"
                className="absolute right-2 top-2 z-20 rounded-md border border-white/15 bg-black/70 px-2 py-1 text-[11px] font-semibold uppercase text-white shadow-sm"
                aria-label={`Deactivate ${providerLabel} embed`}
                data-canvas-embed-deactivate="true"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  setEmbedActivated(false)
                }}
              >
                Done
              </button>
            ) : (
              <button
                type="button"
                className="absolute inset-0 z-10 grid place-items-center bg-black/5 text-white transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                aria-label={`Activate ${providerLabel} embed`}
                data-canvas-embed-activate="true"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  setEmbedActivated(true)
                }}
              >
                <span className="rounded-md bg-black/70 px-2.5 py-1.5 text-[11px] font-semibold uppercase shadow-sm">
                  Activate
                </span>
              </button>
            )}
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em]',
                accentClasses.footer
              )}
            >
              {cardRenderer.previewLabel}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'flex flex-1 flex-col justify-center gap-2 rounded-[18px] border border-dashed px-3 py-4',
              embedFallback?.tone === 'danger'
                ? 'border-red-500/35 bg-red-500/10'
                : 'border-border/60 bg-muted/30',
              embedFallback?.tone === 'warning' ? 'border-amber-500/35 bg-amber-500/10' : ''
            )}
            data-canvas-provider-fallback="true"
            data-canvas-embed-fallback="true"
            data-canvas-embed-fallback-reason={embedFallback?.reason ?? 'metadata-unavailable'}
            data-canvas-embed-fallback-tone={embedFallback?.tone ?? 'neutral'}
          >
            <span className="text-[11px] font-semibold uppercase text-muted-foreground">
              {embedFallback?.label ?? cardRenderer.emptyStateLabel}
            </span>
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {embedFallback?.description ?? url}
            </p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="w-fit rounded-md border border-border/60 bg-background/70 px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground hover:bg-background"
              data-canvas-embed-fallback-open="true"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              Open source
            </a>
          </div>
        )}

        {lifecycle?.status === 'error' ? (
          <CanvasFailedCardActions url={url} themeMode={themeMode} onAction={onFailedAction} />
        ) : null}

        <p className="truncate text-xs text-muted-foreground">{url}</p>
      </div>
    </div>
  )
}
