/**
 * GalleryView — V2 uniform card grid (exploration 0339).
 *
 * Uniform cards (Notion/Airtable-style, not masonry), virtualized as
 * rows-of-N with TanStack Virtual so 10k cards stay smooth. Cover images
 * come from the configured file field (`coverField`, crop vs fit via
 * `coverFit`); card width tier from `cardSize`.
 */

import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@xnetjs/ui'
import React, { useMemo, useRef } from 'react'
import { CardCover, FieldValueChip, WindowFootnote, firstFileRef } from './card-bits.js'
import {
  resolveCoverField,
  rowTitle,
  type CardSize,
  type DatabaseViewProps,
  type DatabaseViewRow
} from './contract.js'

const CARD_WIDTH: Record<CardSize, number> = { small: 180, medium: 240, large: 320 }
const COVER_HEIGHT: Record<CardSize, string> = { small: 'h-20', medium: 'h-28', large: 'h-40' }

function GalleryCard({
  row,
  props,
  cardFields,
  size
}: {
  row: DatabaseViewRow
  props: DatabaseViewProps
  cardFields: DatabaseViewProps['visibleFields']
  size: CardSize
}): React.JSX.Element {
  const coverField = resolveCoverField(props.fields, props.config)
  const cover = coverField ? firstFileRef(row.cells[coverField.id]) : null
  return (
    <button
      type="button"
      className="flex w-full flex-col overflow-hidden rounded-lg border border-hairline bg-surface-0 text-left shadow-sm transition-shadow hover:shadow-md"
      data-testid="gallery-card"
      data-row-id={row.id}
      onClick={() => props.onOpenRow?.(row.id)}
    >
      <CardCover
        fileRef={cover}
        fit={props.config.coverFit === 'contain' ? 'contain' : 'cover'}
        heightClass={COVER_HEIGHT[size]}
        onResolveFileUrl={props.onResolveFileUrl}
      />
      <div className="flex flex-col gap-1 p-2">
        <div className="truncate text-[13px] font-medium text-ink-1">
          {rowTitle(row, props.fields)}
        </div>
        {cardFields.map((field) => {
          const chip = <FieldValueChip field={field} value={row.cells[field.id]} />
          return chip == null ? null : <div key={field.id}>{chip}</div>
        })}
      </div>
    </button>
  )
}

export function GalleryView(props: DatabaseViewProps): React.JSX.Element {
  const { rows, visibleFields, fields, config, window: viewWindow, className, compact } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const size: CardSize = (config.cardSize as CardSize) ?? 'medium'
  const coverField = resolveCoverField(fields, config)

  const cardFields = useMemo(
    () => visibleFields.filter((f) => !f.isTitle && f.id !== coverField?.id).slice(0, 4),
    [visibleFields, coverField]
  )

  // Rows-of-N virtualization: measure columns from the container width.
  const [width, setWidth] = React.useState(0)
  React.useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  const gap = 12
  const padding = compact ? 8 : 16
  const columns = Math.max(1, Math.floor((width - padding * 2 + gap) / (CARD_WIDTH[size] + gap)))
  const virtualRows = Math.ceil(rows.length / columns)
  const estimatedRowHeight = (size === 'small' ? 150 : size === 'medium' ? 190 : 250) + gap

  const virtualizer = useVirtualizer({
    count: virtualRows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 4
  })

  return (
    <div
      className={cn('flex h-full flex-col overflow-hidden', className)}
      data-testid="gallery-view"
    >
      <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ padding }}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const slice = rows.slice(
              virtualRow.index * columns,
              virtualRow.index * columns + columns
            )
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  gap,
                  paddingBottom: gap
                }}
              >
                {slice.map((row) => (
                  <GalleryCard
                    key={row.id}
                    row={row}
                    props={props}
                    cardFields={cardFields}
                    size={size}
                  />
                ))}
              </div>
            )
          })}
        </div>
        {rows.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-ink-3">
            No rows match this view.
          </div>
        )}
      </div>
      <WindowFootnote shown={rows.length} window={viewWindow} />
    </div>
  )
}
