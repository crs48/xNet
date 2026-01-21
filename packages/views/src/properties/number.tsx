/**
 * Number property handler
 */

import React, { useEffect, useRef } from 'react'
import type { PropertyHandler, PropertyEditorProps } from '../types'

/**
 * Number editor component
 */
function NumberEditor({
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
      inputRef.current.select()
    }
  }, [autoFocus])

  const format = (config?.format as string) ?? 'number'
  const step = format === 'percent' ? 0.01 : 1

  return (
    <input
      ref={inputRef}
      type="number"
      value={value ?? ''}
      onChange={(e) => {
        const num = parseFloat(e.target.value)
        onChange(isNaN(num) ? null : num)
      }}
      onBlur={onBlur}
      disabled={disabled}
      step={step}
      className="property-editor property-editor-number"
    />
  )
}

/**
 * Format number for display
 */
function formatNumber(value: number | null | undefined, config?: Record<string, unknown>): string {
  if (value === null || value === undefined) return ''

  const format = (config?.format as string) ?? 'number'
  const precision = (config?.precision as number) ?? 0

  switch (format) {
    case 'percent':
      return `${(value * 100).toFixed(precision)}%`
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: (config?.currency as string) ?? 'USD'
      }).format(value)
    default:
      return precision > 0 ? value.toFixed(precision) : value.toLocaleString()
  }
}

/**
 * Number property handler
 */
export const numberHandler: PropertyHandler<number> = {
  type: 'number',

  render(value, config) {
    if (value === null || value === undefined) {
      return <span className="property-empty">Empty</span>
    }
    return <span className="property-number">{formatNumber(value, config)}</span>
  },

  compare(a, b) {
    const aNum = a ?? 0
    const bNum = b ?? 0
    return aNum - bNum
  },

  filterOperators: [
    'equals',
    'notEquals',
    'greaterThan',
    'lessThan',
    'greaterOrEqual',
    'lessOrEqual',
    'isEmpty',
    'isNotEmpty'
  ],

  applyFilter(value, operator, filterValue) {
    const num = value ?? 0
    const filter = Number(filterValue) || 0

    switch (operator) {
      case 'equals':
        return num === filter
      case 'notEquals':
        return num !== filter
      case 'greaterThan':
        return num > filter
      case 'lessThan':
        return num < filter
      case 'greaterOrEqual':
        return num >= filter
      case 'lessOrEqual':
        return num <= filter
      case 'isEmpty':
        return value === null || value === undefined
      case 'isNotEmpty':
        return value !== null && value !== undefined
      default:
        return true
    }
  },

  Editor: NumberEditor
}
