/**
 * renderCanvasNodeCard - the shared canvas node-card dispatcher
 * (exploration 0277). Both the web and desktop CanvasViews route their
 * `renderNode` callbacks through this single decision tree so a node
 * synced from either platform renders identically: pinned source
 * records, page/note static previews, external references, media/PDF
 * cards, and the generic shell card.
 */

import type { CanvasExternalReferenceRenderMode } from './canvasExternalReferenceCardRenderers'
import type { CanvasNode, CanvasNodeRenderContext } from '@xnetjs/canvas'
import type { BlobService } from '@xnetjs/data'
import type { ReactElement } from 'react'
import {
  CanvasPageStaticPreviewCard,
  CanvasPinnedSourceRecordCard,
  getCanvasShellSourceId,
  getCanvasViewDisplayType,
  isPinnedSourceRecordCard,
  shouldRenderCanvasShellCard,
  type CanvasNodeCardActions,
  type LinkedDocumentItem
} from '@xnetjs/views'
import { Database, FileImage } from 'lucide-react'
import {
  CanvasExternalReferenceCard,
  CanvasFailedCardActions,
  CanvasLifecycleStatusBadge
} from './CanvasExternalReferenceCard'
import {
  CanvasMediaCard,
  type CanvasMediaGate,
  type UpdateCanvasNodeProperties
} from './CanvasMediaCard'

export interface RenderCanvasNodeCardOptions {
  themeMode: 'light' | 'dark'
  document?: LinkedDocumentItem
  context?: CanvasNodeRenderContext
  actions?: CanvasNodeCardActions
  blobService?: BlobService | null
  onUpdateNodeProperties?: UpdateCanvasNodeProperties
  mediaGate?: CanvasMediaGate
  externalReferenceRenderMode?: CanvasExternalReferenceRenderMode
}

/** Should `renderNode` hand this node to `renderCanvasNodeCard`? */
export function shouldRenderCanvasNodeCard(
  node: CanvasNode,
  document?: LinkedDocumentItem
): boolean {
  return (
    node.type === 'external-reference' ||
    node.type === 'media' ||
    shouldRenderCanvasShellCard(node, document)
  )
}

export function renderCanvasNodeCard(
  node: CanvasNode,
  {
    themeMode,
    document,
    context,
    actions,
    blobService = null,
    onUpdateNodeProperties = () => {},
    mediaGate,
    externalReferenceRenderMode
  }: RenderCanvasNodeCardOptions
): ReactElement {
  const displayType = getCanvasViewDisplayType(node, document)
  const sourceId = getCanvasShellSourceId(node)
  const linkedTitle =
    node.alias ?? document?.title ?? (node.properties.title as string) ?? 'Untitled'
  const status = typeof node.properties.status === 'string' ? node.properties.status : null

  if (displayType === 'media') {
    return (
      <CanvasMediaCard
        node={node}
        title={linkedTitle}
        status={status}
        themeMode={themeMode}
        blobService={blobService}
        onUpdateNodeProperties={onUpdateNodeProperties}
        mediaGate={mediaGate}
      />
    )
  }

  if (displayType === 'external-reference' && isPinnedSourceRecordCard(node)) {
    return (
      <CanvasPinnedSourceRecordCard
        node={node}
        title={linkedTitle}
        status={status}
        themeMode={themeMode}
        sourceId={sourceId}
        statusBadge={<CanvasLifecycleStatusBadge status={status} />}
      />
    )
  }

  if (displayType === 'page' || displayType === 'note') {
    return (
      <CanvasPageStaticPreviewCard
        node={node}
        document={document}
        themeMode={themeMode}
        context={context}
        actions={actions}
      />
    )
  }

  if (displayType === 'external-reference') {
    return (
      <CanvasExternalReferenceCard
        title={linkedTitle}
        url={typeof node.properties.url === 'string' ? node.properties.url : 'Dropped URL'}
        provider={typeof node.properties.provider === 'string' ? node.properties.provider : null}
        embedUrl={typeof node.properties.embedUrl === 'string' ? node.properties.embedUrl : null}
        subtitle={typeof node.properties.subtitle === 'string' ? node.properties.subtitle : null}
        status={status}
        themeMode={themeMode}
        renderMode={externalReferenceRenderMode}
      />
    )
  }

  const subtitle = displayType === 'database' ? 'Database' : 'Media asset'
  const Icon = displayType === 'database' ? Database : FileImage
  const isOpenable = Boolean(sourceId && displayType === 'database')
  const summary =
    displayType === 'database'
      ? 'Open a focused database surface from the canvas.'
      : typeof node.properties.mimeType === 'string'
        ? `${String(node.properties.kind ?? 'file')} · ${node.properties.mimeType}`
        : 'Dropped media or file'

  return (
    <div
      className="flex h-full flex-col justify-between rounded-[24px] border border-border/70 bg-background p-4 shadow-lg shadow-black/5"
      data-canvas-node-card="true"
      data-canvas-card-kind={displayType}
      data-canvas-theme={themeMode}
      data-canvas-card-render-mode={displayType === 'database' ? 'compact' : undefined}
      data-canvas-database-compact-renderer={displayType === 'database' ? 'true' : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Icon size={12} />
          {subtitle}
        </span>
        {isOpenable ? (
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Open
          </span>
        ) : (
          <CanvasLifecycleStatusBadge status={status} />
        )}
      </div>

      <div className="space-y-2">
        <div className="text-lg font-semibold leading-tight text-foreground">{linkedTitle}</div>
        <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
        {status === 'error' ? (
          <CanvasFailedCardActions
            url={typeof node.properties.url === 'string' ? node.properties.url : null}
            themeMode={themeMode}
          />
        ) : null}
      </div>
    </div>
  )
}
