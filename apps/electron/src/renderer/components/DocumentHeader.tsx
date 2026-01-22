/**
 * DocumentHeader - Shared header for Page, Database, Canvas views
 *
 * Contains the title input and share button.
 */

import React from 'react'
import { ShareButton } from './ShareButton'

interface DocumentHeaderProps {
  docId: string
  docType: 'page' | 'database' | 'canvas'
  title: string
  onTitleChange: (title: string) => void
  placeholder?: string
}

export function DocumentHeader({
  docId,
  docType,
  title,
  onTitleChange,
  placeholder = 'Untitled'
}: DocumentHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-6">
      <input
        type="text"
        className="flex-1 text-3xl font-semibold border-none bg-transparent text-text w-full outline-none placeholder:text-text-secondary"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder={placeholder}
      />
      <ShareButton docId={docId} docType={docType} />
    </div>
  )
}
