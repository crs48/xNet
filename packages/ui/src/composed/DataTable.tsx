import type { ReactNode } from 'react'
import { cn } from '../utils'

export interface Column<T> {
  key: keyof T | string
  label: string
  align?: 'left' | 'right' | 'center'
  render?: (value: unknown, row: T) => ReactNode
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  className?: string
  compact?: boolean
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  className,
  compact
}: DataTableProps<T>) {
  const cellPadding = compact ? 'px-2 py-0.5' : 'px-3 py-1.5'

  return (
    <div className={cn('w-full overflow-auto', className)}>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={cn(
                  cellPadding,
                  'font-medium text-muted-foreground text-left',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center'
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-accent/50">
              {columns.map((col) => (
                <td
                  key={String(col.key)}
                  className={cn(
                    cellPadding,
                    'text-foreground',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center'
                  )}
                >
                  {col.render
                    ? col.render(row[col.key as keyof T], row)
                    : String(row[col.key as keyof T] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
