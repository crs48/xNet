/**
 * Select property handler
 */

import React from 'react'
import type { PropertyHandler, PropertyEditorProps } from '../types'
import type { SelectOption } from '@xnet/data'

interface SelectConfig {
  options?: SelectOption[]
}

/**
 * Select editor component
 */
function SelectEditor({
  value,
  onChange,
  onBlur,
  autoFocus,
  disabled,
  config
}: PropertyEditorProps<string>) {
  const options = (config as SelectConfig)?.options ?? []

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      onBlur={onBlur}
      autoFocus={autoFocus}
      disabled={disabled}
      className="property-editor property-editor-select"
    >
      <option value="">Select...</option>
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.name}
        </option>
      ))}
    </select>
  )
}

/**
 * Get option by ID
 */
function getOption(
  value: string | null | undefined,
  config?: Record<string, unknown>
): SelectOption | undefined {
  if (!value) return undefined
  const options = (config as SelectConfig)?.options ?? []
  return options.find((o) => o.id === value)
}

/**
 * Select property handler
 */
export const selectHandler: PropertyHandler<string> = {
  type: 'select',

  render(value, config) {
    const option = getOption(value, config)
    if (!option) {
      return <span className="property-empty">Empty</span>
    }
    return (
      <span className="property-select-tag" style={{ backgroundColor: option.color ?? '#e0e0e0' }}>
        {option.name}
      </span>
    )
  },

  compare(a, b, config) {
    const optA = getOption(a, config)
    const optB = getOption(b, config)
    const nameA = optA?.name ?? ''
    const nameB = optB?.name ?? ''
    return nameA.localeCompare(nameB)
  },

  filterOperators: ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'],

  applyFilter(value, operator, filterValue) {
    switch (operator) {
      case 'equals':
        return value === filterValue
      case 'notEquals':
        return value !== filterValue
      case 'isEmpty':
        return value === null || value === undefined
      case 'isNotEmpty':
        return value !== null && value !== undefined
      default:
        return true
    }
  },

  Editor: SelectEditor
}
