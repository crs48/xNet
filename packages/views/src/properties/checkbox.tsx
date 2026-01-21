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
      className="property-editor property-editor-checkbox"
    />
  )
}

/**
 * Checkbox property handler
 */
export const checkboxHandler: PropertyHandler<boolean> = {
  type: 'checkbox',

  render(value) {
    return <span className={`property-checkbox ${value ? 'checked' : ''}`}>{value ? '✓' : ''}</span>
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
