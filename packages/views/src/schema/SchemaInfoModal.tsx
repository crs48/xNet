/**
 * SchemaInfoModal - Modal for viewing and editing database schema metadata
 *
 * Displays:
 * - Schema name (editable)
 * - Description (editable)
 * - Version (read-only)
 * - Schema IRI (read-only)
 * - Created/Updated timestamps (read-only)
 */

import type { DatabaseSchemaMetadata } from '@xnet/data'
import React, { useState, useCallback, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchemaInfoModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Callback when modal should close */
  onClose: () => void
  /** Current schema metadata */
  metadata: DatabaseSchemaMetadata | null
  /** Schema IRI for display */
  schemaIRI: string
  /** Callback when metadata is updated */
  onUpdate: (updates: Partial<Pick<DatabaseSchemaMetadata, 'name' | 'description'>>) => void
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * SchemaInfoModal component for viewing and editing schema metadata
 */
export function SchemaInfoModal({
  isOpen,
  onClose,
  metadata,
  schemaIRI,
  onUpdate
}: SchemaInfoModalProps): React.JSX.Element | null {
  const [name, setName] = useState(metadata?.name ?? '')
  const [description, setDescription] = useState(metadata?.description ?? '')
  const [hasChanges, setHasChanges] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Sync state when metadata changes
  useEffect(() => {
    if (metadata) {
      setName(metadata.name)
      setDescription(metadata.description ?? '')
      setHasChanges(false)
    }
  }, [metadata])

  // Focus name input when modal opens
  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      nameInputRef.current.focus()
    }
  }, [isOpen])

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose]
  )

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setName(e.target.value)
      setHasChanges(e.target.value !== metadata?.name)
    },
    [metadata?.name]
  )

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value)
    setHasChanges(true)
  }, [])

  const handleSave = useCallback(() => {
    if (!hasChanges) return

    const updates: Partial<Pick<DatabaseSchemaMetadata, 'name' | 'description'>> = {}
    if (name !== metadata?.name) {
      updates.name = name.trim() || 'Untitled Schema'
    }
    if (description !== (metadata?.description ?? '')) {
      updates.description = description.trim() || undefined
    }

    if (Object.keys(updates).length > 0) {
      onUpdate(updates)
    }
    setHasChanges(false)
  }, [hasChanges, name, description, metadata, onUpdate])

  const handleClose = useCallback(() => {
    // Save any pending changes before closing
    if (hasChanges) {
      handleSave()
    }
    onClose()
  }, [hasChanges, handleSave, onClose])

  if (!isOpen || !metadata) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Schema Info</h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Schema Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Schema Name
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={handleNameChange}
              onBlur={handleSave}
              placeholder="Enter schema name..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={handleDescriptionChange}
              onBlur={handleSave}
              placeholder="Optional description..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Read-only info */}
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-3">
            {/* Version */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Version</span>
              <span className="text-sm font-mono text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                {metadata.version}
              </span>
            </div>

            {/* Schema IRI */}
            <div>
              <span className="text-sm text-gray-500 dark:text-gray-400 block mb-1">
                Schema IRI
              </span>
              <code className="text-xs font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded block overflow-x-auto">
                {schemaIRI}
              </code>
            </div>

            {/* Timestamps */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Created</span>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {formatDate(metadata.createdAt)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Last Modified</span>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {formatDate(metadata.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default SchemaInfoModal
