/**
 * Page View - Rich text editor
 */

import React from 'react'
import { RichTextEditor } from '@xnet/editor/react'
import type * as Y from 'yjs'

interface PageViewProps {
  ydoc: Y.Doc
  isLoading?: boolean
}

export function PageView({ ydoc, isLoading }: PageViewProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-secondary">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-6 overflow-auto">
      <RichTextEditor
        ydoc={ydoc}
        field="content"
        placeholder="Start typing..."
        showToolbar={true}
      />
    </div>
  )
}
