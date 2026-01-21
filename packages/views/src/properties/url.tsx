/**
 * URL property handler
 */

import React, { useEffect, useRef } from 'react'
import type { PropertyHandler, PropertyEditorProps } from '../types'

/**
 * URL editor component
 */
function UrlEditor({ value, onChange, onBlur, autoFocus, disabled }: PropertyEditorProps<string>) {
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
      type="url"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      onBlur={onBlur}
      disabled={disabled}
      placeholder="https://..."
      className="property-editor property-editor-url"
    />
  )
}

/**
 * URL property handler
 */
export const urlHandler: PropertyHandler<string> = {
  type: 'url',

  render(value) {
    if (!value) {
      return <span className="property-empty">Empty</span>
    }
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="property-url"
        onClick={(e) => e.stopPropagation()}
      >
        {value}
      </a>
    )
  },

  compare(a, b) {
    const aStr = a ?? ''
    const bStr = b ?? ''
    return aStr.localeCompare(bStr)
  },

  filterOperators: ['equals', 'contains', 'isEmpty', 'isNotEmpty'],

  applyFilter(value, operator, filterValue) {
    const url = value ?? ''
    const filter = String(filterValue ?? '').toLowerCase()

    switch (operator) {
      case 'equals':
        return url.toLowerCase() === filter
      case 'contains':
        return url.toLowerCase().includes(filter)
      case 'isEmpty':
        return url === ''
      case 'isNotEmpty':
        return url !== ''
      default:
        return true
    }
  },

  Editor: UrlEditor
}
