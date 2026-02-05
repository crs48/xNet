/**
 * File property handler
 */

import type { PropertyHandler, PropertyEditorProps } from '../types'
import React from 'react'

/** File value type */
export interface FileValue {
  cid: string
  name: string
  size: number
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * File editor component (read-only display for now)
 */
function FileEditor({ value, onBlur, disabled }: PropertyEditorProps<FileValue>) {
  const displayValue = value ? `${value.name} (${formatFileSize(value.size)})` : ''

  return (
    <input
      type="text"
      value={displayValue}
      onChange={() => {
        /* Read-only for now - file upload TBD */
      }}
      onBlur={onBlur}
      disabled={disabled}
      readOnly
      placeholder="No file"
      className="w-full h-full px-1 py-0.5 text-sm bg-transparent text-gray-900 dark:text-gray-100 border-none outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:opacity-50"
    />
  )
}

/**
 * File property handler
 */
export const fileHandler: PropertyHandler<FileValue> = {
  type: 'file',

  render(value) {
    if (!value) {
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }
    return (
      <span className="text-gray-900 dark:text-gray-100 flex items-center gap-1">
        <span className="text-gray-500">📎</span>
        <span className="truncate">{value.name}</span>
        <span className="text-gray-400 text-xs">({formatFileSize(value.size)})</span>
      </span>
    )
  },

  compare(a, b) {
    const aName = a?.name ?? ''
    const bName = b?.name ?? ''
    return aName.localeCompare(bName)
  },

  filterOperators: ['isEmpty', 'isNotEmpty'],

  applyFilter(value, operator) {
    const isEmpty = !value || !value.cid

    switch (operator) {
      case 'isEmpty':
        return isEmpty
      case 'isNotEmpty':
        return !isEmpty
      default:
        return true
    }
  },

  Editor: FileEditor
}
