/**
 * AddSharedDialog - Add a shared document to your local database
 *
 * User pastes a document ID and it gets added to their local store.
 * The document then syncs via P2P and appears in their sidebar permanently.
 */

import { Link, X } from 'lucide-react'
import React, { useState } from 'react'

interface AddSharedDialogProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (docId: string) => void
}

export function AddSharedDialog({ isOpen, onClose, onAdd }: AddSharedDialogProps) {
  const [docId, setDocId] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedId = docId.trim()
    if (!trimmedId) {
      setError('Please enter a document ID')
      return
    }

    // Basic validation - IDs are typically UUIDs or similar
    if (trimmedId.length < 8) {
      setError('Invalid document ID')
      return
    }

    onAdd(trimmedId)
    setDocId('')
    setError(null)
    onClose()
  }

  const handleClose = () => {
    setDocId('')
    setError(null)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={handleClose} />

      {/* Dialog */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] bg-background border border-border rounded-lg shadow-xl z-50">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Link size={16} className="text-primary" />
            <h2 className="text-sm font-medium">Add Shared Document</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4">
          <p className="text-sm text-muted-foreground mb-4">
            Paste a document ID that was shared with you. The document will be added to your library
            and sync automatically.
          </p>

          <div className="mb-4">
            <label className="block text-xs text-muted-foreground mb-1.5">Document ID</label>
            <input
              type="text"
              value={docId}
              onChange={(e) => {
                setDocId(e.target.value)
                setError(null)
              }}
              placeholder="e.g., database:abc123-def456-..."
              className="w-full px-3 py-2 text-sm font-mono bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
              autoFocus
            />
            {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary-hover transition-colors"
            >
              Add to Library
            </button>
          </div>
        </form>

        {/* Footer note */}
        <div className="px-4 py-3 bg-secondary/50 border-t border-border rounded-b-lg">
          <p className="text-xs text-muted-foreground">
            <strong>Tip:</strong> Both you and the document owner need to be online for the initial
            sync. After that, changes sync whenever you're both online.
          </p>
        </div>
      </div>
    </>
  )
}
