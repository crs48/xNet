/**
 * CardDetailModal - Modal for viewing and editing a card/row's properties
 */

import type { TableRow } from '../table/useTableState.js'
import type { Schema, PropertyDefinition } from '@xnet/data'
import React, { useCallback } from 'react'
import { getPropertyHandler } from '../properties/index.js'

export interface CardDetailModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Close the modal */
  onClose: () => void
  /** The row data to display */
  row: TableRow | null
  /** Schema defining the properties */
  schema: Schema
  /** Callback when a property value is updated */
  onUpdateRow?: (rowId: string, propertyId: string, value: unknown) => void
  /** Callback when delete is clicked */
  onDeleteRow?: (rowId: string) => void
}

/**
 * Get the property key from a property definition
 */
function getPropertyKey(prop: PropertyDefinition): string {
  return prop['@id'].split('#').pop() || prop.name
}

/**
 * CardDetailModal component
 */
export function CardDetailModal({
  isOpen,
  onClose,
  row,
  schema,
  onUpdateRow,
  onDeleteRow
}: CardDetailModalProps): React.JSX.Element | null {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  if (!isOpen || !row) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleDelete = () => {
    if (onDeleteRow && row) {
      onDeleteRow(row.id)
      onClose()
    }
  }

  // Get title property (first text property)
  const titleProp = schema.properties.find((p) => p.type === 'text')
  const titleKey = titleProp ? getPropertyKey(titleProp) : null
  const title = titleKey ? (row[titleKey] as string) || 'Untitled' : 'Untitled'

  // Other properties (excluding title)
  const otherProps = schema.properties.filter((p) => {
    const key = getPropertyKey(p)
    return key !== titleKey
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            {onDeleteRow && (
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              >
                Delete
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Title field */}
          {titleProp && titleKey && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                {titleProp.name}
              </label>
              <PropertyEditor
                property={titleProp}
                value={row[titleKey]}
                onChange={(value) => onUpdateRow?.(row.id, titleKey, value)}
              />
            </div>
          )}

          {/* Other properties */}
          <div className="space-y-4">
            {otherProps.map((prop) => {
              const key = getPropertyKey(prop)
              const value = row[key]

              return (
                <div key={prop['@id']} className="flex items-start gap-4">
                  <div className="w-32 flex-shrink-0 pt-2">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {prop.name}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <PropertyEditor
                      property={prop}
                      value={value}
                      onChange={(newValue) => onUpdateRow?.(row.id, key, newValue)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Property editor wrapper that uses the appropriate handler's Editor component
 */
interface PropertyEditorProps {
  property: PropertyDefinition
  value: unknown
  onChange: (value: unknown) => void
}

function PropertyEditor({ property, value, onChange }: PropertyEditorProps): React.JSX.Element {
  const handler = getPropertyHandler(property.type)
  const Editor = handler.Editor

  // Read-only properties
  const isReadOnly =
    property.type === 'created' || property.type === 'updated' || property.type === 'createdBy'

  if (isReadOnly) {
    return (
      <div className="py-2 px-3 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded">
        {handler.render(value, property.config)}
      </div>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
      <Editor
        value={value as never}
        onChange={onChange as never}
        config={property.config}
        autoFocus={false}
        disabled={false}
      />
    </div>
  )
}
