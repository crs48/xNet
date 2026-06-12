/**
 * @xnetjs/react - Media feed presentation for saved view previews.
 *
 * Renders content-shaped rows (videos, posts, saves, playlists) as a
 * thumbnail-forward feed with list/grid layouts and a density control.
 */

import type { SavedViewFeedDensity, SavedViewFeedLayout } from '@xnetjs/data'
import type { CSSProperties, JSX, KeyboardEvent, ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  CalendarDays,
  ExternalLink,
  GalleryVerticalEnd,
  LayoutGrid,
  LayoutList,
  Play,
  UserRound,
  X
} from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import {
  isSavedViewVisualPreviewEmbeddable,
  type SavedViewVisualPreviewModel
} from './savedViewVisualPreview'

export type SavedViewFeedEnrichmentEntry = {
  title?: string | null
  description?: string | null
  authorName?: string | null
  thumbnailUrl?: string | null
}

/**
 * Optional overlay that lets the host app merge locally cached metadata
 * (titles, descriptions, thumbnails) over imported preview rows and request
 * fetches for the previews currently on screen.
 */
export type SavedViewFeedEnrichmentAdapter = {
  lookup: (preview: SavedViewVisualPreviewModel) => SavedViewFeedEnrichmentEntry | null
  requestMany?: (previews: readonly SavedViewVisualPreviewModel[]) => void
}

type FeedDensityConfig = {
  gridColumns: number
  gridEstimateRowHeight: number
  listEstimateRowHeight: number
  titleClampClass: string
  showMeta: boolean
  showDescription: boolean
  listThumbClass: string
}

const FEED_DENSITY_CONFIGS: Record<SavedViewFeedDensity, FeedDensityConfig> = {
  compact: {
    gridColumns: 5,
    gridEstimateRowHeight: 168,
    listEstimateRowHeight: 56,
    titleClampClass: 'line-clamp-1',
    showMeta: false,
    showDescription: false,
    listThumbClass: 'h-10 w-[71px]'
  },
  cozy: {
    gridColumns: 4,
    gridEstimateRowHeight: 224,
    listEstimateRowHeight: 80,
    titleClampClass: 'line-clamp-2',
    showMeta: true,
    showDescription: false,
    listThumbClass: 'h-14 w-[100px]'
  },
  comfortable: {
    gridColumns: 3,
    gridEstimateRowHeight: 330,
    listEstimateRowHeight: 108,
    titleClampClass: 'line-clamp-2',
    showMeta: true,
    showDescription: true,
    listThumbClass: 'h-20 w-[142px]'
  }
}

const FEED_DENSITY_LABELS: Record<SavedViewFeedDensity, string> = {
  compact: 'Compact',
  cozy: 'Cozy',
  comfortable: 'Comfortable'
}

const FEED_OVERSCAN = 4

function classNames(values: readonly (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ')
}

export function mergeSavedViewFeedEnrichment(
  preview: SavedViewVisualPreviewModel,
  entry: SavedViewFeedEnrichmentEntry | null | undefined
): SavedViewVisualPreviewModel {
  if (!entry) return preview

  const title = entry.title?.trim()
  const description = entry.description?.trim()
  const authorName = entry.authorName?.trim()
  const thumbnailUrl = entry.thumbnailUrl?.trim()

  return {
    ...preview,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(authorName && !preview.creator ? { creator: { label: authorName } } : {})
  }
}

function feedThumbAspectClass(preview: SavedViewVisualPreviewModel): string {
  const provider = preview.provider ?? preview.platform
  if (provider === 'instagram' || provider === 'tiktok') return 'aspect-square'
  return 'aspect-video'
}

function feedTileStyle(seed: string): CSSProperties {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }
  const hue = Math.abs(hash) % 360

  return {
    background: `linear-gradient(135deg, hsl(${hue} 65% 42%), hsl(${(hue + 45) % 360} 70% 28%))`
  }
}

function feedProviderLabel(preview: SavedViewVisualPreviewModel): string {
  if (preview.provider && preview.provider !== 'generic') return preview.provider
  return preview.platform
}

function feedTimestampLabel(preview: SavedViewVisualPreviewModel): string | null {
  if (!preview.timestamp) return null
  return new Date(preview.timestamp).toLocaleDateString()
}

function showFeedThumbnail(preview: SavedViewVisualPreviewModel): boolean {
  return Boolean(preview.thumbnailUrl && preview.privacy === 'public')
}

function FeedLetterTile({
  preview,
  letterClass
}: {
  preview: SavedViewVisualPreviewModel
  letterClass: string
}): JSX.Element {
  const seed = preview.creator?.label ?? preview.title

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1 text-white/90"
      style={feedTileStyle(seed)}
    >
      <span className={classNames(['font-semibold', letterClass])}>
        {(seed.trim()[0] ?? '?').toUpperCase()}
      </span>
      <span className="max-w-[80%] truncate text-[10px] uppercase tracking-wide opacity-80">
        {feedProviderLabel(preview)}
      </span>
    </div>
  )
}

function FeedCardMedia({
  preview,
  live,
  onToggleLiveEmbed
}: {
  preview: SavedViewVisualPreviewModel
  live: boolean
  onToggleLiveEmbed: () => void
}): JSX.Element {
  const embeddable = isSavedViewVisualPreviewEmbeddable(preview)
  const aspectClass = feedThumbAspectClass(preview)

  if (live && embeddable) {
    return (
      <div className={classNames(['relative w-full overflow-hidden bg-black', aspectClass])}>
        <iframe
          title={preview.title}
          src={preview.embedUrl}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full"
        />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onToggleLiveEmbed()
          }}
          aria-label="Close live preview"
          className="absolute right-1.5 top-1.5 z-10 rounded-md bg-background/90 p-1 text-foreground transition-colors hover:bg-background"
        >
          <X size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className={classNames(['group relative w-full overflow-hidden bg-muted', aspectClass])}>
      {showFeedThumbnail(preview) ? (
        <img
          src={preview.thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
        />
      ) : (
        <FeedLetterTile preview={preview} letterClass="text-2xl" />
      )}
      <span className="absolute left-1.5 top-1.5 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
        {feedProviderLabel(preview)}
      </span>
      {embeddable ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onToggleLiveEmbed()
          }}
          aria-label={`Play ${preview.title}`}
          className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        >
          <span className="rounded-full bg-background/90 p-2.5 text-foreground shadow-sm">
            <Play size={16} />
          </span>
        </button>
      ) : null}
    </div>
  )
}

function FeedMetaLine({
  preview,
  showTimestamp = true
}: {
  preview: SavedViewVisualPreviewModel
  showTimestamp?: boolean
}): JSX.Element | null {
  const timestampLabel = showTimestamp ? feedTimestampLabel(preview) : null
  if (!preview.creator && !timestampLabel) return null

  return (
    <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
      {preview.creator ? (
        <span className="inline-flex min-w-0 items-center gap-1">
          <UserRound size={10} className="shrink-0" />
          <span className="truncate">{preview.creator.label}</span>
        </span>
      ) : null}
      {timestampLabel ? (
        <span className="inline-flex shrink-0 items-center gap-1">
          <CalendarDays size={10} />
          {timestampLabel}
        </span>
      ) : null}
    </div>
  )
}

function FeedExternalLink({
  preview
}: {
  preview: SavedViewVisualPreviewModel
}): JSX.Element | null {
  if (!preview.url) return null

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      aria-label={`Open ${preview.title}`}
      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <ExternalLink size={12} />
    </a>
  )
}

function feedItemInteraction(onSelect: () => void): {
  role: 'button'
  tabIndex: 0
  onClick: () => void
  onKeyDown: (event: KeyboardEvent) => void
} {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onSelect,
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect()
      }
    }
  }
}

function FeedGridCard({
  preview,
  density,
  selected,
  live,
  onSelect,
  onToggleLiveEmbed
}: {
  preview: SavedViewVisualPreviewModel
  density: SavedViewFeedDensity
  selected: boolean
  live: boolean
  onSelect: () => void
  onToggleLiveEmbed: () => void
}): JSX.Element {
  const config = FEED_DENSITY_CONFIGS[density]

  return (
    <article
      aria-label={`Feed item ${preview.title}`}
      {...feedItemInteraction(onSelect)}
      className={classNames([
        'min-w-0 cursor-pointer overflow-hidden rounded-md border bg-background shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-foreground' : 'border-border hover:border-foreground/40'
      ])}
    >
      <FeedCardMedia preview={preview} live={live} onToggleLiveEmbed={onToggleLiveEmbed} />
      <div className={classNames(['min-w-0 space-y-1', density === 'compact' ? 'p-2' : 'p-2.5'])}>
        <div className="flex items-start justify-between gap-1">
          <h3
            className={classNames([
              'min-w-0 flex-1 font-medium leading-snug',
              density === 'compact' ? 'text-xs' : 'text-sm',
              config.titleClampClass
            ])}
          >
            {preview.title}
          </h3>
          <FeedExternalLink preview={preview} />
        </div>
        {config.showMeta ? <FeedMetaLine preview={preview} /> : null}
        {config.showDescription && preview.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{preview.description}</p>
        ) : null}
      </div>
    </article>
  )
}

function FeedListRow({
  preview,
  density,
  selected,
  onSelect
}: {
  preview: SavedViewVisualPreviewModel
  density: SavedViewFeedDensity
  selected: boolean
  onSelect: () => void
}): JSX.Element {
  const config = FEED_DENSITY_CONFIGS[density]

  return (
    <article
      aria-label={`Feed item ${preview.title}`}
      {...feedItemInteraction(onSelect)}
      className={classNames([
        'flex min-w-0 cursor-pointer items-center gap-3 rounded-md border px-2 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-foreground bg-accent/40' : 'border-transparent hover:bg-accent/60'
      ])}
    >
      <div
        className={classNames(['shrink-0 overflow-hidden rounded bg-muted', config.listThumbClass])}
      >
        {showFeedThumbnail(preview) ? (
          <img
            src={preview.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <FeedLetterTile preview={preview} letterClass="text-sm" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3
          className={classNames([
            'font-medium leading-snug',
            density === 'compact' ? 'text-xs' : 'text-sm',
            config.titleClampClass
          ])}
        >
          {preview.title}
        </h3>
        {config.showMeta ? <FeedMetaLine preview={preview} /> : null}
        {config.showDescription && preview.description ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{preview.description}</p>
        ) : null}
      </div>
      <FeedExternalLink preview={preview} />
    </article>
  )
}

function chunkFeedPreviews(
  previews: readonly SavedViewVisualPreviewModel[],
  columnCount: number
): SavedViewVisualPreviewModel[][] {
  const rows: SavedViewVisualPreviewModel[][] = []

  for (let index = 0; index < previews.length; index += columnCount) {
    rows.push(previews.slice(index, index + columnCount))
  }

  return rows
}

function FeedVirtualRows({
  rowCount,
  estimateRowHeight,
  renderRow,
  onVisibleRangeChange
}: {
  rowCount: number
  estimateRowHeight: number
  renderRow: (rowIndex: number) => ReactNode
  onVisibleRangeChange?: (startIndex: number, endIndex: number) => void
}): JSX.Element {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowHeight,
    initialRect: { width: 1024, height: 640 },
    overscan: FEED_OVERSCAN
  })
  const virtualRows = virtualizer.getVirtualItems()
  const renderedRows =
    virtualRows.length > 0
      ? virtualRows.map((virtualRow) => ({
          key: virtualRow.key,
          index: virtualRow.index,
          start: virtualRow.start,
          measureRef: virtualizer.measureElement
        }))
      : Array.from({ length: Math.min(rowCount, FEED_OVERSCAN) }, (_, index) => ({
          key: `initial-${index}`,
          index,
          start: index * estimateRowHeight,
          measureRef: undefined
        }))
  const visibleStart = renderedRows[0]?.index ?? 0
  const visibleEnd = renderedRows[renderedRows.length - 1]?.index ?? 0

  useEffect(() => {
    onVisibleRangeChange?.(visibleStart, visibleEnd)
  }, [onVisibleRangeChange, visibleStart, visibleEnd])

  return (
    <div ref={parentRef} className="h-[640px] overflow-auto">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {renderedRows.map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualRow.measureRef}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            {renderRow(virtualRow.index)}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SavedViewVisualFeed({
  previews,
  layout,
  density,
  onSelectLayout,
  onSelectDensity,
  selectedSourceNodeId,
  activeEmbedPreviewId,
  onSelectPreview,
  onToggleLiveEmbed,
  enrichment
}: {
  previews: SavedViewVisualPreviewModel[]
  layout: SavedViewFeedLayout
  density: SavedViewFeedDensity
  onSelectLayout: (layout: SavedViewFeedLayout) => void
  onSelectDensity: (density: SavedViewFeedDensity) => void
  selectedSourceNodeId: string | null
  activeEmbedPreviewId: string | null
  onSelectPreview: (preview: SavedViewVisualPreviewModel) => void
  onToggleLiveEmbed: (preview: SavedViewVisualPreviewModel) => void
  enrichment?: SavedViewFeedEnrichmentAdapter
}): JSX.Element {
  const config = FEED_DENSITY_CONFIGS[density]
  const enrichedPreviews = useMemo(
    () =>
      enrichment
        ? previews.map((preview) =>
            mergeSavedViewFeedEnrichment(preview, enrichment.lookup(preview))
          )
        : previews,
    [enrichment, previews]
  )
  const gridRows = useMemo(
    () => (layout === 'grid' ? chunkFeedPreviews(enrichedPreviews, config.gridColumns) : []),
    [config.gridColumns, enrichedPreviews, layout]
  )
  const itemsPerRow = layout === 'grid' ? config.gridColumns : 1
  const handleVisibleRangeChange = useMemo(() => {
    if (!enrichment?.requestMany) return undefined

    return (startRow: number, endRow: number) => {
      const startIndex = startRow * itemsPerRow
      const endIndex = Math.min(enrichedPreviews.length, (endRow + 1) * itemsPerRow)
      const pending = previews
        .slice(startIndex, endIndex)
        .filter((preview) => !enrichment.lookup(preview))
      if (pending.length > 0) enrichment.requestMany?.(pending)
    }
  }, [enrichedPreviews.length, enrichment, itemsPerRow, previews])

  if (previews.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        No feed previews for these loaded rows.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GalleryVerticalEnd size={14} className="text-muted-foreground" />
          <span>Feed</span>
          <span className="text-xs font-normal text-muted-foreground">
            {previews.length.toLocaleString()} items
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => onSelectLayout('list')}
              title="List layout"
              aria-pressed={layout === 'list'}
              className={classNames([
                'rounded p-1 transition-colors',
                layout === 'list'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              ])}
            >
              <LayoutList size={13} />
            </button>
            <button
              type="button"
              onClick={() => onSelectLayout('grid')}
              title="Grid layout"
              aria-pressed={layout === 'grid'}
              className={classNames([
                'rounded p-1 transition-colors',
                layout === 'grid'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              ])}
            >
              <LayoutGrid size={13} />
            </button>
          </div>
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            {(Object.keys(FEED_DENSITY_CONFIGS) as SavedViewFeedDensity[]).map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => onSelectDensity(candidate)}
                aria-pressed={density === candidate}
                className={classNames([
                  'rounded px-1.5 py-0.5 text-[11px] transition-colors',
                  density === candidate
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                ])}
              >
                {FEED_DENSITY_LABELS[candidate]}
              </button>
            ))}
          </div>
        </div>
      </div>
      {layout === 'grid' ? (
        <FeedVirtualRows
          key={`grid:${density}`}
          rowCount={gridRows.length}
          estimateRowHeight={config.gridEstimateRowHeight}
          onVisibleRangeChange={handleVisibleRangeChange}
          renderRow={(rowIndex) => (
            <div
              className="grid gap-3 p-3 pb-0"
              style={{ gridTemplateColumns: `repeat(${config.gridColumns}, minmax(0, 1fr))` }}
            >
              {(gridRows[rowIndex] ?? []).map((preview) => (
                <FeedGridCard
                  key={preview.id}
                  preview={preview}
                  density={density}
                  selected={selectedSourceNodeId === preview.sourceNodeId}
                  live={activeEmbedPreviewId === preview.id}
                  onSelect={() => onSelectPreview(preview)}
                  onToggleLiveEmbed={() => onToggleLiveEmbed(preview)}
                />
              ))}
            </div>
          )}
        />
      ) : (
        <FeedVirtualRows
          key={`list:${density}`}
          rowCount={enrichedPreviews.length}
          estimateRowHeight={config.listEstimateRowHeight}
          onVisibleRangeChange={handleVisibleRangeChange}
          renderRow={(rowIndex) => {
            const preview = enrichedPreviews[rowIndex]
            if (!preview) return null

            return (
              <div className="px-2 pt-1">
                <FeedListRow
                  preview={preview}
                  density={density}
                  selected={selectedSourceNodeId === preview.sourceNodeId}
                  onSelect={() => onSelectPreview(preview)}
                />
              </div>
            )
          }}
        />
      )}
    </div>
  )
}
