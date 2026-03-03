/**
 * Person property handler
 */

import type { PropertyHandler, PropertyEditorProps } from '../types'
import React, { useEffect, useId, useMemo, useRef, useState } from 'react'

interface PersonSuggestion {
  did: string
  name?: string
}

interface PersonConfig {
  multiple?: boolean
  allowMultiple?: boolean
  suggestions?: Array<string | PersonSuggestion>
}

const DID_PATTERN = /^did:[a-z]+:[a-zA-Z0-9._:-]+$/

function isValidDid(value: string): boolean {
  return DID_PATTERN.test(value)
}

function normalizeSuggestions(config?: Record<string, unknown>): PersonSuggestion[] {
  const raw = (config as PersonConfig | undefined)?.suggestions
  if (!Array.isArray(raw)) return []

  return raw
    .map((entry) => {
      if (typeof entry === 'string') {
        return isValidDid(entry) ? { did: entry } : null
      }
      if (!entry || typeof entry !== 'object') return null
      const did = entry.did
      const name = entry.name
      if (!did || typeof did !== 'string' || !isValidDid(did)) return null
      return {
        did,
        ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {})
      }
    })
    .filter((entry): entry is PersonSuggestion => entry !== null)
}

function PersonEditor({
  value,
  config,
  onChange,
  onBlur,
  autoFocus,
  disabled
}: PropertyEditorProps<string | string[]>) {
  const allowMultiple = Boolean(
    (config as PersonConfig | undefined)?.multiple ??
    (config as PersonConfig | undefined)?.allowMultiple
  )
  const suggestions = useMemo(() => normalizeSuggestions(config), [config])
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const listboxId = useId()

  const selected = useMemo(() => {
    if (allowMultiple) {
      return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string')
        : []
    }
    return typeof value === 'string' && value ? [value] : []
  }, [allowMultiple, value])

  const filteredSuggestions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return suggestions.filter((candidate) => {
      if (selected.includes(candidate.did)) return false
      if (!needle) return true
      const name = candidate.name?.toLowerCase() ?? ''
      return candidate.did.toLowerCase().includes(needle) || name.includes(needle)
    })
  }, [query, selected, suggestions])

  const clearQuery = () => {
    setQuery('')
    setActiveIndex(0)
  }

  const commitDid = (did: string) => {
    if (!isValidDid(did)) return
    if (allowMultiple) {
      const next = selected.includes(did) ? selected : [...selected, did]
      onChange(next)
      clearQuery()
      setOpen(true)
      return
    }

    onChange(did)
    clearQuery()
    setOpen(false)
  }

  const removeDid = (did: string) => {
    if (allowMultiple) {
      onChange(selected.filter((entry) => entry !== did))
      return
    }
    onChange(null)
  }

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  return (
    <div
      ref={rootRef}
      className="relative w-full"
      onBlur={(e) => {
        const next = e.relatedTarget
        if (next instanceof Node && rootRef.current?.contains(next)) return
        setOpen(false)
        onBlur?.()
      }}
    >
      <div className="flex min-h-[24px] w-full items-center gap-1.5 px-1 py-0.5">
        {allowMultiple && selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map((did) => (
              <span
                key={did}
                className="inline-flex max-w-[240px] items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                title={did}
              >
                <span className="truncate">{did}</span>
                {!disabled && (
                  <button
                    type="button"
                    className="text-gray-400 hover:text-red-500"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => removeDid(did)}
                    aria-label={`Remove ${did}`}
                  >
                    ×
                  </button>
                )}
              </span>
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
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
              setActiveIndex(0)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setOpen(true)
                setActiveIndex((index) =>
                  filteredSuggestions.length === 0
                    ? 0
                    : Math.min(index + 1, filteredSuggestions.length - 1)
                )
                return
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveIndex((index) => Math.max(index - 1, 0))
                return
              }

              if (
                event.key === 'Backspace' &&
                !query.trim() &&
                selected.length > 0 &&
                allowMultiple
              ) {
                event.preventDefault()
                removeDid(selected[selected.length - 1])
                return
              }

              if (event.key === 'Enter') {
                event.preventDefault()
                const highlighted = filteredSuggestions[activeIndex]
                if (highlighted) {
                  commitDid(highlighted.did)
                  return
                }

                const typed = query.trim()
                if (isValidDid(typed)) {
                  commitDid(typed)
                }
                return
              }

              if (event.key === 'Escape') {
                setOpen(false)
              }
            }}
            placeholder={allowMultiple ? 'Add person DID...' : 'Person DID...'}
            className="min-w-[120px] flex-1 border-none bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        )}
      </div>

      {open && filteredSuggestions.length > 0 && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          {filteredSuggestions.map((candidate, index) => (
            <button
              key={candidate.did}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={`flex w-full flex-col items-start px-2 py-1.5 text-left text-sm ${
                index === activeIndex
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commitDid(candidate.did)}
            >
              {candidate.name && <span className="font-medium">{candidate.name}</span>}
              <span className="font-mono text-xs opacity-80">{candidate.did}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function formatPerson(value: string | string[] | null | undefined): string {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      .join(', ')
  }
  return typeof value === 'string' ? value : ''
}

export const personHandler: PropertyHandler<string | string[]> = {
  type: 'person',

  render(value) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
      }

      return (
        <div className="flex flex-wrap gap-1">
          {value.map((did) => (
            <span
              key={did}
              className="inline-flex max-w-[220px] items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              title={did}
            >
              <span className="truncate">{did}</span>
            </span>
          ))}
        </div>
      )
    }

    if (!value) {
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }

    return <span className="font-mono text-xs text-gray-900 dark:text-gray-100">{value}</span>
  },

  compare(a, b) {
    return formatPerson(a).localeCompare(formatPerson(b))
  },

  filterOperators: ['equals', 'notEquals', 'contains', 'notContains', 'isEmpty', 'isNotEmpty'],

  applyFilter(value, operator, filterValue) {
    const text = formatPerson(value).toLowerCase()
    const filterText = String(filterValue ?? '').toLowerCase()

    switch (operator) {
      case 'equals':
        return text === filterText
      case 'notEquals':
        return text !== filterText
      case 'contains':
        return text.includes(filterText)
      case 'notContains':
        return !text.includes(filterText)
      case 'isEmpty':
        return text.length === 0
      case 'isNotEmpty':
        return text.length > 0
      default:
        return true
    }
  },

  Editor: PersonEditor
}
