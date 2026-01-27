/**
 * DocumentHeader - Shared header for Page, Database, Canvas views
 *
 * Contains the title input and share button.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ShareButton } from './ShareButton'

interface DocumentHeaderProps {
  docId: string
  docType: 'page' | 'database' | 'canvas'
  title: string
  onTitleChange: (title: string) => void
  placeholder?: string
  children?: React.ReactNode
}

export function DocumentHeader({
  docId,
  docType,
  title,
  onTitleChange,
  placeholder = 'Untitled',
  children
}: DocumentHeaderProps) {
  // Local state for the input to prevent cursor jumping
  const [localTitle, setLocalTitle] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)
  const isEditingRef = useRef(false)

  // Update local state when prop changes, but only if not currently editing
  useEffect(() => {
    if (!isEditingRef.current) {
      setLocalTitle(title)
    }
  }, [title])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value
      setLocalTitle(newTitle)
      onTitleChange(newTitle)
    },
    [onTitleChange]
  )

  const handleFocus = useCallback(() => {
    isEditingRef.current = true
  }, [])

  const handleBlur = useCallback(() => {
    isEditingRef.current = false
    // Sync with prop value in case it changed while we were editing
    setLocalTitle(title)
  }, [title])

  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-6">
      <input
        ref={inputRef}
        type="text"
        className="flex-1 text-3xl font-semibold border-none bg-transparent text-foreground w-full outline-none placeholder:text-muted-foreground"
        value={localTitle}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
      />
      <div className="flex items-center gap-3">
        {children}
        <ShareButton docId={docId} docType={docType} />
      </div>
    </div>
  )
}
