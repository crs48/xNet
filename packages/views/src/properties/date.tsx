/**
 * Date property handler
 */

import React, { useEffect, useRef } from 'react'
import type { PropertyHandler, PropertyEditorProps } from '../types'

/**
 * Date editor component
 */
function DateEditor({
  value,
  onChange,
  onBlur,
  autoFocus,
  disabled,
  config
}: PropertyEditorProps<number>) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  // Convert timestamp to date string for input
  const dateString = value ? new Date(value).toISOString().split('T')[0] : ''

  const includeTime = config?.includeTime as boolean

  return (
    <input
      ref={inputRef}
      type={includeTime ? 'datetime-local' : 'date'}
      value={includeTime && value ? new Date(value).toISOString().slice(0, 16) : dateString}
      onChange={(e) => {
        const date = e.target.value ? new Date(e.target.value).getTime() : null
        onChange(date)
      }}
      onBlur={onBlur}
      disabled={disabled}
      className="property-editor property-editor-date"
    />
  )
}

/**
 * Format date for display
 */
function formatDate(value: number | null | undefined, config?: Record<string, unknown>): string {
  if (value === null || value === undefined) return ''

  const date = new Date(value)
  const format = (config?.format as string) ?? 'short'
  const includeTime = config?.includeTime as boolean

  const dateOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: format === 'long' ? 'long' : 'short',
    day: 'numeric'
  }

  if (includeTime) {
    dateOptions.hour = '2-digit'
    dateOptions.minute = '2-digit'
  }

  return date.toLocaleDateString('en-US', dateOptions)
}

/**
 * Date property handler
 */
export const dateHandler: PropertyHandler<number> = {
  type: 'date',

  render(value, config) {
    if (value === null || value === undefined) {
      return <span className="property-empty">Empty</span>
    }
    return <span className="property-date">{formatDate(value, config)}</span>
  },

  compare(a, b) {
    const aTime = a ?? 0
    const bTime = b ?? 0
    return aTime - bTime
  },

  filterOperators: ['equals', 'notEquals', 'before', 'after', 'isEmpty', 'isNotEmpty'],

  applyFilter(value, operator, filterValue) {
    const time = value ?? 0
    const filter = Number(filterValue) || 0

    switch (operator) {
      case 'equals': {
        // Compare dates (ignoring time)
        const d1 = new Date(time).setHours(0, 0, 0, 0)
        const d2 = new Date(filter).setHours(0, 0, 0, 0)
        return d1 === d2
      }
      case 'notEquals': {
        const d1 = new Date(time).setHours(0, 0, 0, 0)
        const d2 = new Date(filter).setHours(0, 0, 0, 0)
        return d1 !== d2
      }
      case 'before':
        return time < filter
      case 'after':
        return time > filter
      case 'isEmpty':
        return value === null || value === undefined
      case 'isNotEmpty':
        return value !== null && value !== undefined
      default:
        return true
    }
  },

  Editor: DateEditor
}
