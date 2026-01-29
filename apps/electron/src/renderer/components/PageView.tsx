/**
 * Page View - Rich text editor using @xnet/react hooks
 *
 * Features:
 * - Collaborative editing via Yjs
 * - Comment system with inline popover
 * - Real-time presence indicators
 */

import React, { useState, useCallback, useMemo, useRef } from 'react'
import type { SyncStatus } from '@xnet/react'
// Editor type - we use any since @tiptap/core isn't directly available
import { useNode, useIdentity, useEditorExtensionsSafe, useComments } from '@xnet/react'
import { PageSchema } from '@xnet/data'
import { RichTextEditor, useImageUpload, useFileUpload, useFileDownload } from '@xnet/editor/react'
import { CommentMark, CommentPlugin } from '@xnet/editor/extensions'
import { CommentPopover, type CommentThreadData } from '@xnet/ui'
import { DocumentHeader } from './DocumentHeader'
import { PresenceAvatars } from './PresenceAvatars'

interface PageViewProps {
  docId: string
}

// ─── Comment Popover State ──────────────────────────────────────────────────────

interface PopoverState {
  visible: boolean
  mode: 'preview' | 'full'
  threadId: string | null
  anchor: HTMLElement | null
}

const INITIAL_POPOVER_STATE: PopoverState = {
  visible: false,
  mode: 'preview',
  threadId: null,
  anchor: null
}

export function PageView({ docId }: PageViewProps) {
  const { did } = useIdentity()
  const onImageUpload = useImageUpload()
  const onFileUpload = useFileUpload()
  const onFileDownload = useFileDownload()

  // Get editor extensions from plugins (reactive - updates when plugins change)
  // Uses safe version that returns [] if plugin system isn't ready
  // Cast to any to avoid TipTap version conflicts between packages
  const editorContributions = useEditorExtensionsSafe()
  const pluginExtensions = editorContributions.map((c) => c.extension) as any[]

  // Page data and Y.Doc
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
    did: did ?? undefined
  })

  // ─── Comments Integration ─────────────────────────────────────────────────────

  // Load comments for this page, filtered to text anchors only
  const {
    threads,
    // TODO: addComment will be used when we add a "Comment" toolbar button
    // that creates a new comment from the current text selection
    replyTo,
    resolveThread,
    reopenThread,
    deleteComment,
    editComment,
    unresolvedCount
  } = useComments({ nodeId: docId, anchorType: 'text' })

  // Popover state for comment interactions
  const [popoverState, setPopoverState] = useState<PopoverState>(INITIAL_POPOVER_STATE)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Note: Mark restoration requires editor access. We'll add onEditorReady
  // prop to RichTextEditor in a future update. For now, comment marks are
  // applied on click/hover through the CommentPlugin.

  // Convert threads to format expected by CommentPopover
  const threadDataMap = useMemo(() => {
    const map = new Map<string, CommentThreadData>()
    for (const thread of threads) {
      map.set(thread.root.id, {
        root: {
          id: thread.root.id,
          author: thread.root.properties.createdBy,
          authorDisplayName: undefined, // TODO: lookup display name
          content: thread.root.properties.content,
          createdAt: thread.root.createdAt,
          edited: thread.root.properties.edited,
          editedAt: thread.root.properties.editedAt,
          replyToUser: thread.root.properties.replyToUser,
          replyToCommentId: thread.root.properties.replyToCommentId
        },
        replies: thread.replies.map((r) => ({
          id: r.id,
          author: r.properties.createdBy,
          authorDisplayName: undefined,
          content: r.properties.content,
          createdAt: r.createdAt,
          edited: r.properties.edited,
          editedAt: r.properties.editedAt,
          replyToUser: r.properties.replyToUser,
          replyToCommentId: r.properties.replyToCommentId
        })),
        resolved: thread.root.properties.resolved
      })
    }
    return map
  }, [threads])

  // ─── Popover Handlers ─────────────────────────────────────────────────────────

  const handleClickComment = useCallback((commentId: string, anchorEl: HTMLElement) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setPopoverState({
      visible: true,
      mode: 'full',
      threadId: commentId,
      anchor: anchorEl
    })
  }, [])

  const handleHoverComment = useCallback((commentId: string, anchorEl: HTMLElement) => {
    // Delay showing preview to avoid flicker
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setPopoverState((prev) => {
        // Don't downgrade from full to preview if already showing full
        if (prev.visible && prev.mode === 'full' && prev.threadId === commentId) {
          return prev
        }
        return {
          visible: true,
          mode: 'preview',
          threadId: commentId,
          anchor: anchorEl
        }
      })
    }, 300)
  }, [])

  const handleLeaveComment = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    // Only dismiss if in preview mode
    setPopoverState((prev) => (prev.mode === 'preview' ? INITIAL_POPOVER_STATE : prev))
  }, [])

  const handleDismiss = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setPopoverState(INITIAL_POPOVER_STATE)
  }, [])

  const handleUpgradeToFull = useCallback(() => {
    setPopoverState((prev) => ({ ...prev, mode: 'full' }))
  }, [])

  // ─── Comment Actions ──────────────────────────────────────────────────────────

  const handleReply = useCallback(
    async (content: string) => {
      if (!popoverState.threadId) return
      await replyTo(popoverState.threadId, content)
    },
    [popoverState.threadId, replyTo]
  )

  const handleResolve = useCallback(async () => {
    if (!popoverState.threadId) return
    await resolveThread(popoverState.threadId)
  }, [popoverState.threadId, resolveThread])

  const handleReopen = useCallback(async () => {
    if (!popoverState.threadId) return
    await reopenThread(popoverState.threadId)
  }, [popoverState.threadId, reopenThread])

  const handleDelete = useCallback(
    async (commentId: string) => {
      await deleteComment(commentId)
      // If deleting root with no replies, close popover
      const thread = threadDataMap.get(popoverState.threadId || '')
      if (thread && commentId === thread.root.id && thread.replies.length === 0) {
        handleDismiss()
      }
    },
    [deleteComment, threadDataMap, popoverState.threadId, handleDismiss]
  )

  const handleEdit = useCallback(
    async (commentId: string, newContent: string) => {
      await editComment(commentId, newContent)
    },
    [editComment]
  )

  // ─── Comment Extensions ───────────────────────────────────────────────────────

  const commentExtensions = useMemo(
    () => [
      CommentMark,
      CommentPlugin.configure({
        onClickComment: handleClickComment,
        onHoverComment: handleHoverComment,
        onLeaveComment: handleLeaveComment
      })
    ],
    [handleClickComment, handleHoverComment, handleLeaveComment]
  )

  // Combine plugin extensions with comment extensions
  const allExtensions = useMemo(
    () => [...pluginExtensions, ...commentExtensions],
    [pluginExtensions, commentExtensions]
  )

  // TODO: Restore comment marks when document opens
  // This requires adding an onEditorReady callback to RichTextEditor
  // For now, comments will show on hover/click through the CommentPlugin

  // Get the current thread for the popover
  const currentThread = popoverState.threadId ? threadDataMap.get(popoverState.threadId) : null

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
        {unresolvedCount > 0 && (
          <div
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            title={`${unresolvedCount} unresolved comment${unresolvedCount !== 1 ? 's' : ''}`}
          >
            <span className="text-amber-500">{unresolvedCount}</span>
            <span>comment{unresolvedCount !== 1 ? 's' : ''}</span>
          </div>
        )}
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
          extensions={allExtensions}
        />
      </div>

      {/* Comment Popover */}
      {currentThread && popoverState.anchor && (
        <CommentPopover
          thread={currentThread}
          anchor={popoverState.anchor}
          mode={popoverState.mode}
          open={popoverState.visible}
          side="right"
          onReply={handleReply}
          onResolve={handleResolve}
          onReopen={handleReopen}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onDismiss={handleDismiss}
          onUpgradeToFull={handleUpgradeToFull}
        />
      )}
    </div>
  )
}

function SyncIndicator({ status, peerCount }: { status: SyncStatus; peerCount: number }) {
  const colors: Record<SyncStatus, string> = {
    offline: 'bg-zinc-500',
    connecting: 'bg-amber-400 animate-pulse',
    connected: 'bg-emerald-400',
    error: 'bg-red-500'
  }

  const labels: Record<SyncStatus, string> = {
    offline: 'Offline',
    connecting: 'Connecting...',
    connected: peerCount > 0 ? `${peerCount} peer${peerCount !== 1 ? 's' : ''}` : 'Connected',
    error: 'Sync error'
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={labels[status]}>
      <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span>{labels[status]}</span>
    </div>
  )
}
