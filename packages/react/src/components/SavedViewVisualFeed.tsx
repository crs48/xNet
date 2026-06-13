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
import { useEffect, useMemo, useRef, useState } from 'react'
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
  minCardPx: number
  maxColumns: number
  gridEstimateRowHeight: number
  listEstimateRowHeight: number
  titleClampClass: string
  titleSizeClass: string
  cardPaddingClass: string
  showMeta: boolean
  showDescription: boolean
  listThumbClass: string
}

const FEED_DENSITY_CONFIGS: Record<SavedViewFeedDensity, FeedDensityConfig> = {
  compact: {
    minCardPx: 150,
    maxColumns: 6,
    gridEstimateRowHeight: 168,
    listEstimateRowHeight: 56,
    titleClampClass: 'line-clamp-1',
    titleSizeClass: 'text-xs',
    cardPaddingClass: 'p-2',
    showMeta: false,
    showDescription: false,
    listThumbClass: 'h-10 w-[71px]'
  },
  cozy: {
    minCardPx: 210,
    maxColumns: 5,
    gridEstimateRowHeight: 224,
    listEstimateRowHeight: 80,
    titleClampClass: 'line-clamp-2',
    titleSizeClass: 'text-sm',
    cardPaddingClass: 'p-2.5',
    showMeta: true,
    showDescription: false,
    listThumbClass: 'h-14 w-[100px]'
  },
  comfortable: {
    minCardPx: 280,
    maxColumns: 4,
    gridEstimateRowHeight: 330,
    listEstimateRowHeight: 108,
    titleClampClass: 'line-clamp-2',
    titleSizeClass: 'text-sm',
    cardPaddingClass: 'p-2.5',
    showMeta: true,
    showDescription: true,
    listThumbClass: 'h-20 w-[142px]'
  }
}

const FEED_GRID_GAP_PX = 12

/** Columns that fit the measured container at the density's minimum card width. */
export function feedGridColumnCount(width: number, density: SavedViewFeedDensity): number {
  const config = FEED_DENSITY_CONFIGS[density]
  if (width <= 0) return config.maxColumns

  return Math.min(
    config.maxColumns,
    Math.max(1, Math.floor((width + FEED_GRID_GAP_PX) / (config.minCardPx + FEED_GRID_GAP_PX)))
  )
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

/** Merge locally cached enrichment over every preview in a feed. */
export function mergeFeedPreviews(
  previews: readonly SavedViewVisualPreviewModel[],
  enrichment: SavedViewFeedEnrichmentAdapter | undefined
): SavedViewVisualPreviewModel[] {
  if (!enrichment) return [...previews]

  return previews.map((preview) =>
    mergeSavedViewFeedEnrichment(preview, enrichment.lookup(preview))
  )
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

function useMeasuredWidth(): {
  ref: (element: HTMLDivElement | null) => void
  width: number
} {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const [width, setWidth] = useState(0)
  const ref = (element: HTMLDivElement | null): void => {
    if (element === elementRef.current) return
    observerRef.current?.disconnect()
    elementRef.current = element
    if (!element) return

    setWidth(element.getBoundingClientRect().width)
    if (typeof ResizeObserver !== 'undefined') {
      observerRef.current = new ResizeObserver((entries) => {
        const next = entries[0]?.contentRect.width
        if (typeof next === 'number') {
          setWidth((current) => (Math.abs(current - next) > 1 ? next : current))
        }
      })
      observerRef.current.observe(element)
    }
  }

  useEffect(() => () => observerRef.current?.disconnect(), [])

  return { ref, width }
}

/**
 * Thumbnail with a deterministic gradient letter tile fallback — used
 * when no image exists, the URL expired, or the client is offline.
 */
function FeedThumb({
  preview,
  letterClass,
  imageClass
}: {
  preview: SavedViewVisualPreviewModel
  letterClass: string
  imageClass?: string
}): JSX.Element {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const src = preview.thumbnailUrl

  if (!showFeedThumbnail(preview) || !src || failedSrc === src) {
    return <FeedLetterTile preview={preview} letterClass={letterClass} />
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailedSrc(src)}
      className={classNames(['h-full w-full object-cover', imageClass])}
    />
  )
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
      <FeedThumb
        preview={preview}
        letterClass="text-2xl"
        imageClass="transition-transform group-hover:scale-[1.02]"
      />

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

function FeedCreatorChip({
  creator
}: {
  creator: SavedViewVisualPreviewModel['creator']
}): JSX.Element | null {
  if (!creator) return null

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <UserRound size={10} className="shrink-0" />
      <span className="truncate">{creator.label}</span>
    </span>
  )
}

function FeedTimestampChip({
  preview
}: {
  preview: SavedViewVisualPreviewModel
}): JSX.Element | null {
  const label = feedTimestampLabel(preview)
  if (!label) return null

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <CalendarDays size={10} />
      {label}
    </span>
  )
}

function FeedMetaLine({ preview }: { preview: SavedViewVisualPreviewModel }): JSX.Element | null {
  if (!preview.creator && !preview.timestamp) return null

  return (
    <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
      <FeedCreatorChip creator={preview.creator} />
      <FeedTimestampChip preview={preview} />
    </div>
  )
}

function FeedCardMeta({
  preview,
  density
}: {
  preview: SavedViewVisualPreviewModel
  density: SavedViewFeedDensity
}): JSX.Element | null {
  if (!FEED_DENSITY_CONFIGS[density].showMeta) return null

  return <FeedMetaLine preview={preview} />
}

function FeedCardDescription({
  preview,
  density,
  className
}: {
  preview: SavedViewVisualPreviewModel
  density: SavedViewFeedDensity
  className: string
}): JSX.Element | null {
  if (!FEED_DENSITY_CONFIGS[density].showDescription || !preview.description) return null

  return <p className={className}>{preview.description}</p>
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
      <div className={classNames(['min-w-0 space-y-1', config.cardPaddingClass])}>
        <div className="flex items-start justify-between gap-1">
          <h3
            className={classNames([
              'min-w-0 flex-1 font-medium leading-snug',
              config.titleSizeClass,
              config.titleClampClass
            ])}
          >
            {preview.title}
          </h3>
          <FeedExternalLink preview={preview} />
        </div>
        <FeedCardMeta preview={preview} density={density} />
        <FeedCardDescription
          preview={preview}
          density={density}
          className="line-clamp-2 text-xs text-muted-foreground"
        />
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
        <FeedThumb preview={preview} letterClass="text-sm" />
      </div>
      <div className="min-w-0 flex-1">
        <h3
          className={classNames([
            'font-medium leading-snug',
            config.titleSizeClass,
            config.titleClampClass
          ])}
        >
          {preview.title}
        </h3>
        <FeedCardMeta preview={preview} density={density} />
        <FeedCardDescription
          preview={preview}
          density={density}
          className="mt-0.5 line-clamp-1 text-xs text-muted-foreground"
        />
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

export type FeedVirtualRowModel = {
  key: string | number | bigint
  index: number
  start: number
  measured: boolean
}

export type FeedVirtualRowWindow = {
  rows: FeedVirtualRowModel[]
  visibleStart: number
  visibleEnd: number
}

/**
 * Rows to render for the current scroll window, with an estimated
 * fallback window for environments where the virtualizer has not
 * measured the scroll element yet (initial paint, jsdom).
 */
export function buildFeedVirtualRowWindow(input: {
  virtualRows: readonly { key: string | number | bigint; index: number; start: number }[]
  rowCount: number
  estimateRowHeight: number
  overscan?: number
}): FeedVirtualRowWindow {
  const rows =
    input.virtualRows.length > 0
      ? input.virtualRows.map((virtualRow) => ({
          key: virtualRow.key,
          index: virtualRow.index,
          start: virtualRow.start,
          measured: true
        }))
      : Array.from(
          { length: Math.min(input.rowCount, input.overscan ?? FEED_OVERSCAN) },
          (_, index) => ({
            key: `initial-${index}`,
            index,
            start: index * input.estimateRowHeight,
            measured: false
          })
        )

  return {
    rows,
    visibleStart: rows[0]?.index ?? 0,
    visibleEnd: rows[rows.length - 1]?.index ?? 0
  }
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
  const {
    rows: renderedRows,
    visibleStart,
    visibleEnd
  } = buildFeedVirtualRowWindow({
    virtualRows: virtualizer.getVirtualItems(),
    rowCount,
    estimateRowHeight
  })

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
            ref={virtualRow.measured ? virtualizer.measureElement : undefined}
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

function FeedToggleButton({
  active,
  title,
  className,
  onClick,
  children
}: {
  active: boolean
  title?: string
  className: string
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={classNames([
        className,
        active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
      ])}
    >
      {children}
    </button>
  )
}

function FeedToolbar({
  itemCount,
  layout,
  density,
  onSelectLayout,
  onSelectDensity
}: {
  itemCount: number
  layout: SavedViewFeedLayout
  density: SavedViewFeedDensity
  onSelectLayout: (layout: SavedViewFeedLayout) => void
  onSelectDensity: (density: SavedViewFeedDensity) => void
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <GalleryVerticalEnd size={14} className="text-muted-foreground" />
        <span>Feed</span>
        <span className="text-xs font-normal text-muted-foreground">
          {itemCount.toLocaleString()} items
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <FeedToggleButton
            active={layout === 'list'}
            title="List layout"
            className="rounded p-1 transition-colors"
            onClick={() => onSelectLayout('list')}
          >
            <LayoutList size={13} />
          </FeedToggleButton>
          <FeedToggleButton
            active={layout === 'grid'}
            title="Grid layout"
            className="rounded p-1 transition-colors"
            onClick={() => onSelectLayout('grid')}
          >
            <LayoutGrid size={13} />
          </FeedToggleButton>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          {(Object.keys(FEED_DENSITY_CONFIGS) as SavedViewFeedDensity[]).map((candidate) => (
            <FeedToggleButton
              key={candidate}
              active={density === candidate}
              className="rounded px-1.5 py-0.5 text-[11px] transition-colors"
              onClick={() => onSelectDensity(candidate)}
            >
              {FEED_DENSITY_LABELS[candidate]}
            </FeedToggleButton>
          ))}
        </div>
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
  const { ref: containerRef, width: containerWidth } = useMeasuredWidth()
  const gridColumns = feedGridColumnCount(containerWidth, density)
  const enrichedPreviews = useMemo(
    () => mergeFeedPreviews(previews, enrichment),
    [enrichment, previews]
  )
  const gridRows = useMemo(
    () => (layout === 'grid' ? chunkFeedPreviews(enrichedPreviews, gridColumns) : []),
    [gridColumns, enrichedPreviews, layout]
  )
  const itemsPerRow = layout === 'grid' ? gridColumns : 1
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
    <div
      ref={containerRef}
      className="overflow-hidden rounded-md border border-border bg-background"
    >
      <FeedToolbar
        itemCount={previews.length}
        layout={layout}
        density={density}
        onSelectLayout={onSelectLayout}
        onSelectDensity={onSelectDensity}
      />
      {layout === 'grid' ? (
        <FeedVirtualRows
          key={`grid:${density}:${gridColumns}`}
          rowCount={gridRows.length}
          estimateRowHeight={config.gridEstimateRowHeight}
          onVisibleRangeChange={handleVisibleRangeChange}
          renderRow={(rowIndex) => (
            <div
              className="grid gap-3 p-3 pb-0"
              style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
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
