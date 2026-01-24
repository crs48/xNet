/**
 * Multi-select property handler
 */

import React, { useState } from 'react'
import type { PropertyHandler, PropertyEditorProps } from '../types'
import type { SelectOption } from '@xnet/data'

interface MultiSelectConfig {
  options?: SelectOption[]
}

/**
 * Multi-select editor component
 */
function MultiSelectEditor({
  value,
  onChange,
  onBlur,
  disabled,
  config
}: PropertyEditorProps<string[]>) {
  const [isOpen, setIsOpen] = useState(false)
  const options = (config as MultiSelectConfig)?.options ?? []
  const selected = value ?? []

  const toggleOption = (optionId: string) => {
    if (selected.includes(optionId)) {
      onChange(selected.filter((id) => id !== optionId))
    } else {
      onChange([...selected, optionId])
    }
  }

  return (
    <div className="relative w-full h-full">
      <div
        className="w-full h-full flex items-center gap-1 px-1 cursor-pointer"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onBlur={() => {
          setIsOpen(false)
          onBlur?.()
        }}
        tabIndex={0}
      >
        {selected.length === 0 ? (
          <span className="text-sm text-gray-400 dark:text-gray-500">Select...</span>
        ) : (
          <div className="flex flex-wrap gap-0.5">
            {selected.map((id) => {
              const opt = options.find((o) => o.id === id)
              if (!opt) return null
              return (
                <span
                  key={id}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-white"
                  style={{ backgroundColor: opt.color ?? '#6b7280' }}
                >
                  {opt.name}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[160px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 z-30">
          {options.map((opt) => (
            <label
              key={opt.id}
              className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.id)}
                onChange={() => toggleOption(opt.id)}
                disabled={disabled}
                className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800"
              />
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-white"
                style={{ backgroundColor: opt.color ?? '#6b7280' }}
              >
                {opt.name}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Get options by IDs
 */
function getOptions(
  value: string[] | null | undefined,
  config?: Record<string, unknown>
): SelectOption[] {
  if (!value || value.length === 0) return []
  const options = (config as MultiSelectConfig)?.options ?? []
  return value.map((id) => options.find((o) => o.id === id)).filter(Boolean) as SelectOption[]
}

/**
 * Multi-select property handler
 */
export const multiSelectHandler: PropertyHandler<string[]> = {
  type: 'multiSelect',

  render(value, config) {
    const options = getOptions(value, config)
    if (options.length === 0) {
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }
    return (
      <div className="flex flex-wrap gap-0.5">
        {options.map((opt) => (
          <span
            key={opt.id}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-white"
            style={{ backgroundColor: opt.color ?? '#6b7280' }}
          >
            {opt.name}
          </span>
        ))}
      </div>
    )
  },

  compare(a, b) {
    const aLen = a?.length ?? 0
    const bLen = b?.length ?? 0
    return aLen - bLen
  },

  filterOperators: ['contains', 'notContains', 'isEmpty', 'isNotEmpty'],

  applyFilter(value, operator, filterValue) {
    const selected = value ?? []

    switch (operator) {
      case 'contains':
        return selected.includes(filterValue as string)
      case 'notContains':
        return !selected.includes(filterValue as string)
      case 'isEmpty':
        return selected.length === 0
      case 'isNotEmpty':
        return selected.length > 0
      default:
        return true
    }
  },

  Editor: MultiSelectEditor
}
