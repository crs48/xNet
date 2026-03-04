/**
 * ListView - Simple list view with checkbox support
 *
 * A compact list view ideal for todo lists and simple data.
 * Supports checkbox toggling for task completion.
 */

import type { ViewConfig } from '../types.js'
import type { Schema, PropertyDefinition } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import React from 'react'
import { ListItem } from './ListItem.js'
import { useListState, type ListRow } from './useListState.js'

export interface ListViewProps {
  /** Schema defining the list structure */
  schema: Schema
  /** View configuration */
  view: ViewConfig
  /** Data rows */
  data: ListRow[]
  /** Callback when a row is updated */
  onUpdateRow?: (rowId: string, propertyId: string, value: unknown) => void
  /** Callback when view config changes */
  onUpdateView?: (changes: Partial<ViewConfig>) => void
  /** Callback when add item is clicked */
  onAddItem?: () => void
  /** Callback when an item is clicked */
  onItemClick?: (itemId: string) => void
  /** Callback when an item is deleted */
  onDeleteItem?: (itemId: string) => void
  /** Additional CSS class */
  className?: string
}

/**
 * Get property key from definition
 */
function getPropertyKey(prop: PropertyDefinition): string {
  return prop['@id'].split('#').pop() || prop.name
}

/**
 * ListView component - compact list with checkbox support
 */
export function ListView({
  schema,
  view,
  data,
  onUpdateRow,
  onAddItem,
  onItemClick,
  onDeleteItem,
  className
}: ListViewProps): React.JSX.Element {
  const { items, titleProperty, checkboxProperty, displayProperties } = useListState({
    schema,
    view,
    data
  })

  const titleKey = titleProperty ? getPropertyKey(titleProperty) : null
  const checkboxKey = checkboxProperty ? getPropertyKey(checkboxProperty) : null

  return (
    <div className={cn('h-full overflow-y-auto bg-white dark:bg-gray-900', className)}>
      <div className="p-4 space-y-1">
        {items.map((item) => {
          const title = titleKey ? (item[titleKey] as string) : item.id
          const checked = checkboxKey ? (item[checkboxKey] as boolean) : false

          return (
            <ListItem
              key={item.id}
              id={item.id}
              title={title || 'Untitled'}
              checked={checked}
              hasCheckbox={!!checkboxProperty}
              displayProperties={displayProperties}
              item={item}
              onCheck={
                checkboxKey && onUpdateRow
                  ? (value) => onUpdateRow(item.id, checkboxKey, value)
                  : undefined
              }
              onClick={onItemClick ? () => onItemClick(item.id) : undefined}
              onDelete={onDeleteItem ? () => onDeleteItem(item.id) : undefined}
            />
          )
        })}

        {/* Add item button */}
        {onAddItem && (
          <button
            className={cn(
              'w-full p-2 text-left',
              'text-gray-500 dark:text-gray-400',
              'hover:text-gray-700 dark:hover:text-gray-200',
              'hover:bg-gray-50 dark:hover:bg-gray-800/50',
              'rounded transition-colors'
            )}
            onClick={onAddItem}
          >
            + New item
          </button>
        )}

        {/* Empty state */}
        {items.length === 0 && !onAddItem && (
          <div className="flex items-center justify-center h-32 text-gray-500 dark:text-gray-400">
            No items to display
          </div>
        )}
      </div>
    </div>
  )
}
