/**
 * DateRange property handler
 */

import React from 'react'
import type { PropertyHandler, PropertyEditorProps } from '../types'

/** DateRange value type */
export interface DateRangeValue {
  start: string
  end: string
}

/**
 * DateRange editor component (simplified - just shows dates, editing TBD)
 */
function DateRangeEditor({
  value,
  onChange,
  onBlur,
  disabled
}: PropertyEditorProps<DateRangeValue>) {
  // For now, simple text display - full editor would need date pickers
  const displayValue = value ? `${value.start || '?'} → ${value.end || '?'}` : ''

  return (
    <input
      type="text"
      value={displayValue}
      onChange={() => {
        /* Read-only for now */
      }}
      onBlur={onBlur}
      disabled={disabled}
      readOnly
      placeholder="Start → End"
      className="w-full h-full px-1 py-0.5 text-sm bg-transparent text-gray-900 dark:text-gray-100 border-none outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:opacity-50"
    />
  )
}

/**
 * Format a date range for display
 */
function formatDateRange(value: DateRangeValue | null | undefined): string {
  if (!value) return ''
  const { start, end } = value
  if (!start && !end) return ''
  if (start === end) return start || ''
  return `${start || '?'} → ${end || '?'}`
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
