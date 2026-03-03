/**
 * Multi-select property handler
 */

import type { PropertyHandler, PropertyEditorProps } from '../types'
import type { SelectOption } from '@xnet/data'
import React, { useEffect, useId, useMemo, useRef, useState } from 'react'

interface MultiSelectConfig {
  options?: SelectOption[]
  allowCreate?: boolean
}

/**
 * Multi-select editor component
 */
function MultiSelectEditor({
  value,
  onChange,
  onBlur,
  autoFocus,
  disabled,
  config
}: PropertyEditorProps<string[]>) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const options = (config as MultiSelectConfig)?.options ?? []
  const allowCreate = Boolean((config as MultiSelectConfig)?.allowCreate)
  const selected = value ?? []

  const availableOptions = useMemo(
    () => options.filter((option) => !selected.includes(option.id)),
    [options, selected]
  )

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return availableOptions
    return availableOptions.filter((option) => {
      return option.name.toLowerCase().includes(needle) || option.id.toLowerCase().includes(needle)
    })
  }, [availableOptions, query])

  const normalizedQuery = query.trim()
  const createdOptionId = normalizedQuery.toLowerCase().replace(/\s+/g, '-')
  const canCreateOption =
    allowCreate &&
    normalizedQuery.length > 0 &&
    !selected.includes(createdOptionId) &&
    !options.some((option) => {
      return (
        option.id.toLowerCase() === createdOptionId ||
        option.name.toLowerCase() === normalizedQuery.toLowerCase()
      )
    })
  const listboxId = useId()

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
      setIsOpen(true)
    }
  }, [autoFocus])

  const toggleOption = (optionId: string) => {
    if (selected.includes(optionId)) {
      onChange(selected.filter((id) => id !== optionId))
    } else {
      onChange([...selected, optionId])
    }
  }

  const commitOption = (optionId: string) => {
    if (!selected.includes(optionId)) {
      onChange([...selected, optionId])
    }
    setQuery('')
    setActiveIndex(0)
    setIsOpen(true)
  }

  const getOptionLabel = (optionId: string): SelectOption => {
    const existing = options.find((option) => option.id === optionId)
    if (existing) return existing

    return {
      id: optionId,
      name: optionId,
      color: '#6b7280'
    }
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
      <div
        className="flex min-h-[24px] w-full items-center gap-1 px-1"
        onClick={() => {
          if (disabled) return
          inputRef.current?.focus()
          setIsOpen(true)
        }}
      >
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-0.5">
            {selected.map((id) => {
              const option = getOptionLabel(id)
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-white"
                  style={{ backgroundColor: option.color ?? '#6b7280' }}
                >
                  {option.name}
                  {!disabled && (
                    <button
                      type="button"
                      className="opacity-80 hover:opacity-100"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => toggleOption(id)}
                      aria-label={`Remove ${option.name}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              )
            })}
          </div>
        )}

        {!disabled && (
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value)
              setIsOpen(true)
              setActiveIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActiveIndex((index) =>
                  filteredOptions.length === 0 ? 0 : Math.min(index + 1, filteredOptions.length - 1)
                )
                setIsOpen(true)
                return
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveIndex((index) => Math.max(index - 1, 0))
                return
              }

              if (event.key === 'Backspace' && !query && selected.length > 0) {
                event.preventDefault()
                toggleOption(selected[selected.length - 1])
                return
              }

              if (event.key === 'Enter') {
                event.preventDefault()
                const highlighted = filteredOptions[activeIndex]
                if (highlighted) {
                  commitOption(highlighted.id)
                  return
                }

                if (canCreateOption) {
                  commitOption(createdOptionId)
                }
                return
              }

              if (event.key === 'Escape') {
                setIsOpen(false)
              }
            }}
            placeholder={selected.length === 0 ? 'Select or type...' : 'Add...'}
            className="min-w-[100px] flex-1 border-none bg-transparent py-0.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        )}

        {disabled && selected.length === 0 && (
          <span className="text-sm text-gray-400 dark:text-gray-500">Empty</span>
        )}
      </div>

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 max-h-48 w-full min-w-[180px] overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {filteredOptions.map((opt, index) => (
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
              onClick={() => commitOption(opt.id)}
            >
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-white"
                style={{ backgroundColor: opt.color ?? '#6b7280' }}
              >
                {opt.name}
              </span>
            </button>
          ))}

          {filteredOptions.length === 0 && !canCreateOption && (
            <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">No matches</div>
          )}

          {canCreateOption && (
            <button
              type="button"
              className="w-full px-2 py-1 text-left text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/20"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commitOption(createdOptionId)}
            >
              Create "{normalizedQuery}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Get options by IDs
 */
function getOptions(
  value: string[] | null | undefined,
  config?: Record<string, unknown>
): SelectOption[] {
  if (!value || value.length === 0) return []
  const options = (config as MultiSelectConfig)?.options ?? []
  return value.map((id) => options.find((o) => o.id === id) ?? { id, name: id, color: '#6b7280' })
}

/**
 * Multi-select property handler
 */
export const multiSelectHandler: PropertyHandler<string[]> = {
  type: 'multiSelect',

  render(value, config) {
    const options = getOptions(value, config)
    if (options.length === 0) {
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }
    return (
      <div className="flex flex-wrap gap-0.5">
        {options.map((opt) => (
          <span
            key={opt.id}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-white"
            style={{ backgroundColor: opt.color ?? '#6b7280' }}
          >
            {opt.name}
          </span>
        ))}
      </div>
    )
  },

  compare(a, b) {
    const aLen = a?.length ?? 0
    const bLen = b?.length ?? 0
    return aLen - bLen
  },

  filterOperators: ['contains', 'notContains', 'isEmpty', 'isNotEmpty'],

  applyFilter(value, operator, filterValue) {
    const selected = value ?? []

    switch (operator) {
      case 'contains':
        return selected.includes(filterValue as string)
      case 'notContains':
        return !selected.includes(filterValue as string)
      case 'isEmpty':
        return selected.length === 0
      case 'isNotEmpty':
        return selected.length > 0
      default:
        return true
    }
  },

  Editor: MultiSelectEditor
}
