/**
 * usePageComments - the shared page-comment subsystem behind PageView
 * (exploration 0276, Theme 3: well-traveled code paths).
 *
 * The web and desktop PageViews carried ~800-line verbatim copies of the same
 * comment state machine: popover show/hide with hover grace timers, text-anchor
 * mark restoration, orphaned-thread assembly, thread-data conversion, and the
 * reply / resolve / reopen / delete / edit actions (inline popover + sidebar
 * variants). This hook owns all of that; the per-app PageViews keep only their
 * platform rendering (context panel vs. inline sidebar, editor surface wiring).
 *
 * Platform deltas preserved as options:
 * - `dismissPopoverOnCaretExit` (desktop): dismiss the popover when the caret
 *   moves outside the popover thread's comment mark.
 */
import type { AnyExtension } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import type { CommentThreadData, OrphanedThread } from '@xnetjs/ui'
import { PageSchema } from '@xnetjs/data'
import { useComments, type CommentThread } from '@xnetjs/react'
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { CommentMark, CommentPlugin, restoreCommentMarks } from '../extensions/comment'

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Comment popover visibility / anchoring state. */
export interface PageCommentPopoverState {
  visible: boolean
  mode: 'preview' | 'full'
  threadId: string | null
  anchor: HTMLElement | null
}

const INITIAL_POPOVER_STATE: PageCommentPopoverState = {
  visible: false,
  mode: 'preview',
  threadId: null,
  anchor: null
}

/** State for creating a new comment (before submission). */
export interface PageNewCommentState {
  visible: boolean
  anchorData: string
  /** Selection range to restore when applying the mark */
  selectionFrom: number
  selectionTo: number
}

export interface UsePageCommentsOptions {
  /** The page Node ID comments target. */
  docId: string
  /**
   * Dismiss the popover when the caret moves outside the popover thread's
   * comment mark (TipTap `selectionUpdate`). Desktop PageView behavior.
   */
  dismissPopoverOnCaretExit?: boolean
  /**
   * Resolve an author DID to a display name (e.g. from synced Profile
   * nodes). Unresolved authors fall back to a DID fragment in the UI.
   */
  resolveAuthorName?: (did: string) => string | undefined
}

export interface UsePageCommentsResult {
  // Data
  threads: CommentThread[]
  unresolvedCount: number
  threadDataMap: Map<string, CommentThreadData>
  sidebarThreads: CommentThreadData[]
  /** Thread backing the popover, or null when it is not (yet) loaded. */
  currentThread: CommentThreadData | null
  orphanedThreads: OrphanedThread[]
  orphanedCollapsed: boolean
  toggleOrphanedCollapsed: () => void
  popoverState: PageCommentPopoverState
  newCommentState: PageNewCommentState | null

  // Editor wiring
  editorRef: MutableRefObject<Editor | null>
  editorReady: boolean
  handleEditorReady: (editor: Editor) => void
  /** CommentMark + CommentPlugin wired to the popover handlers. */
  commentExtensions: AnyExtension[]

  // Popover
  showThreadPopover: (threadId: string, anchor: HTMLElement | null) => void
  handlePopoverMouseEnter: () => void
  handlePopoverMouseLeave: () => void
  handleDismiss: () => void
  handleUpgradeToFull: () => void

  // Comment actions (popover-scoped)
  handleReply: (content: string) => Promise<void>
  handleResolve: () => Promise<void>
  handleReopen: () => Promise<void>
  handleDelete: (commentId: string) => Promise<void>
  handleEdit: (commentId: string, newContent: string) => Promise<void>

  // New-comment flow
  handleCreateComment: (anchorData: string) => Promise<string | null>
  handleSubmitNewComment: (content: string) => Promise<void>
  handleCancelNewComment: () => void

  // Sidebar actions (thread-id scoped)
  handleSidebarSelectThread: (threadId: string) => void
  handleSidebarReply: (threadId: string, content: string) => Promise<void>
  handleSidebarResolve: (threadId: string) => Promise<void>
  handleSidebarReopen: (threadId: string) => Promise<void>
  handleSidebarDelete: (commentId: string) => Promise<void>
  handleSidebarEdit: (commentId: string, newContent: string) => Promise<void>

  // Orphaned threads
  handleDismissOrphaned: (commentId: string) => Promise<void>
  handleReattachOrphaned: (commentId: string) => void
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function usePageComments({
  docId,
  dismissPopoverOnCaretExit = false,
  resolveAuthorName
}: UsePageCommentsOptions): UsePageCommentsResult {
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
  const [popoverState, setPopoverState] = useState<PageCommentPopoverState>(INITIAL_POPOVER_STATE)
  const [newCommentState, setNewCommentState] = useState<PageNewCommentState | null>(null)
  const [orphanedIds, setOrphanedIds] = useState<string[]>([])
  const [orphanedCollapsed, setOrphanedCollapsed] = useState(false)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const marksRestoredRef = useRef(false)
  const [editorReady, setEditorReady] = useState(false)

  // Track hover state for mark and popover; the popover stays open as
  // long as either is hovered.
  const markHoveredRef = useRef(false)
  const popoverHoveredRef = useRef(false)

  // Reset mark restoration state when switching documents. Skip the
  // initial run: parent effects fire after the editor's ready
  // notification, so an unconditional reset would null the ref the
  // moment it was set.
  const lastDocIdRef = useRef(docId)
  useEffect(() => {
    if (lastDocIdRef.current === docId) return
    lastDocIdRef.current = docId
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

  // Dismiss the comment popover when the caret moves out of comment marks
  // (opt-in; TipTap's onSelectionUpdate fires after every cursor movement).
  useEffect(() => {
    if (!dismissPopoverOnCaretExit) return
    const editor = editorRef.current
    if (!editor) return

    const onSelectionUpdate = () => {
      setPopoverState((prev) => {
        if (!prev.visible || !prev.threadId) return prev
        const { from } = editor.state.selection
        const resolved = editor.state.doc.resolve(from)
        const inComment = resolved.marks().some((mark) => {
          const typedMark = mark as {
            type?: { name?: string }
            attrs?: { commentId?: string }
          }
          return typedMark.type?.name === 'comment' && typedMark.attrs?.commentId === prev.threadId
        })
        if (!inComment && !markHoveredRef.current && !popoverHoveredRef.current) {
          return INITIAL_POPOVER_STATE
        }
        return prev
      })
    }

    editor.on('selectionUpdate', onSelectionUpdate)
    return () => {
      editor.off('selectionUpdate', onSelectionUpdate)
    }
  }, [dismissPopoverOnCaretExit, editorReady])

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
          authorDisplayName: resolveAuthorName?.(thread.root.properties.createdBy),
          content: thread.root.properties.content,
          createdAt: thread.root.createdAt,
          replyCount: thread.replies.length
        },
        reason: 'text-deleted',
        context
      })
    }

    return result
  }, [orphanedIds, threads, resolveAuthorName])

  // Convert threads to format expected by CommentPopover/CommentsSidebar
  const threadDataMap = useMemo(() => {
    const map = new Map<string, CommentThreadData>()
    for (const thread of threads) {
      map.set(thread.root.id, {
        root: {
          id: thread.root.id,
          author: thread.root.properties.createdBy,
          authorDisplayName: resolveAuthorName?.(thread.root.properties.createdBy),
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
          authorDisplayName: resolveAuthorName?.(r.properties.createdBy),
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
  }, [threads, resolveAuthorName])

  // ─── Popover Handlers ─────────────────────────────────────────────────────────

  /** Check if the editor caret is currently inside a comment mark. */
  const isCaretInComment = useCallback((): boolean => {
    const editor = editorRef.current
    if (!editor) return false
    const { from } = editor.state.selection
    const resolved = editor.state.doc.resolve(from)
    return resolved.marks().some((mark) => {
      const typedMark = mark as { type?: { name?: string } }
      return typedMark.type?.name === 'comment'
    })
  }, [])

  /** Schedule a dismiss after a short delay, unless mark/popover is hovered or caret is in comment. */
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
      // Already showing for this comment — keep as-is to avoid flicker
      if (prev.visible && prev.mode === 'full' && prev.threadId === commentId) return prev
      return { visible: true, mode: 'full', threadId: commentId, anchor: anchorEl }
    })
  }, [])

  const handleHoverComment = useCallback((commentId: string, anchorEl: HTMLElement) => {
    markHoveredRef.current = true
    // Cancel any pending dismiss; delay showing to avoid flicker on quick passes
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

  /** Show the popover for a thread (e.g. sidebar selection, orphaned threads). */
  const showThreadPopover = useCallback((threadId: string, anchor: HTMLElement | null) => {
    setPopoverState({ visible: true, mode: 'full', threadId, anchor })
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

  // Handler for initiating comment creation from toolbar selection.
  // This shows the input UI; actual comment creation happens on submit.
  const handleCreateComment = useCallback(async (anchorData: string): Promise<string | null> => {
    if (!editorRef.current) return null
    // Capture the current selection range so we can apply the mark later
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
        // Apply the mark: set selection to the original range, then mark it
        editorRef.current
          .chain()
          .focus()
          .setTextSelection({
            from: newCommentState.selectionFrom,
            to: newCommentState.selectionTo
          })
          .setComment(commentId)
          .run()

        // After a short delay, find the mark element and show the popover.
        // This gives time for the DOM and threads state to update.
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

      setNewCommentState(null)
    },
    [newCommentState, addComment]
  )

  const handleCancelNewComment = useCallback(() => {
    setNewCommentState(null)
  }, [])

  // ─── Sidebar Handlers ─────────────────────────────────────────────────────────

  const handleSidebarSelectThread = useCallback(
    (threadId: string) => {
      // Find and scroll to the comment mark in the editor
      const markEl = document.querySelector(`[data-comment-id="${threadId}"]`) as HTMLElement | null
      if (markEl) {
        markEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        showThreadPopover(threadId, markEl)
      }
    },
    [showThreadPopover]
  )

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

  const toggleOrphanedCollapsed = useCallback(() => {
    setOrphanedCollapsed((prev) => !prev)
  }, [])

  // ─── Comment Extensions ───────────────────────────────────────────────────────

  const commentExtensions = useMemo<AnyExtension[]>(
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

  // Get the current thread for the popover. If the thread is not in the map
  // yet (newly created), it will show once threads update.
  const currentThread = popoverState.threadId
    ? (threadDataMap.get(popoverState.threadId) ?? null)
    : null
  const sidebarThreads = useMemo(() => Array.from(threadDataMap.values()), [threadDataMap])

  return {
    threads,
    unresolvedCount,
    threadDataMap,
    sidebarThreads,
    currentThread,
    orphanedThreads,
    orphanedCollapsed,
    toggleOrphanedCollapsed,
    popoverState,
    newCommentState,
    editorRef,
    editorReady,
    handleEditorReady,
    commentExtensions,
    showThreadPopover,
    handlePopoverMouseEnter,
    handlePopoverMouseLeave,
    handleDismiss,
    handleUpgradeToFull,
    handleReply,
    handleResolve,
    handleReopen,
    handleDelete,
    handleEdit,
    handleCreateComment,
    handleSubmitNewComment,
    handleCancelNewComment,
    handleSidebarSelectThread,
    handleSidebarReply,
    handleSidebarResolve,
    handleSidebarReopen,
    handleSidebarDelete,
    handleSidebarEdit,
    handleDismissOrphaned,
    handleReattachOrphaned
  }
}
