/**
 * Page View - Rich text editor using @xnet/react hooks
 */

import React from 'react'
import { useNode, useIdentity } from '@xnet/react'
import { PageSchema } from '@xnet/data'
import { RichTextEditor } from '@xnet/editor/react'
import { DocumentHeader } from './DocumentHeader'
import { PresenceAvatars } from './PresenceAvatars'

interface PageViewProps {
  docId: string
}

export function PageView({ docId }: PageViewProps) {
  const { did } = useIdentity()

  const {
    data: page,
    doc,
    loading,
    update,
    remoteUsers,
    awareness
  } = useNode(PageSchema, docId, {
    createIfMissing: { title: 'Untitled Page' },
    did: did ?? undefined
  })

  if (loading || !doc) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading...</p>
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
      >
        <PresenceAvatars remoteUsers={remoteUsers} localDid={did} />
      </DocumentHeader>

      {/* Editor */}
      <div className="flex-1 px-6 py-4">
        <RichTextEditor
          ydoc={doc}
          field="content"
          placeholder="Start typing..."
          showToolbar={true}
          toolbarMode="desktop"
          awareness={awareness ?? undefined}
          did={did ?? undefined}
        />
      </div>
    </div>
  )
}
