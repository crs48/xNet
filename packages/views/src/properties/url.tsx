/**
 * URL property handler
 */

import type { PropertyHandler, PropertyEditorProps } from '../types'
import React, { useEffect, useRef } from 'react'

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
      className="w-full h-full px-1 py-0.5 text-sm bg-transparent text-gray-900 dark:text-gray-100 border-none outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:opacity-50"
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
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:underline truncate"
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
