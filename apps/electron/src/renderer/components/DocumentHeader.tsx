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
  compact?: boolean
  showShareButton?: boolean
}

export function DocumentHeader({
  docId,
  docType,
  title,
  onTitleChange,
  placeholder = 'Untitled',
  children,
  compact = false,
  showShareButton = true
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
    <div
      className={[
        'flex items-start justify-between gap-4',
        compact ? 'px-5 pt-4' : 'px-6 pt-6'
      ].join(' ')}
    >
      <input
        ref={inputRef}
        type="text"
        className={[
          'w-full flex-1 border-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground',
          compact ? 'text-2xl font-semibold' : 'text-3xl font-semibold'
        ].join(' ')}
        value={localTitle}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
      />
      <div className={compact ? 'flex items-center gap-2' : 'flex items-center gap-3'}>
        {children}
        {showShareButton ? <ShareButton docId={docId} docType={docType} /> : null}
      </div>
    </div>
  )
}
