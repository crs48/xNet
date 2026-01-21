/**
 * Text property handler
 */

import React, { useEffect, useRef } from 'react'
import type { PropertyHandler, PropertyEditorProps, FilterOperator } from '../types'

/**
 * Text editor component
 */
function TextEditor({
  value,
  onChange,
  onBlur,
  autoFocus,
  disabled,
  config
}: PropertyEditorProps<string>) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [autoFocus])

  return (
    <input
      ref={inputRef}
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      onBlur={onBlur}
      disabled={disabled}
      placeholder={config?.placeholder as string}
      maxLength={config?.maxLength as number}
      className="property-editor property-editor-text"
    />
  )
}

/**
 * Text property handler
 */
export const textHandler: PropertyHandler<string> = {
  type: 'text',

  render(value) {
    if (value === null || value === undefined || value === '') {
      return <span className="property-empty">Empty</span>
    }
    return <span className="property-text">{value}</span>
  },

  compare(a, b) {
    const aStr = a ?? ''
    const bStr = b ?? ''
    return aStr.localeCompare(bStr)
  },

  filterOperators: [
    'equals',
    'notEquals',
    'contains',
    'notContains',
    'startsWith',
    'endsWith',
    'isEmpty',
    'isNotEmpty'
  ],

  applyFilter(value, operator, filterValue) {
    const str = value ?? ''
    const filter = String(filterValue ?? '').toLowerCase()
    const strLower = str.toLowerCase()

    switch (operator) {
      case 'equals':
        return strLower === filter
      case 'notEquals':
        return strLower !== filter
      case 'contains':
        return strLower.includes(filter)
      case 'notContains':
        return !strLower.includes(filter)
      case 'startsWith':
        return strLower.startsWith(filter)
      case 'endsWith':
        return strLower.endsWith(filter)
      case 'isEmpty':
        return str === ''
      case 'isNotEmpty':
        return str !== ''
      default:
        return true
    }
  },

  Editor: TextEditor
}
