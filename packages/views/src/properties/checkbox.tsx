/**
 * Checkbox property handler
 */

import React from 'react'
import type { PropertyHandler, PropertyEditorProps } from '../types'

/**
 * Checkbox editor component
 */
function CheckboxEditor({ value, onChange, disabled }: PropertyEditorProps<boolean>) {
  return (
    <input
      type="checkbox"
      checked={value ?? false}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:bg-gray-800 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-50 cursor-pointer"
    />
  )
}

/**
 * Checkbox property handler
 */
export const checkboxHandler: PropertyHandler<boolean> = {
  type: 'checkbox',

  render(value) {
    return (
      <span
        className={
          value
            ? 'text-green-600 dark:text-green-400 font-bold'
            : 'text-gray-300 dark:text-gray-600'
        }
      >
        {value ? '✓' : ''}
      </span>
    )
  },

  compare(a, b) {
    const aBool = a ?? false
    const bBool = b ?? false
    return aBool === bBool ? 0 : aBool ? 1 : -1
  },

  filterOperators: ['equals', 'notEquals'],

  applyFilter(value, operator, filterValue) {
    const bool = value ?? false
    const filter = Boolean(filterValue)

    switch (operator) {
      case 'equals':
        return bool === filter
      case 'notEquals':
        return bool !== filter
      default:
        return true
    }
  },

  Editor: CheckboxEditor
}
