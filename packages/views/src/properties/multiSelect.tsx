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
    <div className="property-editor property-editor-multiselect">
      <div
        className="multiselect-trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onBlur={() => {
          setIsOpen(false)
          onBlur?.()
        }}
        tabIndex={0}
      >
        {selected.length === 0 ? (
          <span className="property-empty">Select...</span>
        ) : (
          <div className="multiselect-tags">
            {selected.map((id) => {
              const opt = options.find((o) => o.id === id)
              if (!opt) return null
              return (
                <span
                  key={id}
                  className="property-select-tag"
                  style={{ backgroundColor: opt.color ?? '#e0e0e0' }}
                >
                  {opt.name}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {isOpen && (
        <div className="multiselect-dropdown">
          {options.map((opt) => (
            <label key={opt.id} className="multiselect-option">
              <input
                type="checkbox"
                checked={selected.includes(opt.id)}
                onChange={() => toggleOption(opt.id)}
                disabled={disabled}
              />
              <span
                className="property-select-tag"
                style={{ backgroundColor: opt.color ?? '#e0e0e0' }}
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
      return <span className="property-empty">Empty</span>
    }
    return (
      <div className="property-multiselect-tags">
        {options.map((opt) => (
          <span
            key={opt.id}
            className="property-select-tag"
            style={{ backgroundColor: opt.color ?? '#e0e0e0' }}
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
