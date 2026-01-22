/**
 * Page View - Rich text editor using @xnet/react hooks
 */

import React from 'react'
import { useDocument } from '@xnet/react'
import { PageSchema } from '@xnet/data'
import { RichTextEditor } from '@xnet/editor/react'

interface PageViewProps {
  docId: string
}

export function PageView({ docId }: PageViewProps) {
  const {
    data: page,
    doc,
    loading,
    update
  } = useDocument(PageSchema, docId, {
    createIfMissing: { title: 'Untitled Page' }
  })

  if (loading || !doc) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-secondary">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      {/* Title */}
      <div className="px-6 pt-6">
        <input
          type="text"
          className="text-3xl font-semibold border-none bg-transparent text-text w-full outline-none placeholder:text-text-secondary"
          value={page?.title || ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Untitled"
        />
      </div>

      {/* Editor */}
      <div className="flex-1 px-6 py-4">
        <RichTextEditor
          ydoc={doc}
          field="content"
          placeholder="Start typing..."
          showToolbar={true}
          toolbarMode="desktop"
        />
      </div>
    </div>
  )
}
