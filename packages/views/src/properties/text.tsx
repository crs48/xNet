/**
 * Text property handler
 */

import type { PropertyHandler, PropertyEditorProps } from '../types'
import { LinkifiedText } from '@xnetjs/ui'
import React, { useEffect, useRef } from 'react'

/**
 * Text editor component
 */
function TextEditor({
  value,
  onChange,
  onBlur,
  autoFocus,
  autoSelect = true,
  disabled,
  config
}: PropertyEditorProps<string>) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
      if (autoSelect) {
        inputRef.current.select()
      } else {
        const end = inputRef.current.value.length
        inputRef.current.setSelectionRange(end, end)
      }
    }
  }, [autoFocus, autoSelect])

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
      className="w-full h-full px-1 py-0.5 text-sm bg-transparent text-gray-900 dark:text-gray-100 border-none outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:opacity-50"
    />
  )
}

/**
 * Coerce a cell value to text. The text handler is also the fallback for
 * unknown property types (e.g. formula/rollup results), so despite the
 * `PropertyHandler<string>` signature it can receive numbers or objects.
 */
function toText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : String(value)
}

/**
 * Text property handler
 */
export const textHandler: PropertyHandler<string> = {
  type: 'text',

  render(value) {
    const str = toText(value)
    if (str === '') {
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }
    // Read mode only — while editing, TextEditor shows the raw text (0171)
    return <LinkifiedText value={str} className="text-gray-900 dark:text-gray-100" detectPhones />
  },

  compare(a, b) {
    return toText(a).localeCompare(toText(b))
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
    const str = toText(value)
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
