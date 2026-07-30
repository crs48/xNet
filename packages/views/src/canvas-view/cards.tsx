/**
 * Shared CanvasView cards (exploration 0277, E2/E9): the static page/note
 * preview card and the pinned source-record card, extracted from the
 * desktop canvas so web renders the same nodes identically.
 */

import type { CanvasNode, CanvasNodeRenderContext } from '@xnetjs/canvas'
import type { JSX } from 'react'
import { Database, Eye, FileText, StickyNote } from 'lucide-react'
import React from 'react'
import { getCanvasShellPreviewModel, type LinkedDocumentItem } from './canvas-shell.js'

export type CanvasNodeCardActions = {
  onOpen?: () => void
  onPeek?: () => void
}

export function stopCanvasCardAction(event: React.MouseEvent<HTMLButtonElement>): void {
  event.preventDefault()
  event.stopPropagation()
}

export function readStringList(value: unknown, limit = 4): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .flatMap((item) => (typeof item === 'string' && item.trim() ? [item.trim()] : []))
    .slice(0, limit)
}

export function schemaIdLabel(schemaId: string | undefined): string {
  if (!schemaId) {
    return 'Source record'
  }

  const withoutVersion = schemaId.split('@')[0] ?? schemaId
  const lastSegment = withoutVersion.split('/').pop()
  return lastSegment && lastSegment.trim().length > 0 ? lastSegment.trim() : schemaId
}

export function isPinnedSourceRecordCard(node: CanvasNode): boolean {
  return (
    node.type === 'external-reference' &&
    (node.properties.sourceCardRole === 'query-result' ||
      node.properties.sourceCardRole === 'social-projection')
  )
}

export interface CanvasPinnedSourceRecordCardProps {
  node: CanvasNode
  title: string
  status: string | null
  themeMode: 'light' | 'dark'
  sourceId?: string | null
  statusBadge?: React.ReactNode
}

export function CanvasPinnedSourceRecordCard({
  node,
  title,
  themeMode,
  sourceId,
  statusBadge
}: CanvasPinnedSourceRecordCardProps): JSX.Element {
  const badges = readStringList(node.properties.badges)
  const description =
    typeof node.properties.description === 'string' ? node.properties.description : null
  const pinnedSubtitle =
    typeof node.properties.subtitle === 'string' ? node.properties.subtitle : null
  const href = typeof node.properties.href === 'string' ? node.properties.href : null

  return (
    <div
      className="flex h-full flex-col justify-between rounded-[24px] border border-border/70 bg-background p-4 shadow-lg shadow-black/5"
      data-canvas-node-card="true"
      data-canvas-card-kind="source-record"
      data-canvas-pinned-source-card="true"
      data-canvas-source-node-id={sourceId ?? undefined}
      data-canvas-source-schema-id={node.sourceSchemaId}
      data-canvas-theme={themeMode}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Database size={12} />
          <span className="truncate">{schemaIdLabel(node.sourceSchemaId)}</span>
        </span>
        {statusBadge}
      </div>

      <div className="space-y-2">
        <div className="text-lg font-semibold leading-tight text-foreground">{title}</div>
        {pinnedSubtitle || description ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {description ?? pinnedSubtitle}
          </p>
        ) : null}
        {href ? <p className="truncate text-xs text-muted-foreground">{href}</p> : null}
      </div>

      {badges.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1.5 overflow-hidden">
          {badges.map((badge) => (
            <span
              key={badge}
              className="max-w-full truncate rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {badge}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export interface CanvasPageStaticPreviewCardProps {
  node: CanvasNode
  document: LinkedDocumentItem | undefined
  themeMode: 'light' | 'dark'
  context?: CanvasNodeRenderContext
  actions?: CanvasNodeCardActions
}

export function CanvasPageStaticPreviewCard({
  node,
  document,
  themeMode,
  context,
  actions
}: CanvasPageStaticPreviewCardProps): JSX.Element {
  const model = getCanvasShellPreviewModel(node, document)
  const previewMode =
    context && (context.lod !== 'full' || context.viewportZoom < 0.9) ? 'low-zoom' : 'static'
  const isNote = model?.displayType === 'note'
  const title =
    model?.title ??
    node.alias ??
    document?.title ??
    (node.properties.title as string) ??
    (isNote ? 'Untitled Note' : 'Untitled Page')
  const badge = model?.badge ?? (isNote ? 'Note' : 'Page')
  const previewLines = model?.previewLines ?? []
  const accentClass = isNote
    ? 'border-amber-300/70 bg-amber-50/80 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100'
    : 'border-sky-300/70 bg-sky-50/80 text-sky-950 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100'

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-[24px] border border-border/70 bg-background shadow-lg shadow-black/5"
      data-canvas-page-preview="true"
      data-canvas-page-preview-mode={previewMode}
      data-canvas-page-preview-kind={isNote ? 'note' : 'page'}
      data-canvas-theme={themeMode}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${accentClass}`}
        >
          {isNote ? <StickyNote size={12} /> : <FileText size={12} />}
          {badge}
        </span>

        <div className="flex items-center gap-1.5">
          {actions?.onPeek ? (
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-full border border-border/60 bg-background px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={(event) => {
                stopCanvasCardAction(event)
                actions.onPeek?.()
              }}
              aria-label={`Peek ${title}`}
              title={`Peek ${title}`}
              data-canvas-interactive="true"
              data-canvas-page-peek="true"
            >
              <Eye size={13} />
              Peek
            </button>
          ) : null}
          {actions?.onOpen ? (
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-full border border-border/60 bg-background px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
              onClick={(event) => {
                stopCanvasCardAction(event)
                actions.onOpen?.()
              }}
              aria-label={`Open ${title}`}
              title={`Open ${title}`}
              data-canvas-interactive="true"
              data-canvas-page-open="true"
            >
              <FileText size={13} />
              Open
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <div className="mb-3 line-clamp-2 text-lg font-semibold leading-tight text-foreground">
          {title}
        </div>

        <div className="min-h-0 flex-1 rounded-2xl border border-border/55 bg-muted/20 p-3">
          {previewLines.length > 0 ? (
            <div className="space-y-2 text-sm leading-6 text-muted-foreground">
              {previewLines.map((line, index) => (
                <p key={`${line}:${index}`} className="line-clamp-1">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <div className="space-y-2" aria-hidden="true">
              <div className="h-2.5 w-11/12 rounded-full bg-muted-foreground/18" />
              <div className="h-2.5 w-4/5 rounded-full bg-muted-foreground/14" />
              <div className="h-2.5 w-2/3 rounded-full bg-muted-foreground/10" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
