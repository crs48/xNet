/**
 * Relation property handler
 */

import type { PropertyHandler, PropertyEditorProps } from '../types.js'
import type { DatabaseRow } from '@xnet/react'
import { useDatabase } from '@xnet/react'
import React, { useId, useMemo, useRef, useState } from 'react'

interface RelationConfig {
  targetDatabase?: string
  allowMultiple?: boolean
}

function getRowTitle(row: DatabaseRow): string {
  const title = row.cells.title ?? row.cells.name
  if (typeof title === 'string' && title.trim()) return title
  return row.id
}

interface RelationChipProps {
  id: string
  title: string
  onRemove?: () => void
}

function RelationChip({ id, title, onRemove }: RelationChipProps) {
  return (
    <span
      className="inline-flex max-w-[220px] items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
      title={id}
    >
      <span className="truncate">{title}</span>
      {onRemove && (
        <button
          type="button"
          className="text-gray-400 hover:text-red-500"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRemove}
          aria-label={`Remove ${title}`}
        >
          ×
        </button>
      )}
    </span>
  )
}

function RelationEditor({
  value,
  onChange,
  onBlur,
  config,
  disabled
}: PropertyEditorProps<string[]>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const relationConfig = (config as RelationConfig | undefined) ?? {}
  const targetDatabaseId = relationConfig.targetDatabase
  const allowMultiple = relationConfig.allowMultiple ?? true
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const listboxId = useId()

  const selected = Array.isArray(value) ? value : []
  const { rows } = useDatabase(targetDatabaseId ?? '', { pageSize: 40 })

  const selectedRows = useMemo(() => {
    const rowMap = new Map(rows.map((row) => [row.id, row]))
    return selected.map((id) => ({ id, row: rowMap.get(id) }))
  }, [rows, selected])

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (selected.includes(row.id)) return false
      if (!needle) return true
      const title = getRowTitle(row).toLowerCase()
      return row.id.toLowerCase().includes(needle) || title.includes(needle)
    })
  }, [query, rows, selected])

  const commit = (rowId: string) => {
    if (allowMultiple) {
      if (!selected.includes(rowId)) {
        onChange([...selected, rowId])
      }
    } else {
      onChange([rowId])
    }
    setQuery('')
    setActiveIndex(0)
    setOpen(allowMultiple)
  }

  const remove = (rowId: string) => {
    onChange(selected.filter((id) => id !== rowId))
  }

  const canAddManualId =
    query.trim().length > 0 &&
    !selected.includes(query.trim()) &&
    !rows.some((row) => row.id === query.trim())

  return (
    <div
      ref={rootRef}
      className="relative w-full"
      onBlur={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && rootRef.current?.contains(next)) return
        setOpen(false)
        onBlur?.()
      }}
    >
      <div
        className="flex min-h-[24px] w-full items-center gap-1 px-1 py-0.5"
        onClick={() => {
          if (disabled) return
          inputRef.current?.focus()
          setOpen(true)
        }}
      >
        {selectedRows.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selectedRows.map(({ id, row }) => (
              <RelationChip
                key={id}
                id={id}
                title={row ? getRowTitle(row) : id}
                onRemove={disabled ? undefined : () => remove(id)}
              />
            ))}
          </div>
        )}

        {!disabled && (
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
              setActiveIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActiveIndex((index) =>
                  candidates.length === 0 ? 0 : Math.min(index + 1, candidates.length - 1)
                )
                setOpen(true)
                return
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveIndex((index) => Math.max(index - 1, 0))
                return
              }

              if (event.key === 'Backspace' && !query && selected.length > 0) {
                event.preventDefault()
                remove(selected[selected.length - 1])
                return
              }

              if (event.key === 'Enter') {
                event.preventDefault()
                const highlighted = candidates[activeIndex]
                if (highlighted) {
                  commit(highlighted.id)
                  return
                }

                const manualId = query.trim()
                if (manualId) {
                  commit(manualId)
                }
                return
              }

              if (event.key === 'Escape') {
                setOpen(false)
              }
            }}
            placeholder={targetDatabaseId ? 'Search rows...' : 'Enter row ID...'}
            className="min-w-[120px] flex-1 border-none bg-transparent py-0.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        )}
      </div>

      {open && !disabled && targetDatabaseId && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          {candidates.map((row, index) => (
            <button
              key={row.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={`flex w-full flex-col items-start px-2 py-1.5 text-left ${
                index === activeIndex
                  ? 'bg-blue-50 dark:bg-blue-900/30'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(row.id)}
            >
              <span className="text-sm text-gray-800 dark:text-gray-200">{getRowTitle(row)}</span>
              <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{row.id}</span>
            </button>
          ))}

          {candidates.length === 0 && !canAddManualId && (
            <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">No matches</div>
          )}

          {canAddManualId && (
            <button
              type="button"
              className="w-full px-2 py-1 text-left text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/20"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(query.trim())}
            >
              Link "{query.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export const relationHandler: PropertyHandler<string[]> = {
  type: 'relation',

  render(value) {
    const rowIds = Array.isArray(value) ? value : []

    if (rowIds.length === 0) {
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }

    if (rowIds.length > 3) {
      return (
        <span className="text-gray-600 dark:text-gray-400 text-sm">{rowIds.length} linked</span>
      )
    }

    return (
      <div className="flex flex-wrap gap-1">
        {rowIds.map((id) => (
          <RelationChip key={id} id={id} title={id} />
        ))}
      </div>
    )
  },

  compare(a, b) {
    const aLen = Array.isArray(a) ? a.length : 0
    const bLen = Array.isArray(b) ? b.length : 0
    return aLen - bLen
  },

  filterOperators: ['isEmpty', 'isNotEmpty'],

  applyFilter(value, operator) {
    const rowIds = Array.isArray(value) ? value : []
    switch (operator) {
      case 'isEmpty':
        return rowIds.length === 0
      case 'isNotEmpty':
        return rowIds.length > 0
      default:
        return true
    }
  },

  Editor: RelationEditor
}
