/**
 * DateRange property handler
 */

import type { PropertyHandler, PropertyEditorProps } from '../types'
import React, { useEffect, useMemo, useRef } from 'react'

/** DateRange value type */
export interface DateRangeValue {
  start: string
  end?: string
}

interface DateRangeConfig {
  includeTime?: boolean
}

function toInputValue(value: string | undefined, includeTime: boolean): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  if (includeTime) {
    return date.toISOString().slice(0, 16)
  }
  return date.toISOString().slice(0, 10)
}

function fromInputValue(value: string, includeTime: boolean): string | undefined {
  if (!value) return undefined
  if (includeTime) {
    const iso = new Date(value).toISOString()
    return Number.isNaN(new Date(iso).getTime()) ? undefined : iso
  }

  const iso = new Date(`${value}T00:00:00.000Z`).toISOString()
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso
}

/**
 * DateRange editor component
 */
function DateRangeEditor({
  value,
  onChange,
  onBlur,
  autoFocus,
  config,
  disabled
}: PropertyEditorProps<DateRangeValue>) {
  const includeTime = Boolean((config as DateRangeConfig | undefined)?.includeTime)
  const rootRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLInputElement>(null)

  const start = useMemo(() => toInputValue(value?.start, includeTime), [value?.start, includeTime])
  const end = useMemo(() => toInputValue(value?.end, includeTime), [value?.end, includeTime])

  useEffect(() => {
    if (autoFocus && startRef.current) {
      startRef.current.focus()
    }
  }, [autoFocus])

  const updateRange = (nextStart: string, nextEnd: string) => {
    const startIso = fromInputValue(nextStart, includeTime)
    const endIso = fromInputValue(nextEnd, includeTime)

    if (!startIso && !endIso) {
      onChange(null)
      return
    }

    if (!startIso && endIso) {
      onChange({ start: endIso, end: endIso })
      return
    }

    if (!startIso) {
      onChange(null)
      return
    }

    if (endIso && new Date(endIso).getTime() < new Date(startIso).getTime()) {
      onChange({ start: startIso, end: startIso })
      return
    }

    onChange({ start: startIso, ...(endIso ? { end: endIso } : {}) })
  }

  return (
    <div
      ref={rootRef}
      className="flex w-full items-center gap-1"
      onBlur={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && rootRef.current?.contains(next)) return
        onBlur?.()
      }}
    >
      <input
        ref={startRef}
        type={includeTime ? 'datetime-local' : 'date'}
        value={start}
        onChange={(event) => updateRange(event.target.value, end)}
        disabled={disabled}
        className="min-w-[130px] flex-1 border-none bg-transparent px-1 py-0.5 text-sm text-gray-900 outline-none dark:text-gray-100"
      />
      <span className="text-gray-400">→</span>
      <input
        type={includeTime ? 'datetime-local' : 'date'}
        value={end}
        onChange={(event) => updateRange(start, event.target.value)}
        disabled={disabled}
        className="min-w-[130px] flex-1 border-none bg-transparent px-1 py-0.5 text-sm text-gray-900 outline-none dark:text-gray-100"
      />
      {!disabled && (start || end) && (
        <button
          type="button"
          className="px-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange(null)}
          aria-label="Clear date range"
        >
          ×
        </button>
      )}
    </div>
  )
}

/**
 * Format a date range for display
 */
function formatDateRange(value: DateRangeValue | null | undefined): string {
  if (!value) return ''
  const { start, end } = value
  if (!start && !end) return ''
  const startText = start ? new Date(start).toLocaleDateString() : '?'
  const endText = end ? new Date(end).toLocaleDateString() : '?'
  if (startText === endText) return startText
  return `${startText} → ${endText}`
}

/**
 * DateRange property handler
 */
export const dateRangeHandler: PropertyHandler<DateRangeValue> = {
  type: 'dateRange',

  render(value) {
    const formatted = formatDateRange(value)
    if (!formatted) {
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }
    return <span className="text-gray-900 dark:text-gray-100">{formatted}</span>
  },

  compare(a, b) {
    const aStart = a?.start ?? ''
    const bStart = b?.start ?? ''
    return aStart.localeCompare(bStart)
  },

  filterOperators: ['isEmpty', 'isNotEmpty'],

  applyFilter(value, operator) {
    const isEmpty = !value || (!value.start && !value.end)

    switch (operator) {
      case 'isEmpty':
        return isEmpty
      case 'isNotEmpty':
        return !isEmpty
      default:
        return true
    }
  },

  Editor: DateRangeEditor
}
