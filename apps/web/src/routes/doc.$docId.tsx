/**
 * Document page - editor with comment system
 *
 * Features:
 * - Collaborative editing via Yjs
 * - Comment system with inline popover and sidebar
 * - Real-time presence indicators
 */
import type { Editor } from '@xnetjs/editor/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PageSchema } from '@xnetjs/data'
import { CommentMark, CommentPlugin, restoreCommentMarks } from '@xnetjs/editor/extensions'
import { useNode, useComments, useIdentity, usePageTaskSync } from '@xnetjs/react'
import {
  CommentPopover,
  CommentsSidebar,
  OrphanedThreadList,
  type CommentThreadData,
  type OrphanedThread
} from '@xnetjs/ui'
import { MessageSquare } from 'lucide-react'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { BacklinksPanel } from '../components/BacklinksPanel'
import { Editor as EditorComponent } from '../components/Editor'
import { PageTasksPanel } from '../components/PageTasksPanel'
import { PresenceAvatars } from '../components/PresenceAvatars'
import { ShareButton } from '../components/ShareButton'

export const Route = createFileRoute('/doc/$docId')({
  component: DocumentPage
})

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
  selectionFrom: number
  selectionTo: number
}

function DocumentPage() {
  const { docId } = Route.useParams()
  const navigate = useNavigate()
  const { identity } = useIdentity()
  const did = identity?.did

  // Load document with Y.Doc, sync, presence, and auto-create
  const {
    data: page,
    doc,
    update,
    loading,
    error,
    syncStatus,
    peerCount,
    presence,
    awareness,
    isDirty,
    lastSavedAt
  } = useNode(PageSchema, docId, {
    createIfMissing: { title: 'Untitled' },
    did: did ?? undefined
  })
  const { handleTasksChange } = usePageTaskSync({ pageId: docId })
  const mentionSuggestions = useMemo(() => {
    const suggestions = new Map<
      string,
      { id: string; label: string; subtitle?: string; color?: string }
    >()

    const addSuggestion = (
      entry: { did: string; name?: string; color?: string } | null | undefined,
      isLocal = false
    ) => {
      if (!entry?.did || suggestions.has(entry.did)) return

      suggestions.set(entry.did, {
        id: entry.did,
        label: entry.name?.trim() || `${entry.did.slice(8, 16)}...`,
        subtitle: isLocal ? 'You' : entry.did,
        color: entry.color
      })
    }

    addSuggestion(did ? { did } : null, true)
    presence.forEach((user) => addSuggestion(user))

    return Array.from(suggestions.values())
  }, [did, presence])

  // ─── Comments Integration ─────────────────────────────────────────────────────

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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [orphanedIds, setOrphanedIds] = useState<string[]>([])
  const [orphanedCollapsed, setOrphanedCollapsed] = useState(false)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const marksRestoredRef = useRef(false)
  const [editorReady, setEditorReady] = useState(false)

  // Track hover state for mark and popover
  const markHoveredRef = useRef(false)
  const popoverHoveredRef = useRef(false)

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

  // Restore comment marks when editor is ready and threads are loaded
  useEffect(() => {
    if (!editorRef.current || marksRestoredRef.current || threads.length === 0) return

    const commentsToRestore = threads.map((t) => ({
      id: t.root.id,
      properties: {
        anchorType: t.root.properties.anchorType,
        anchorData: t.root.properties.anchorData,
        resolved: t.root.properties.resolved
      }
    }))

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

  // Convert threads to format expected by CommentPopover/CommentsSidebar
  const threadDataMap = useMemo(() => {
    const map = new Map<string, CommentThreadData>()
    for (const thread of threads) {
      map.set(thread.root.id, {
        root: {
          id: thread.root.id,
          author: thread.root.properties.createdBy,
          authorDisplayName: undefined,
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

  const isCaretInComment = useCallback((): boolean => {
    const editor = editorRef.current
    if (!editor) return false
    const { from } = editor.state.selection
    const resolved = editor.state.doc.resolve(from)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return resolved.marks().some((m: any) => m.type.name === 'comment')
  }, [])

  const scheduleDismiss = useCallback(() => {
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    dismissTimeoutRef.current = setTimeout(() => {
      if (!markHoveredRef.current && !popoverHoveredRef.current && !isCaretInComment()) {
        setPopoverState(INITIAL_POPOVER_STATE)
      }
    }, 200)
  }, [isCaretInComment])

  const handleClickComment = useCallback((commentId: string, anchorEl: HTMLElement) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    setPopoverState((prev) => {
      if (prev.visible && prev.mode === 'full' && prev.threadId === commentId) return prev
      return { visible: true, mode: 'full', threadId: commentId, anchor: anchorEl }
    })
  }, [])

  const handleHoverComment = useCallback((commentId: string, anchorEl: HTMLElement) => {
    markHoveredRef.current = true
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => {
      setPopoverState((prev) => {
        if (prev.visible && prev.threadId === commentId) return prev
        return { visible: true, mode: 'full', threadId: commentId, anchor: anchorEl }
      })
    }, 300)
  }, [])

  const handleLeaveComment = useCallback(() => {
    markHoveredRef.current = false
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    scheduleDismiss()
  }, [scheduleDismiss])

  const handlePopoverMouseEnter = useCallback(() => {
    popoverHoveredRef.current = true
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
  }, [])

  const handlePopoverMouseLeave = useCallback(() => {
    popoverHoveredRef.current = false
    scheduleDismiss()
  }, [scheduleDismiss])

  const handleDismiss = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    markHoveredRef.current = false
    popoverHoveredRef.current = false
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
    editorRef.current?.commands.setCommentResolved(popoverState.threadId, true)
  }, [popoverState.threadId, resolveThread])

  const handleReopen = useCallback(async () => {
    if (!popoverState.threadId) return
    await reopenThread(popoverState.threadId)
    editorRef.current?.commands.setCommentResolved(popoverState.threadId, false)
  }, [popoverState.threadId, reopenThread])

  const handleDelete = useCallback(
    async (commentId: string) => {
      await deleteComment(commentId)
      const thread = threadDataMap.get(popoverState.threadId || '')
      if (thread && commentId === thread.root.id && thread.replies.length === 0) {
        const editor = editorRef.current
        if (editor) {
          const { tr, doc: editorDoc } = editor.state
          const markType = editor.schema.marks.comment
          if (markType) {
            editorDoc.descendants((node, pos) => {
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

  // Handler for initiating comment creation from toolbar
  const handleCreateComment = useCallback(async (anchorData: string): Promise<string | null> => {
    if (!editorRef.current) return null
    const { from, to } = editorRef.current.state.selection
    if (from === to) return null

    setNewCommentState({
      visible: true,
      anchorData,
      selectionFrom: from,
      selectionTo: to
    })
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
        editorRef.current
          .chain()
          .focus()
          .setTextSelection({
            from: newCommentState.selectionFrom,
            to: newCommentState.selectionTo
          })
          .setComment(commentId)
          .run()

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
        setTimeout(showPopover, 50)
        setTimeout(showPopover, 200)
      }

      setNewCommentState(null)
    },
    [newCommentState, addComment]
  )

  const handleCancelNewComment = useCallback(() => {
    setNewCommentState(null)
  }, [])

  // ─── Sidebar Handlers ─────────────────────────────────────────────────────────

  const handleSidebarSelectThread = useCallback((threadId: string) => {
    const markEl = document.querySelector(`[data-comment-id="${threadId}"]`) as HTMLElement | null
    if (markEl) {
      markEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setPopoverState({
        visible: true,
        mode: 'full',
        threadId,
        anchor: markEl
      })
    }
  }, [])

  const handleSidebarReply = useCallback(
    async (threadId: string, content: string) => {
      await replyTo(threadId, content)
    },
    [replyTo]
  )

  const handleSidebarResolve = useCallback(
    async (threadId: string) => {
      await resolveThread(threadId)
      editorRef.current?.commands.setCommentResolved(threadId, true)
    },
    [resolveThread]
  )

  const handleSidebarReopen = useCallback(
    async (threadId: string) => {
      await reopenThread(threadId)
      editorRef.current?.commands.setCommentResolved(threadId, false)
    },
    [reopenThread]
  )

  const handleSidebarDelete = useCallback(
    async (commentId: string) => {
      await deleteComment(commentId)
    },
    [deleteComment]
  )

  const handleSidebarEdit = useCallback(
    async (commentId: string, newContent: string) => {
      await editComment(commentId, newContent)
    },
    [editComment]
  )

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
    // For now, just log - reattachment requires selecting new text
    console.log(`[Comments] Reattach not yet implemented for ${commentId}`)
  }, [])

  const handleSelectOrphaned = useCallback(
    (commentId: string) => {
      // Open the popover for this orphaned comment
      const thread = threadDataMap.get(commentId)
      if (thread) {
        // Since orphaned comments don't have anchor elements, open sidebar instead
        setSidebarOpen(true)
      }
    },
    [threadDataMap]
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

  // Get the current thread for the popover
  const currentThread = popoverState.threadId ? threadDataMap.get(popoverState.threadId) : null
  const sidebarThreads = useMemo(() => Array.from(threadDataMap.values()), [threadDataMap])

  // Handle wikilink navigation
  const handleNavigate = (targetDocId: string) => {
    navigate({ to: '/doc/$docId', params: { docId: targetDocId } })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading document...
      </div>
    )
  }

  if (error) {
    return <div className="text-center p-6 text-danger">Error: {error.message}</div>
  }

  if (!page || !doc) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
      </div>
    )
  }

  const connected = syncStatus === 'connected'

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden -m-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-secondary">
        <input
          type="text"
          className="text-xl font-semibold border-none bg-transparent text-foreground flex-1 outline-none placeholder:text-muted-foreground"
          value={page.title || ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Untitled"
        />

        {/* Comment count badge */}
        {unresolvedCount > 0 && (
          <button
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-amber-600 hover:text-amber-500 bg-amber-500/10 rounded-md transition-colors"
            title={`${unresolvedCount} unresolved comment${unresolvedCount !== 1 ? 's' : ''}`}
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            <MessageSquare size={14} />
            <span>{unresolvedCount}</span>
          </button>
        )}

        <PresenceAvatars presence={presence} />
        <ShareButton docId={docId} docType="page" />

        {/* Save status indicator */}
        <div
          className="text-xs text-muted-foreground"
          title={
            lastSavedAt
              ? `Last saved: ${new Date(lastSavedAt).toLocaleTimeString()}`
              : 'Not saved yet'
          }
        >
          {isDirty ? (
            <span className="text-amber-500">Saving...</span>
          ) : lastSavedAt ? (
            <span className="text-success">Saved</span>
          ) : null}
        </div>

        {/* Sync status indicator */}
        <div
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          title={connected ? `Connected (${peerCount} peers)` : syncStatus}
        >
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              connected ? 'bg-success' : 'bg-muted-foreground'
            }`}
          />
          {peerCount > 0 && <span className="text-xs font-medium">{peerCount}</span>}
        </div>
      </div>

      {/* Editor + Sidebar horizontal layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <EditorComponent
              doc={doc}
              awareness={awareness}
              did={did}
              pageId={docId}
              onNavigate={handleNavigate}
              extensions={commentExtensions}
              onEditorReady={handleEditorReady}
              mentionSuggestions={mentionSuggestions}
              onPageTasksChange={handleTasksChange}
              onCreateComment={handleCreateComment}
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

            <PageTasksPanel pageId={docId} />
            <BacklinksPanel docId={docId} />
          </div>
        </div>

        {/* Comments Sidebar */}
        <CommentsSidebar
          threads={sidebarThreads}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onSelectThread={handleSidebarSelectThread}
          selectedThreadId={popoverState.threadId}
          onReply={handleSidebarReply}
          onResolve={handleSidebarResolve}
          onReopen={handleSidebarReopen}
          onDelete={handleSidebarDelete}
          onEdit={handleSidebarEdit}
        />
      </div>

      {/* Comment Popover */}
      {popoverState.visible && popoverState.anchor && currentThread && (
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
          onMouseEnter={handlePopoverMouseEnter}
          onMouseLeave={handlePopoverMouseLeave}
        />
      )}

      {/* New Comment Input Modal */}
      {newCommentState?.visible && (
        <NewCommentInput onSubmit={handleSubmitNewComment} onCancel={handleCancelNewComment} />
      )}
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
