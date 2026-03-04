/**
 * ReverseRelationsPanel - Panel showing rows that link TO a given row
 *
 * Displays "backlinks" - rows in other databases that have relation columns
 * pointing to this row, grouped by source database.
 */

import type { ColumnDefinition, CellValue } from '@xnetjs/data'
import { useReverseRelations, type DatabaseRow } from '@xnetjs/react'
import React, { useMemo } from 'react'

// ─── Icons ───────────────────────────────────────────────────────────────────

function LinkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReverseRelationsPanelProps {
  /** The row ID to find backlinks for */
  rowId: string
  /** The database ID containing the row */
  databaseId: string
  /** Callback when a backlink is clicked */
  onRowClick?: (rowId: string, databaseId: string) => void
}

interface GroupedRelations {
  sourceDatabaseId: string
  sourceDatabaseTitle: string
  column: ColumnDefinition
  rows: DatabaseRow[]
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${className}`} />
}

// ─── ReverseRelationsPanel ───────────────────────────────────────────────────

/**
 * Panel for displaying reverse relations (backlinks) to a row.
 */
export function ReverseRelationsPanel({
  rowId,
  databaseId,
  onRowClick
}: ReverseRelationsPanelProps): React.JSX.Element {
  const { relations, loading, error } = useReverseRelations(rowId, databaseId)

  // Group relations by source database
  const groupedRelations = useMemo(() => {
    const groups: Record<string, GroupedRelations> = {}

    for (const rel of relations) {
      const key = `${rel.sourceDatabaseId}:${rel.column.id}`

      if (!groups[key]) {
        groups[key] = {
          sourceDatabaseId: rel.sourceDatabaseId,
          sourceDatabaseTitle: rel.sourceDatabaseTitle,
          column: rel.column,
          rows: []
        }
      }

      groups[key].rows.push(rel.row)
    }

    return Object.values(groups)
  }, [relations])

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600 dark:text-red-400">
        Failed to load backlinks: {error.message}
      </div>
    )
  }

  if (relations.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
        <div className="flex flex-col items-center gap-2">
          <LinkIcon />
          <span>No other rows link to this item</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <LinkIcon />
        Linked from
      </h3>

      {groupedRelations.map((group) => (
        <div key={`${group.sourceDatabaseId}:${group.column.id}`} className="space-y-2">
          {/* Group header */}
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium">{group.sourceDatabaseTitle}</span>
            <span>&middot;</span>
            <span>{group.column.name}</span>
            <span className="text-gray-400 dark:text-gray-500">({group.rows.length})</span>
          </div>

          {/* Rows */}
          <div className="space-y-1">
            {group.rows.map((row) => (
              <ReverseRelationRow
                key={row.id}
                row={row}
                databaseId={group.sourceDatabaseId}
                onClick={onRowClick}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── ReverseRelationRow ──────────────────────────────────────────────────────

interface ReverseRelationRowProps {
  row: DatabaseRow
  databaseId: string
  onClick?: (rowId: string, databaseId: string) => void
}

function ReverseRelationRow({
  row,
  databaseId,
  onClick
}: ReverseRelationRowProps): React.JSX.Element {
  // Get title from common title columns
  const title = getRowTitle(row.cells)

  const handleClick = () => {
    onClick?.(row.id, databaseId)
  }

  if (onClick) {
    return (
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors text-left"
        type="button"
      >
        <span className="flex-1 truncate">{title}</span>
        <ChevronRightIcon />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300">
      <span className="truncate">{title}</span>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get display title from cell values.
 */
function getRowTitle(cells: Record<string, CellValue>): string {
  const title = cells.title ?? cells.name ?? cells.Name ?? cells.Title
  if (title != null) {
    return String(title)
  }

  // If no common title field, try to find first non-empty string value
  for (const value of Object.values(cells)) {
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  return 'Untitled'
}
