/**
 * Select property handler
 */

import type { PropertyHandler, PropertyEditorProps } from '../types'
import type { SelectOption } from '@xnet/data'
import React from 'react'

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
      className="w-full h-full px-1 py-0.5 text-sm bg-transparent text-gray-900 dark:text-gray-100 border-none outline-none disabled:opacity-50 cursor-pointer"
    >
      <option value="" className="bg-white dark:bg-gray-800">
        Select...
      </option>
      {options.map((opt) => (
        <option key={opt.id} value={opt.id} className="bg-white dark:bg-gray-800">
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
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-white"
        style={{ backgroundColor: option.color ?? '#6b7280' }}
      >
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
