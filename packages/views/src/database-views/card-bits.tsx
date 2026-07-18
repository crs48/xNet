/**
 * Shared card rendering bits for board/gallery/list/calendar cards:
 * compact field-value chips, async cover images, and the window-honesty
 * footnote (exploration 0339).
 */

import { isCellFileRef, type CellValue, type FileRef } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import React, { useEffect, useState } from 'react'
import type { GridField } from '../grid/model.js'
import { optionChipStyle } from '../properties/optionColors.js'
import { formatDayLabel, parseDateCell, parseDateRangeCell } from './date-model.js'

// ─── Field value chips ──────────────────────────────────────────────────────

function selectChip(field: GridField, optionId: string, key?: string): React.ReactNode {
  const option = field.options?.find((o) => o.id === optionId)
  const style = optionChipStyle(option?.color)
  return (
    <span
      key={key ?? optionId}
      className="inline-flex max-w-full items-center truncate rounded px-1.5 py-px text-[11px] leading-4"
      style={style}
    >
      {option?.name ?? optionId}
    </span>
  )
}

/**
 * Compact read-only rendering of one cell value for cards. Returns null
 * for empty values so cards skip the row entirely.
 */
export function FieldValueChip({
  field,
  value
}: {
  field: GridField
  value: CellValue | undefined
}): React.ReactNode {
  if (value == null || value === '') return null
  switch (field.type) {
    case 'select':
      return typeof value === 'string' ? selectChip(field, value) : null
    case 'multiSelect':
      return Array.isArray(value) && value.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {value
            .filter((v): v is string => typeof v === 'string')
            .map((v) => selectChip(field, v, v))}
        </span>
      ) : null
    case 'checkbox':
      return value === true ? <span className="text-[11px] text-ink-2">✓ {field.name}</span> : null
    case 'date': {
      const date = parseDateCell(value)
      return date ? <span className="text-[11px] text-ink-2">{formatDayLabel(date)}</span> : null
    }
    case 'dateRange': {
      const range = parseDateRangeCell(value)
      return range ? (
        <span className="text-[11px] text-ink-2">
          {formatDayLabel(range.start)} – {formatDayLabel(range.end)}
        </span>
      ) : null
    }
    case 'person': {
      const dids = Array.isArray(value) ? value : [value]
      const label = dids
        .filter((d): d is string => typeof d === 'string')
        .map((d) => d.split(':').pop()?.slice(0, 8) ?? d)
        .join(', ')
      return label ? <span className="text-[11px] text-ink-2">{label}</span> : null
    }
    case 'file': {
      const count = Array.isArray(value) ? value.length : isCellFileRef(value) ? 1 : 0
      return count > 0 ? (
        <span className="text-[11px] text-ink-3">
          {count} file{count === 1 ? '' : 's'}
        </span>
      ) : null
    }
    case 'url':
      return typeof value === 'string' ? (
        <span className="truncate text-[11px] text-blue-600 dark:text-blue-400">
          {value.replace(/^https?:\/\//, '')}
        </span>
      ) : null
    default: {
      if (typeof value === 'object') return null
      return <span className="truncate text-[11px] text-ink-2">{String(value)}</span>
    }
  }
}

/** First FileRef in a file cell (cover source). */
export function firstFileRef(value: CellValue | undefined): FileRef | null {
  if (Array.isArray(value)) {
    const first = value.find((v) => isCellFileRef(v))
    return (first as FileRef | undefined) ?? null
  }
  return isCellFileRef(value) ? (value as FileRef) : null
}

/** Resolve a FileRef to an object URL through the app's blob service. */
export function useFileUrl(
  ref: FileRef | null,
  onResolveFileUrl?: (ref: FileRef) => Promise<string>
): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setUrl(null)
    if (!ref || !onResolveFileUrl) return
    void onResolveFileUrl(ref)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved)
      })
      .catch(() => {
        /* missing blob: card renders without a cover */
      })
    return () => {
      cancelled = true
    }
  }, [ref?.cid, onResolveFileUrl]) // eslint-disable-line react-hooks/exhaustive-deps
  return url
}

/** Card cover image (image MIME types only; other files get no cover). */
export function CardCover({
  fileRef,
  fit,
  heightClass,
  onResolveFileUrl
}: {
  fileRef: FileRef | null
  fit: 'cover' | 'contain'
  heightClass: string
  onResolveFileUrl?: (ref: FileRef) => Promise<string>
}): React.JSX.Element | null {
  const isImage = fileRef?.mimeType.startsWith('image/') ?? false
  const url = useFileUrl(isImage ? fileRef : null, onResolveFileUrl)
  // No container until the blob resolves — unresolvable covers (missing
  // blobs, seed fixtures) must not leave a blank block on every card.
  if (!fileRef || !isImage || !url) return null
  return (
    <div className={cn('w-full overflow-hidden bg-surface-1', heightClass)}>
      <img
        src={url}
        className={cn('h-full w-full', fit === 'contain' ? 'object-contain' : 'object-cover')}
        alt={fileRef.name}
        loading="lazy"
        draggable={false}
      />
    </div>
  )
}

// ─── Window honesty ─────────────────────────────────────────────────────────

/**
 * "N of M" footnote when the fetch window truncates (exploration 0318:
 * never let a windowed view silently claim completeness).
 */
export function WindowFootnote({
  shown,
  window
}: {
  shown: number
  window: { size: number; total: number | null }
}): React.JSX.Element | null {
  const truncated = window.total !== null && window.total > window.size
  if (!truncated) return null
  return (
    <div className="px-2 py-1 text-[11px] text-ink-3" data-testid="window-footnote">
      {shown} of the first {window.size} rows — {window.total} match in total
    </div>
  )
}
