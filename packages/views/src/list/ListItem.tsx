/**
 * ListItem - Individual item in a ListView
 */

import type { PropertyDefinition } from '@xnet/data'
import { cn } from '@xnet/ui'
import React from 'react'
import { getPropertyHandler } from '../properties/index.js'

export interface ListItemProps {
  /** Item ID */
  id: string
  /** Item title */
  title: string
  /** Whether the item is checked (for checkbox lists) */
  checked: boolean
  /** Whether to show a checkbox */
  hasCheckbox: boolean
  /** Properties to display */
  displayProperties: PropertyDefinition[]
  /** The full item data */
  item: Record<string, unknown>
  /** Callback when checkbox is toggled */
  onCheck?: (checked: boolean) => void
  /** Callback when item is clicked */
  onClick?: () => void
  /** Callback when delete is clicked */
  onDelete?: () => void
}

/**
 * Get property key from definition
 */
function getPropertyKey(prop: PropertyDefinition): string {
  return prop['@id'].split('#').pop() || prop.name
}

/**
 * ListItem component
 */
export function ListItem({
  title,
  checked,
  hasCheckbox,
  displayProperties,
  item,
  onCheck,
  onClick,
  onDelete
}: ListItemProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 p-2 rounded',
        'hover:bg-gray-50 dark:hover:bg-gray-800/50',
        'transition-colors'
      )}
    >
      {/* Checkbox */}
      {hasCheckbox && (
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            e.stopPropagation()
            onCheck?.(e.target.checked)
          }}
          className={cn(
            'w-4 h-4 rounded border-gray-300 dark:border-gray-600',
            'text-blue-600 focus:ring-blue-500',
            'cursor-pointer'
          )}
        />
      )}

      {/* Title */}
      <span
        className={cn(
          'flex-1 cursor-pointer truncate',
          'text-gray-900 dark:text-gray-100',
          checked && 'line-through opacity-50'
        )}
        onClick={onClick}
      >
        {title}
      </span>

      {/* Display properties (compact) */}
      {displayProperties.length > 0 && (
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          {displayProperties.map((prop) => {
            const key = getPropertyKey(prop)
            const value = item[key]
            const handler = getPropertyHandler(prop.type)

            if (value === null || value === undefined) return null

            return (
              <span key={key} className="truncate max-w-24">
                {handler?.render(value, prop.config) ?? String(value)}
              </span>
            )
          })}
        </div>
      )}

      {/* Delete button */}
      {onDelete && (
        <button
          className={cn(
            'opacity-0 group-hover:opacity-100',
            'p-1 rounded',
            'text-gray-400 hover:text-red-500',
            'hover:bg-red-50 dark:hover:bg-red-900/20',
            'transition-all'
          )}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title="Delete item"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
    </div>
  )
}
