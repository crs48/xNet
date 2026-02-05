/**
 * Email property handler
 */

import type { PropertyHandler, PropertyEditorProps } from '../types'
import React, { useEffect, useRef } from 'react'

/**
 * Email editor component
 */
function EmailEditor({
  value,
  onChange,
  onBlur,
  autoFocus,
  disabled
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
      type="email"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      onBlur={onBlur}
      disabled={disabled}
      placeholder="email@example.com"
      className="w-full h-full px-1 py-0.5 text-sm bg-transparent text-gray-900 dark:text-gray-100 border-none outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:opacity-50"
    />
  )
}

/**
 * Email property handler
 */
export const emailHandler: PropertyHandler<string> = {
  type: 'email',

  render(value) {
    if (!value) {
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }
    return (
      <a
        href={`mailto:${value}`}
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
    const email = value ?? ''
    const filter = String(filterValue ?? '').toLowerCase()

    switch (operator) {
      case 'equals':
        return email.toLowerCase() === filter
      case 'contains':
        return email.toLowerCase().includes(filter)
      case 'isEmpty':
        return email === ''
      case 'isNotEmpty':
        return email !== ''
      default:
        return true
    }
  },

  Editor: EmailEditor
}
