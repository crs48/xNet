/**
 * ResponsiveTable - Adaptive table for all screen sizes
 *
 * - Mobile: Card layout with label-value pairs
 * - Desktop: Traditional table layout
 */

import * as React from 'react'
import { cn } from '../utils'

// ─── Types ─────────────────────────────────────────────────────────

export interface ResponsiveTableColumn<T> {
  /** Unique key for the column (must match a key in T) */
  key: keyof T
  /** Header text to display */
  header: string
  /** Custom render function for cell content */
  render?: (value: T[keyof T], row: T) => React.ReactNode
  /** Hide this column on mobile card view */
  hideOnMobile?: boolean
  /** Column alignment */
  align?: 'left' | 'center' | 'right'
  /** Column width (CSS value) */
  width?: string
  /** Whether this is the primary column (shown prominently on mobile) */
  primary?: boolean
}

export interface ResponsiveTableProps<T> {
  /** Data rows to display */
  data: T[]
  /** Column definitions */
  columns: ResponsiveTableColumn<T>[]
  /** Key field for unique row identification */
  keyField: keyof T
  /** Additional class names */
  className?: string
  /** Click handler for rows */
  onRowClick?: (row: T) => void
  /** Empty state content */
  emptyState?: React.ReactNode
  /** Loading state */
  loading?: boolean
  /** Striped rows on desktop */
  striped?: boolean
  /** Hover effect on rows */
  hoverable?: boolean
}

// ─── Component ─────────────────────────────────────────────────────

/**
 * Responsive table that shows cards on mobile and a table on desktop.
 *
 * @example
 * <ResponsiveTable
 *   data={users}
 *   keyField="id"
 *   columns={[
 *     { key: 'name', header: 'Name', primary: true },
 *     { key: 'email', header: 'Email' },
 *     { key: 'role', header: 'Role' },
 *     { key: 'createdAt', header: 'Joined', render: (v) => formatDate(v) },
 *   ]}
 *   onRowClick={(user) => navigate(`/users/${user.id}`)}
 * />
 */
export function ResponsiveTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyField,
  className,
  onRowClick,
  emptyState,
  loading,
  striped = false,
  hoverable = true
}: ResponsiveTableProps<T>) {
  // Get visible columns for desktop
  const visibleColumns = columns.filter((col) => !col.hideOnMobile)

  // Get primary column for mobile card header
  const primaryColumn = columns.find((col) => col.primary) || columns[0]

  if (loading) {
    return (
      <div className={cn('space-y-3', className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-background-muted md:h-12" />
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className={cn('py-8 text-center text-foreground-muted', className)}>
        {emptyState || 'No data available'}
      </div>
    )
  }

  return (
    <>
      {/* Mobile: Card layout */}
      <div className={cn('md:hidden space-y-3', className)}>
        {data.map((row) => (
          <MobileCard
            key={String(row[keyField])}
            row={row}
            columns={columns}
            primaryColumn={primaryColumn}
            onRowClick={onRowClick}
          />
        ))}
      </div>

      {/* Tablet/Desktop: Table layout */}
      <div className={cn('hidden md:block overflow-x-auto', className)}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              {visibleColumns.map((col) => (
                <th
                  key={String(col.key)}
                  className={cn(
                    'px-4 py-3',
                    'text-xs font-medium text-foreground-muted',
                    'uppercase tracking-wider',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                    col.align !== 'center' && col.align !== 'right' && 'text-left'
                  )}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={String(row[keyField])}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'border-b border-border-muted',
                  'transition-colors',
                  hoverable && 'hover:bg-background-muted',
                  striped && rowIndex % 2 === 1 && 'bg-background-muted/50',
                  onRowClick && 'cursor-pointer'
                )}
              >
                {visibleColumns.map((col) => (
                  <td
                    key={String(col.key)}
                    className={cn(
                      'px-4 py-3',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right'
                    )}
                  >
                    {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Internal Components ───────────────────────────────────────────

interface MobileCardProps<T> {
  row: T
  columns: ResponsiveTableColumn<T>[]
  primaryColumn: ResponsiveTableColumn<T>
  onRowClick?: (row: T) => void
}

function MobileCard<T extends Record<string, unknown>>({
  row,
  columns,
  primaryColumn,
  onRowClick
}: MobileCardProps<T>) {
  // Get non-primary columns for the card body
  const bodyColumns = columns.filter((col) => col !== primaryColumn)

  return (
    <div
      onClick={() => onRowClick?.(row)}
      className={cn(
        'rounded-lg border border-border p-4',
        'bg-card',
        'touch-active', // Active state for touch
        onRowClick && 'cursor-pointer active:bg-background-muted'
      )}
    >
      {/* Primary value as card header */}
      <div className="mb-3 font-medium text-foreground">
        {primaryColumn.render
          ? primaryColumn.render(row[primaryColumn.key], row)
          : String(row[primaryColumn.key] ?? '')}
      </div>

      {/* Other values as label-value pairs */}
      <div className="space-y-1.5">
        {bodyColumns.map((col) => (
          <div key={String(col.key)} className="flex justify-between gap-4">
            <span className="text-sm text-foreground-muted shrink-0">{col.header}</span>
            <span className="text-sm font-medium text-right truncate">
              {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
