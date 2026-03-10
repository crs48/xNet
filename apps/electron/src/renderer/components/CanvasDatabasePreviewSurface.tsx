import type { CanvasNode } from '@xnetjs/canvas'
import type { CellValue, ColumnDefinition } from '@xnetjs/data'
import { DatabaseSchema } from '@xnetjs/data'
import { useDatabase, useDatabaseDoc, useIdentity, useNode } from '@xnetjs/react'
import { Database, LayoutGrid, Plus, Rows3 } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type CanvasDatabasePreviewSurfaceProps = {
  node: CanvasNode
  docId: string
  onOpenDocument?: (docId: string) => void
}

function useStableTitle(initialTitle: string, onCommit: (title: string) => Promise<void>) {
  const [localTitle, setLocalTitle] = useState(initialTitle)
  const isEditingRef = useRef(false)

  useEffect(() => {
    if (!isEditingRef.current) {
      setLocalTitle(initialTitle)
    }
  }, [initialTitle])

  const handleChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextTitle = event.target.value
      setLocalTitle(nextTitle)
      await onCommit(nextTitle)
    },
    [onCommit]
  )

  const handleFocus = useCallback(() => {
    isEditingRef.current = true
  }, [])

  const handleBlur = useCallback(() => {
    isEditingRef.current = false
    setLocalTitle(initialTitle)
  }, [initialTitle])

  return {
    localTitle,
    handleChange,
    handleFocus,
    handleBlur
  }
}

function formatCellValue(value: CellValue, column: ColumnDefinition): string {
  if (value === null) {
    return '—'
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (typeof value === 'number') {
    return String(value)
  }

  if (typeof value === 'string') {
    if (column.type === 'date') {
      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString()
      }
    }

    if (column.type === 'select') {
      const option =
        'options' in column.config
          ? column.config.options?.find((entry) => entry.id === value)
          : undefined
      return option?.name ?? value
    }

    return value || '—'
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '—'
    }

    if ('options' in column.config) {
      const optionNames = value.map(
        (entry) => column.config.options?.find((option) => option.id === entry)?.name ?? entry
      )
      return optionNames.join(', ')
    }

    return value.join(', ')
  }

  if ('name' in value) {
    return value.name
  }

  if ('start' in value && 'end' in value) {
    return `${new Date(value.start).toLocaleDateString()} - ${new Date(value.end).toLocaleDateString()}`
  }

  return '—'
}

export function CanvasDatabasePreviewSurface({
  node,
  docId,
  onOpenDocument
}: CanvasDatabasePreviewSurfaceProps): React.ReactElement {
  const { did } = useIdentity()
  const {
    data: database,
    loading: nodeLoading,
    update
  } = useNode(DatabaseSchema, docId, {
    createIfMissing: {
      title:
        (node.alias ?? (node.properties.title as string) ?? 'Untitled Database').trim() ||
        'Untitled Database'
    },
    did: did ?? undefined
  })
  const { columns, views, loading: docLoading, createColumn, createView } = useDatabaseDoc(docId)
  const {
    rows,
    loading: rowsLoading,
    activeView
  } = useDatabase(docId, {
    pageSize: 8
  })

  const orderedColumns = useMemo(
    () => [
      ...columns.filter((column) => column.isTitle),
      ...columns.filter((column) => !column.isTitle)
    ],
    [columns]
  )
  const previewColumns = useMemo(() => orderedColumns.slice(0, 3), [orderedColumns])
  const previewRows = useMemo(() => rows.slice(0, 5), [rows])
  const rowCount = Math.max(
    typeof database?.rowCount === 'number' ? database.rowCount : 0,
    rows.length
  )
  const title =
    database?.title ?? node.alias ?? (node.properties.title as string) ?? 'Untitled Database'
  const commitTitle = useCallback(
    async (nextTitle: string) => update({ title: nextTitle }),
    [update]
  )
  const { localTitle, handleChange, handleFocus, handleBlur } = useStableTitle(title, commitTitle)

  const handleOpenDocument = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onOpenDocument?.(docId)
    },
    [docId, onOpenDocument]
  )

  const handleStartTable = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      if (columns.length === 0) {
        const titleColumnId = createColumn({
          name: 'Title',
          type: 'text',
          config: {},
          isTitle: true,
          width: 260
        })

        if (titleColumnId && views.length === 0) {
          createView({
            name: 'Default View',
            type: 'table',
            visibleColumns: [titleColumnId],
            columnWidths: { [titleColumnId]: 260 },
            sorts: [],
            filters: null,
            groupBy: null
          })
        }

        return
      }

      if (views.length === 0) {
        createView({
          name: 'Default View',
          type: 'table',
          visibleColumns: columns.map((column) => column.id),
          columnWidths: Object.fromEntries(
            columns.map((column) => [column.id, column.width ?? (column.isTitle ? 260 : 160)])
          ),
          sorts: [],
          filters: null,
          groupBy: null
        })
      }
    },
    [columns, createColumn, createView, views.length]
  )

  const activeViewType = activeView?.type ?? database?.defaultView ?? 'table'
  const isEmpty = columns.length === 0
  const isLoading = nodeLoading || (!isEmpty && (docLoading || rowsLoading))

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-[22px] border border-border/60 bg-background/95 shadow-lg shadow-black/5"
      data-canvas-database-surface="true"
      data-canvas-database-empty={isEmpty ? 'true' : 'false'}
      data-canvas-source-id={docId}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-3">
          <input
            type="text"
            value={localTitle}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="Untitled Database"
            className="w-full border-none bg-transparent text-base font-semibold text-foreground outline-none placeholder:text-muted-foreground"
            data-canvas-database-title="true"
            data-canvas-interactive="true"
          />

          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              <Database size={12} />
              Database
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              <LayoutGrid size={12} />
              {activeViewType}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              <Rows3 size={12} />
              {rowCount} rows
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1">{columns.length} fields</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-border/60 bg-background px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
            onClick={handleOpenDocument}
            data-canvas-database-open="true"
            data-canvas-interactive="true"
          >
            Open
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4" data-canvas-interactive="true">
        {isEmpty ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/25 px-6 text-center">
            <p className="text-sm font-medium text-foreground">This database has no fields yet.</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Keep the canvas surface light: start a simple table here, then open the focused
              database surface for deeper schema and view work.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleStartTable}
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-background transition-opacity hover:opacity-90"
                data-canvas-database-start-table="true"
                data-canvas-interactive="true"
              >
                <Plus size={12} />
                Start table
              </button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex h-full min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/30 text-sm text-muted-foreground">
            Loading database preview...
          </div>
        ) : (
          <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
            <div
              className="grid border-b border-border/50 bg-background/70 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
              style={{ gridTemplateColumns: `repeat(${previewColumns.length}, minmax(0, 1fr))` }}
            >
              {previewColumns.map((column) => (
                <div key={column.id} className="truncate pr-3">
                  {column.name}
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-auto" data-canvas-database-rows="true">
              {previewRows.length > 0 ? (
                previewRows.map((row) => (
                  <div
                    key={row.id}
                    className="grid border-b border-border/40 px-3 py-2 text-sm last:border-b-0"
                    style={{
                      gridTemplateColumns: `repeat(${previewColumns.length}, minmax(0, 1fr))`
                    }}
                    data-canvas-database-row="true"
                  >
                    {previewColumns.map((column) => (
                      <div key={column.id} className="truncate pr-3 text-foreground/90">
                        {formatCellValue(row.cells[column.id] ?? null, column)}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <div className="flex min-h-[132px] items-center justify-center px-4 text-sm text-muted-foreground">
                  No rows yet. Add a row here or open the full database to keep shaping it.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
              <span>
                {views.length} view{views.length === 1 ? '' : 's'}
              </span>
              <span>
                Showing {previewRows.length} of {rowCount}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
