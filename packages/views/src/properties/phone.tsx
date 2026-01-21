/**
 * Phone property handler
 */

import React, { useEffect, useRef } from 'react'
import type { PropertyHandler, PropertyEditorProps } from '../types'

/**
 * Phone editor component
 */
function PhoneEditor({
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
      type="tel"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      onBlur={onBlur}
      disabled={disabled}
      placeholder="+1 (555) 123-4567"
      className="property-editor property-editor-phone"
    />
  )
}

/**
 * Phone property handler
 */
export const phoneHandler: PropertyHandler<string> = {
  type: 'phone',

  render(value) {
    if (!value) {
      return <span className="property-empty">Empty</span>
    }
    return (
      <a href={`tel:${value}`} className="property-phone" onClick={(e) => e.stopPropagation()}>
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
    const phone = value ?? ''
    const filter = String(filterValue ?? '').toLowerCase()

    switch (operator) {
      case 'equals':
        return phone.toLowerCase() === filter
      case 'contains':
        return phone.toLowerCase().includes(filter)
      case 'isEmpty':
        return phone === ''
      case 'isNotEmpty':
        return phone !== ''
      default:
        return true
    }
  },

  Editor: PhoneEditor
}
