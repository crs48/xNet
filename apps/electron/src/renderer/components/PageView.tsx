/**
 * Page View - Rich text editor using @xnet/react hooks
 */

import React from 'react'
import { useDocument } from '@xnet/react'
import { PageSchema } from '@xnet/data'
import { RichTextEditor } from '@xnet/editor/react'
import { DocumentHeader } from './DocumentHeader'

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
    // Sync enabled - signaling server runs via `pnpm dev`
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
      <DocumentHeader
        docId={docId}
        docType="page"
        title={page?.title || ''}
        onTitleChange={(title) => update({ title })}
        placeholder="Untitled Page"
      />

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
