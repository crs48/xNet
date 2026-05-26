/**
 * CanvasPluginFallbackCard - Recoverable card UI for missing plugin renderers.
 */

import type {
  CanvasMissingPluginFallback,
  CanvasMissingPluginFallbackAction,
  CanvasMissingPluginFallbackActionKind,
  CanvasMissingPluginFallbackTone
} from './canvasPluginFallbacks'
import type { JSX } from 'react'
import React from 'react'
import { cn } from '../utils'
import { CanvasCardAuditTrail, type CanvasCardAuditEntry } from './CanvasCardAuditTrail'

export type CanvasPluginFallbackCardProps = {
  fallback: CanvasMissingPluginFallback
  themeMode: 'light' | 'dark'
  title?: string | null
  subtitle?: string | null
  auditEntries?: readonly CanvasCardAuditEntry[] | null
  onAction?: (
    action: CanvasMissingPluginFallbackActionKind,
    fallback: CanvasMissingPluginFallback
  ) => void
}

const TONE_CLASSES: Record<
  CanvasMissingPluginFallbackTone,
  {
    frame: string
    badge: string
    icon: string
    panel: string
  }
> = {
  neutral: {
    frame: 'border-border/70 bg-background',
    badge: 'bg-muted text-muted-foreground',
    icon: 'bg-background text-foreground',
    panel: 'border-border/60 bg-muted/30'
  },
  warning: {
    frame: 'border-amber-500/35 bg-background',
    badge: 'bg-amber-500/10 text-amber-800 dark:text-amber-100',
    icon: 'bg-amber-500 text-white',
    panel: 'border-amber-500/35 bg-amber-500/10'
  },
  danger: {
    frame: 'border-red-500/35 bg-background',
    badge: 'bg-red-500/10 text-red-700 dark:text-red-100',
    icon: 'bg-red-500 text-white',
    panel: 'border-red-500/35 bg-red-500/10'
  }
}

function normalizeValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function formatPermissions(requiredPermissions: readonly string[]): string | null {
  if (requiredPermissions.length === 0) {
    return null
  }

  return requiredPermissions.join(', ')
}

function getDisplayTitle(
  title: string | null | undefined,
  fallback: CanvasMissingPluginFallback
): string {
  return (
    normalizeValue(title) ?? fallback.contributionName ?? fallback.contributionId ?? fallback.label
  )
}

function getDisplaySubtitle(
  subtitle: string | null | undefined,
  fallback: CanvasMissingPluginFallback
): string {
  return normalizeValue(subtitle) ?? fallback.pluginName ?? fallback.pluginId ?? 'Plugin card'
}

export function CanvasPluginFallbackCard({
  fallback,
  themeMode,
  title,
  subtitle,
  auditEntries,
  onAction
}: CanvasPluginFallbackCardProps): JSX.Element {
  const toneClasses = TONE_CLASSES[fallback.tone]
  const displayTitle = getDisplayTitle(title, fallback)
  const displaySubtitle = getDisplaySubtitle(subtitle, fallback)
  const permissionLabel = formatPermissions(fallback.requiredPermissions)

  const handleAction = (action: CanvasMissingPluginFallbackAction) => {
    onAction?.(action.kind, fallback)

    if (action.kind === 'open-source' && fallback.sourceUrl) {
      window.open(fallback.sourceUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-[22px] border p-3 shadow-lg shadow-black/5',
        toneClasses.frame
      )}
      data-canvas-node-card="true"
      data-canvas-card-kind="plugin-fallback"
      data-canvas-theme={themeMode}
      data-canvas-plugin-fallback="true"
      data-canvas-missing-plugin-reason={fallback.reason}
      data-canvas-plugin-fallback-tone={fallback.tone}
      data-canvas-plugin-id={fallback.pluginId ?? undefined}
      data-canvas-plugin-contribution-id={fallback.contributionId ?? undefined}
      data-canvas-plugin-preserves-source={fallback.preservesSource ? 'true' : 'false'}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'inline-flex min-w-0 items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]',
            toneClasses.badge
          )}
          data-canvas-plugin-fallback-badge="true"
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold',
              toneClasses.icon
            )}
          >
            PL
          </span>
          <span className="truncate">{fallback.label}</span>
        </span>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
        <div className="space-y-1">
          <div
            className="line-clamp-2 text-base font-semibold leading-tight text-foreground"
            data-canvas-plugin-fallback-title="true"
          >
            {displayTitle}
          </div>
          <p
            className="truncate text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
            data-canvas-plugin-fallback-subtitle="true"
          >
            {displaySubtitle}
          </p>
        </div>

        <div
          className={cn(
            'flex flex-1 flex-col justify-center gap-2 rounded-[18px] border border-dashed px-3 py-4',
            toneClasses.panel
          )}
          data-canvas-plugin-fallback-panel="true"
        >
          <span className="text-[11px] font-semibold uppercase text-muted-foreground">
            {fallback.label}
          </span>
          <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">
            {fallback.description}
          </p>
          {permissionLabel ? (
            <p
              className="truncate text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
              data-canvas-plugin-fallback-permissions="true"
            >
              {permissionLabel}
            </p>
          ) : null}
        </div>

        <div
          className="grid grid-cols-3 gap-1.5"
          data-canvas-plugin-fallback-actions="true"
          data-canvas-plugin-fallback-action-count={fallback.actions.length}
        >
          {fallback.actions.map((action) => (
            <button
              key={action.kind}
              type="button"
              className={cn(
                'min-w-0 rounded-md border px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors',
                themeMode === 'dark'
                  ? 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'
                  : 'border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted'
              )}
              aria-label={action.ariaLabel}
              data-canvas-plugin-fallback-action={action.kind}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                handleAction(action)
              }}
            >
              {action.label}
            </button>
          ))}
        </div>

        {auditEntries ? (
          <CanvasCardAuditTrail entries={auditEntries} themeMode={themeMode} maxEntries={3} />
        ) : null}

        <p
          className="truncate text-xs text-muted-foreground"
          data-canvas-plugin-fallback-source="true"
        >
          {fallback.sourceLabel ?? fallback.sourceUrl ?? 'Preserved canvas object data'}
        </p>
      </div>
    </div>
  )
}
