/**
 * GridFieldMenu — the column header ⋯ menu: rename, change type (with
 * value conversion handled by the caller), type-specific config (slot),
 * hide, delete.
 *
 * Anchored popover; store-agnostic like the rest of the grid. Shells and
 * Storybook share it so the ⋯ button behaves the same everywhere.
 */

import type { GridField } from './model.js'
import type { FieldType } from '@xnetjs/data'
import { FIELD_TYPES } from '@xnetjs/data'
import { Trash2 } from 'lucide-react'
import React from 'react'

/** Types offered in the change-type select (computed/auto created elsewhere) */
export const CHANGEABLE_FIELD_TYPES: FieldType[] = FIELD_TYPES.filter(
  (t) => !['rollup', 'richText', 'updatedBy'].includes(t)
)

export interface GridFieldMenuProps {
  field: GridField
  anchor: HTMLElement
  onClose: () => void
  onRename?: (fieldId: string, name: string) => void
  /** Change the field type (caller converts existing cell values) */
  onChangeType?: (fieldId: string, type: FieldType) => void
  onHide?: (fieldId: string) => void
  onDelete?: (fieldId: string) => void
  /** Type-specific configuration UI (e.g. FieldConfigEditor) */
  children?: React.ReactNode
}

export function GridFieldMenu({
  field,
  anchor,
  onClose,
  onRename,
  onChangeType,
  onHide,
  onDelete,
  children
}: GridFieldMenuProps): React.JSX.Element {
  const rect = anchor.getBoundingClientRect()

  return (
    <div
      className="fixed inset-0 z-40"
      data-testid="grid-field-menu"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="menu"
        aria-label={`${field.name} field menu`}
        className="absolute z-50 w-64 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-2"
        style={{
          top: Math.min(rect.bottom + 4, window.innerHeight - 320),
          left: Math.min(rect.left, window.innerWidth - 280)
        }}
      >
        {onRename && (
          <input
            type="text"
            aria-label="Field name"
            defaultValue={field.name}
            autoFocus
            className="w-full mb-2 px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 bg-transparent outline-none focus:border-blue-400"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const name = (e.target as HTMLInputElement).value.trim()
                if (name && name !== field.name) onRename(field.id, name)
                onClose()
              }
              if (e.key === 'Escape') onClose()
              e.stopPropagation()
            }}
            onBlur={(e) => {
              const name = e.target.value.trim()
              if (name && name !== field.name) onRename(field.id, name)
            }}
          />
        )}

        {onChangeType && (
          <select
            aria-label="Field type"
            value={field.type}
            className="w-full mb-2 px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 bg-transparent"
            onChange={(e) => onChangeType(field.id, e.target.value as FieldType)}
          >
            {CHANGEABLE_FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}

        {children}

        {onHide && (
          <button
            type="button"
            role="menuitem"
            className="w-full px-2 py-1 text-left text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800"
            onClick={() => {
              onHide(field.id)
              onClose()
            }}
          >
            Hide in view
          </button>
        )}

        {onDelete && (
          <button
            type="button"
            role="menuitem"
            className="w-full px-2 py-1 flex items-center gap-1 text-left text-sm rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={() => {
              onDelete(field.id)
              onClose()
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete field
          </button>
        )}
      </div>
    </div>
  )
}
