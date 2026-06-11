/**
 * Select property handler — single-select combobox with typeahead and
 * inline option creation (V2: options persist as SelectOption nodes via
 * config.onCreateOption).
 */

import type { PropertyHandler, PropertyEditorProps } from '../types'
import type { SelectOption } from '@xnetjs/data'
import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { optionChipStyle } from './optionColors.js'

interface SelectConfig {
  options?: SelectOption[]
  allowCreate?: boolean
  /** Persist a new option; returns its ID (V2 SelectOption node) */
  onCreateOption?: (name: string) => Promise<string | null>
  /** Seed the autocomplete query (type-to-replace first character) */
  initialQuery?: string
}

/**
 * Select editor component — combobox with typeahead filter and
 * "Create" entry for unknown names.
 */
function SelectEditor({
  value,
  onChange,
  onCommit,
  onCancel,
  onBlur,
  autoFocus,
  disabled,
  config
}: PropertyEditorProps<string>) {
  const cfg = (config ?? {}) as SelectConfig
  const options = cfg.options ?? []
  const allowCreate = cfg.allowCreate !== false
  const [query, setQuery] = useState(cfg.initialQuery ?? '')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const current = options.find((o) => o.id === value)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((o) => o.name.toLowerCase().includes(needle))
  }, [options, query])

  const normalizedQuery = query.trim()
  const canCreate =
    allowCreate &&
    normalizedQuery.length > 0 &&
    !options.some((o) => o.name.toLowerCase() === normalizedQuery.toLowerCase())

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
      setIsOpen(true)
    }
  }, [autoFocus])

  const pick = (optionId: string | null): void => {
    onChange(optionId)
    setIsOpen(false)
    onCommit?.(optionId, 'picker-select')
  }

  const createAndPick = async (): Promise<void> => {
    if (!canCreate) return
    if (cfg.onCreateOption) {
      const id = await cfg.onCreateOption(normalizedQuery)
      if (id) pick(id)
      return
    }
    // Fallback (legacy config-embedded options): slugified ID
    pick(normalizedQuery.toLowerCase().replace(/\s+/g, '-'))
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      onBlur={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && containerRef.current?.contains(next)) return
        setIsOpen(false)
        onBlur?.()
      }}
    >
      <div className="flex h-full items-center gap-1 px-1">
        {current && !query && (
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-xs"
            style={optionChipStyle(current.color)}
          >
            {current.name}
          </span>
        )}
        {!disabled && (
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            value={query}
            placeholder={current ? '' : 'Select or type…'}
            onFocus={() => setIsOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value)
              setIsOpen(true)
              setActiveIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
                setIsOpen(true)
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveIndex((i) => Math.max(i - 1, 0))
                return
              }
              if (event.key === 'Backspace' && !query && value) {
                event.preventDefault()
                onChange(null)
                return
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                event.stopPropagation()
                const highlighted = filtered[activeIndex]
                if (highlighted) {
                  pick(highlighted.id)
                } else if (canCreate) {
                  void createAndPick()
                }
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setIsOpen(false)
                onCancel?.()
              }
            }}
            className="min-w-[60px] flex-1 border-none bg-transparent py-0.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        )}
      </div>

      {isOpen && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 max-h-48 w-full min-w-[180px] overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {value && (
            <button
              type="button"
              className="w-full px-2 py-1 text-left text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(null)}
            >
              Clear
            </button>
          )}
          {filtered.map((opt, index) => (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={`flex w-full items-center gap-2 px-2 py-1 text-left ${
                index === activeIndex
                  ? 'bg-blue-50 dark:bg-blue-900/20'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(opt.id)}
            >
              <span
                className="inline-flex items-center rounded px-1.5 py-0.5 text-xs"
                style={optionChipStyle(opt.color)}
              >
                {opt.name}
              </span>
            </button>
          ))}
          {filtered.length === 0 && !canCreate && (
            <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">No matches</div>
          )}
          {canCreate && (
            <button
              type="button"
              className="w-full px-2 py-1 text-left text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/20"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void createAndPick()}
            >
              ＋ Create "{normalizedQuery}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Get option by ID
 */
function getOption(
  value: string | null | undefined,
  config?: Record<string, unknown>
): SelectOption | undefined {
  if (!value) return undefined
  const options = (config as SelectConfig)?.options ?? []
  return options.find((o) => o.id === value)
}

/**
 * Select property handler
 */
export const selectHandler: PropertyHandler<string> = {
  type: 'select',

  render(value, config) {
    const option = getOption(value, config)
    if (!option) {
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-xs"
        style={optionChipStyle(option.color)}
      >
        {option.name}
      </span>
    )
  },

  compare(a, b, config) {
    const optA = getOption(a, config)
    const optB = getOption(b, config)
    const nameA = optA?.name ?? ''
    const nameB = optB?.name ?? ''
    return nameA.localeCompare(nameB)
  },

  filterOperators: ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'],

  applyFilter(value, operator, filterValue) {
    switch (operator) {
      case 'equals':
        return value === filterValue
      case 'notEquals':
        return value !== filterValue
      case 'isEmpty':
        return value === null || value === undefined
      case 'isNotEmpty':
        return value !== null && value !== undefined
      default:
        return true
    }
  },

  Editor: SelectEditor
}
