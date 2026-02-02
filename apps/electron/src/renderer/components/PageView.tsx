/**
 * Page View - Rich text editor using @xnet/react hooks
 *
 * Features:
 * - Collaborative editing via Yjs
 * - Comment system with inline popover
 * - Real-time presence indicators
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { SyncStatus } from '@xnet/react'
// Editor type - we use any since @tiptap/core isn't directly available
import {
  useNode,
  useIdentity,
  useEditorExtensionsSafe,
  useComments,
  usePluginRegistryOptional
} from '@xnet/react'
import { PageSchema, decodeAnchor, type TextAnchor } from '@xnet/data'
import {
  RichTextEditor,
  useImageUpload,
  useFileUpload,
  useFileDownload,
  type Editor
} from '@xnet/editor/react'
import { CommentMark, CommentPlugin, restoreCommentMarks } from '@xnet/editor/extensions'
import {
  CommentPopover,
  OrphanedThreadList,
  type CommentThreadData,
  type OrphanedThread
} from '@xnet/ui'
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

/** State for creating a new comment (before submission) */
interface NewCommentState {
  visible: boolean
  anchorData: string
  /** Selection range to restore when applying the mark */
  selectionFrom: number
  selectionTo: number
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

  // Wait for plugin-contributed editor extensions to be registered before
  // mounting the editor. BundledPluginInstaller installs plugins (like Mermaid)
  // asynchronously. If the editor mounts before Mermaid is registered, Yjs
  // content containing mermaid nodes will crash ProseMirror ("toDOM is not a
  // function"). We gate on editorContributions being populated, which means
  // the plugin's activate() has run and contributions are registered.
  const pluginRegistry = usePluginRegistryOptional()
  const pluginsReady = pluginRegistry ? editorContributions.length > 0 : false

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
    addComment,
    replyTo,
    resolveThread,
    reopenThread,
    deleteComment,
    editComment,
    unresolvedCount
  } = useComments({ nodeId: docId, anchorType: 'text' })

  // Popover state for comment interactions
  const [popoverState, setPopoverState] = useState<PopoverState>(INITIAL_POPOVER_STATE)
  const [newCommentState, setNewCommentState] = useState<NewCommentState | null>(null)
  const [orphanedIds, setOrphanedIds] = useState<string[]>([])
  const [orphanedCollapsed, setOrphanedCollapsed] = useState(false)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const marksRestoredRef = useRef(false)
  const [editorReady, setEditorReady] = useState(false)

  // Reset mark restoration state when switching documents
  useEffect(() => {
    marksRestoredRef.current = false
    editorRef.current = null
    setEditorReady(false)
  }, [docId])

  // Handle editor ready - store ref and trigger mark restoration
  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor
    setEditorReady(true)
  }, [])

  // Restore comment marks when editor is ready and threads are loaded.
  // Both editorReady and threads are in the dependency array so the effect
  // fires regardless of which one becomes available first.
  useEffect(() => {
    if (!editorRef.current || marksRestoredRef.current || threads.length === 0) return

    // Convert threads to format expected by restoreCommentMarks
    const commentsToRestore = threads.map((t) => ({
      id: t.root.id,
      properties: {
        anchorType: t.root.properties.anchorType,
        anchorData: t.root.properties.anchorData,
        resolved: t.root.properties.resolved
      }
    }))

    // Restore marks - this will highlight the commented text
    const { resolved, orphaned } = restoreCommentMarks(editorRef.current, commentsToRestore)

    if (resolved.length > 0 || orphaned.length > 0) {
      marksRestoredRef.current = true
      setOrphanedIds(orphaned)
      console.log(`[Comments] Restored ${resolved.length} marks, ${orphaned.length} orphaned`)
    }
  }, [threads, editorReady])

  // Build orphaned threads list for display
  const orphanedThreads = useMemo((): OrphanedThread[] => {
    const result: OrphanedThread[] = []

    for (const id of orphanedIds) {
      const thread = threads.find((t) => t.root.id === id)
      if (!thread) continue

      // Parse anchor data to get context
      let context: string | undefined
      try {
        const anchor = JSON.parse(thread.root.properties.anchorData)
        context = anchor.quotedText
      } catch {
        // Ignore parse errors
      }

      result.push({
        comment: {
          id: thread.root.id,
          author: thread.root.properties.createdBy,
          authorDisplayName: undefined,
          content: thread.root.properties.content,
          createdAt: thread.root.createdAt,
          replyCount: thread.replies.length
        },
        reason: 'text-deleted',
        context
      })
    }

    return result
  }, [orphanedIds, threads])

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
    // Update the mark visual state to resolved (amber -> green)
    editorRef.current?.commands.setCommentResolved(popoverState.threadId, true)
  }, [popoverState.threadId, resolveThread])

  const handleReopen = useCallback(async () => {
    if (!popoverState.threadId) return
    await reopenThread(popoverState.threadId)
    // Update the mark visual state back to active (green -> amber)
    editorRef.current?.commands.setCommentResolved(popoverState.threadId, false)
  }, [popoverState.threadId, reopenThread])

  const handleDelete = useCallback(
    async (commentId: string) => {
      await deleteComment(commentId)
      // If deleting root with no replies, remove the mark from the document and close popover
      const thread = threadDataMap.get(popoverState.threadId || '')
      if (thread && commentId === thread.root.id && thread.replies.length === 0) {
        // Remove the comment mark from the editor document
        const editor = editorRef.current
        if (editor) {
          const { tr, doc } = editor.state
          const markType = editor.schema.marks.comment
          if (markType) {
            doc.descendants((node, pos) => {
              node.marks.forEach((mark) => {
                if (mark.type === markType && mark.attrs.commentId === commentId) {
                  tr.removeMark(pos, pos + node.nodeSize, mark)
                }
              })
            })
            editor.view.dispatch(tr)
          }
        }
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

  // Handler for initiating comment creation from toolbar selection
  // This shows the input UI; actual comment creation happens on submit
  const handleCreateComment = useCallback(async (anchorData: string): Promise<string | null> => {
    if (!editorRef.current) return null

    // Capture the current selection range so we can apply the mark later
    const { from, to } = editorRef.current.state.selection

    if (from === to) return null // No selection

    // Show the new comment input modal
    setNewCommentState({
      visible: true,
      anchorData,
      selectionFrom: from,
      selectionTo: to
    })

    // Return null - we're not creating the comment yet
    // The actual creation happens when user submits the new comment form
    return null
  }, [])

  // Handler for submitting a new comment
  const handleSubmitNewComment = useCallback(
    async (content: string) => {
      if (!newCommentState || !content.trim() || !editorRef.current) return

      const commentId = await addComment({
        content: content.trim(),
        anchorType: 'text',
        anchorData: newCommentState.anchorData,
        targetSchema: PageSchema.schema['@id']
      })

      if (commentId) {
        console.log('[Comments] Applying mark:', {
          commentId,
          from: newCommentState.selectionFrom,
          to: newCommentState.selectionTo
        })

        // Use the editor command to apply the mark
        // First, set selection to the original range, then apply mark
        editorRef.current
          .chain()
          .focus()
          .setTextSelection({
            from: newCommentState.selectionFrom,
            to: newCommentState.selectionTo
          })
          .setComment(commentId)
          .run()

        console.log('[Comments] Mark command executed, checking DOM...')
        setTimeout(() => {
          const el = document.querySelector(`[data-comment-id="${commentId}"]`)
          console.log('[Comments] DOM element found:', el)
          if (el) {
            console.log('[Comments] Element HTML:', el.outerHTML)
          }
        }, 50)

        // After a short delay, find the mark element and show the popover
        // This gives time for the DOM and threads state to update
        const showPopover = () => {
          const markEl = document.querySelector(
            `[data-comment-id="${commentId}"]`
          ) as HTMLElement | null
          if (markEl) {
            setPopoverState({
              visible: true,
              mode: 'full',
              threadId: commentId,
              anchor: markEl
            })
          }
        }
        // Try immediately, then retry after a delay if needed
        setTimeout(showPopover, 50)
        setTimeout(showPopover, 200)
      }

      // Close the new comment UI
      setNewCommentState(null)
    },
    [newCommentState, addComment]
  )

  // Handler for canceling new comment creation
  const handleCancelNewComment = useCallback(() => {
    setNewCommentState(null)
  }, [])

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

  // Get the current thread for the popover
  // If thread not found in map yet (newly created), it will show once threads update
  const currentThread = popoverState.threadId ? threadDataMap.get(popoverState.threadId) : null

  // Debug: log when popover should show but thread not found
  useEffect(() => {
    if (popoverState.visible && popoverState.threadId && !currentThread) {
      console.log('[Comments] Popover visible but thread not found yet:', popoverState.threadId)
      console.log(
        '[Comments] Available threads:',
        threads.map((t) => t.root.id)
      )
    }
  }, [popoverState, currentThread, threads])

  // ─── Orphaned Comment Handlers ─────────────────────────────────────────────────

  const handleDismissOrphaned = useCallback(
    async (commentId: string) => {
      // Delete the orphaned thread entirely
      const thread = threads.find((t) => t.root.id === commentId)
      if (thread) {
        // Delete replies first, then root
        for (const reply of thread.replies) {
          await deleteComment(reply.id)
        }
        await deleteComment(commentId)
      }
      // Remove from orphaned list
      setOrphanedIds((prev) => prev.filter((id) => id !== commentId))
    },
    [threads, deleteComment]
  )

  const handleReattachOrphaned = useCallback((commentId: string) => {
    // For now, just show a message - reattachment requires selecting new text
    // In a full implementation, this would open a mode to select new anchor text
    console.log(`[Comments] Reattach not yet implemented for ${commentId}`)
    // TODO: Implement reattachment UI - enter "select text" mode
  }, [])

  const handleSelectOrphaned = useCallback(
    (commentId: string) => {
      // Open the popover for this orphaned comment
      const thread = threadDataMap.get(commentId)
      if (thread) {
        // Since orphaned comments don't have anchor elements, use coordinates
        setPopoverState({
          visible: true,
          mode: 'full',
          threadId: commentId,
          anchor: null // Will need to position differently
        })
      }
    },
    [threadDataMap]
  )

  if (loading || !doc || !pluginsReady) {
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
          onCreateComment={handleCreateComment}
          onEditorReady={handleEditorReady}
        />

        {/* Orphaned Comments Section */}
        {orphanedThreads.length > 0 && (
          <div className="mt-6">
            <OrphanedThreadList
              orphanedThreads={orphanedThreads}
              collapsed={orphanedCollapsed}
              onToggleCollapse={() => setOrphanedCollapsed((prev) => !prev)}
              onDismiss={handleDismissOrphaned}
              onReattach={handleReattachOrphaned}
              onSelect={handleSelectOrphaned}
            />
          </div>
        )}
      </div>

      {/* Comment Popover */}
      {popoverState.visible &&
        popoverState.anchor &&
        (currentThread ? (
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
        ) : (
          <div
            className="fixed z-50 w-64 p-4 rounded-lg border bg-popover text-popover-foreground shadow-lg"
            style={{
              left: popoverState.anchor.getBoundingClientRect().right + 8,
              top: popoverState.anchor.getBoundingClientRect().top
            }}
          >
            <div className="text-sm text-muted-foreground">Loading comment...</div>
          </div>
        ))}

      {/* New Comment Input */}
      {newCommentState?.visible && (
        <NewCommentInput onSubmit={handleSubmitNewComment} onCancel={handleCancelNewComment} />
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

// ─── New Comment Input ─────────────────────────────────────────────────────────

interface NewCommentInputProps {
  onSubmit: (content: string) => void
  onCancel: () => void
}

function NewCommentInput({ onSubmit, onCancel }: NewCommentInputProps) {
  const [content, setContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    if (content.trim()) {
      onSubmit(content)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="w-80 rounded-lg border bg-popover text-popover-foreground shadow-lg p-4">
        <div className="text-sm font-medium mb-2">Add Comment</div>
        <textarea
          ref={textareaRef}
          className="w-full p-2 text-sm rounded border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring min-h-[80px]"
          placeholder="Write a comment..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!content.trim()}
            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Comment
          </button>
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          Press Cmd+Enter to submit, Esc to cancel
        </div>
      </div>
    </div>
  )
}
