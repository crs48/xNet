/**
 * Page View - Rich text editor using @xnet/react hooks
 */

import React from 'react'
import type { SyncStatus } from '@xnet/react'
import { useNode, useIdentity } from '@xnet/react'
import { PageSchema } from '@xnet/data'
import { RichTextEditor, useImageUpload, useFileUpload, useFileDownload } from '@xnet/editor/react'
import { DocumentHeader } from './DocumentHeader'
import { PresenceAvatars } from './PresenceAvatars'

interface PageViewProps {
  docId: string
}

export function PageView({ docId }: PageViewProps) {
  const { did } = useIdentity()
  const onImageUpload = useImageUpload()
  const onFileUpload = useFileUpload()
  const onFileDownload = useFileDownload()

  const {
    data: page,
    doc,
    loading,
    update,
    syncStatus,
    peerCount,
    remoteUsers,
    awareness
  } = useNode(PageSchema, docId, {
    createIfMissing: { title: 'Untitled Page' },
    disableSync: true,
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
        <SyncIndicator status={syncStatus} peerCount={peerCount} />
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
          onImageUpload={onImageUpload ?? undefined}
          onFileUpload={onFileUpload ?? undefined}
          onFileDownload={onFileDownload ?? undefined}
        />
      </div>
    </div>
  )
}

function SyncIndicator({ status, peerCount }: { status: SyncStatus; peerCount: number }) {
  const colors: Record<SyncStatus, string> = {
    offline: 'bg-zinc-500',
    connecting: 'bg-amber-400 animate-pulse',
    connected: 'bg-emerald-400'
  }

  const labels: Record<SyncStatus, string> = {
    offline: 'Offline',
    connecting: 'Connecting...',
    connected: peerCount > 0 ? `${peerCount} peer${peerCount !== 1 ? 's' : ''}` : 'Connected'
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={labels[status]}>
      <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span>{labels[status]}</span>
    </div>
  )
}
