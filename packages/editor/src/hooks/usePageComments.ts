/**
 * usePageComments - the shared page-comment subsystem behind PageView
 * (exploration 0276, Theme 3: well-traveled code paths).
 *
 * Since 0312 (TipTap → BlockNote) this hook is editor-decoupled: comments
 * are node-backed (LWW log) and surface in panels/popovers only. The
 * in-document comment *marks* were retired with the TipTap editor —
 * anchorData is still stored on each comment, so a future ThreadStore
 * integration can re-anchor them.
 */
import type { CommentThreadData, OrphanedThread } from '@xnetjs/ui'
import { PageSchema } from '@xnetjs/data'
import { useComments, type CommentThread } from '@xnetjs/react'
import { useCallback, useMemo, useRef, useState } from 'react'

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
}

export interface UsePageCommentsOptions {
  /** The page Node ID comments target. */
  docId: string
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
  const [orphanedCollapsed, setOrphanedCollapsed] = useState(false)
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const popoverHoveredRef = useRef(false)

  // Without in-document marks there is no anchor-loss detection; the
  // orphaned list stays empty until a ThreadStore integration re-anchors
  // comments in the document.
  const orphanedThreads = useMemo((): OrphanedThread[] => [], [])

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

  /** Schedule a dismiss after a short delay, unless the popover is hovered. */
  const scheduleDismiss = useCallback(() => {
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    dismissTimeoutRef.current = setTimeout(() => {
      if (!popoverHoveredRef.current) {
        setPopoverState(INITIAL_POPOVER_STATE)
      }
    }, 200)
  }, [])

  const handlePopoverMouseEnter = useCallback(() => {
    popoverHoveredRef.current = true
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
  }, [])

  const handlePopoverMouseLeave = useCallback(() => {
    popoverHoveredRef.current = false
    scheduleDismiss()
  }, [scheduleDismiss])

  const handleDismiss = useCallback(() => {
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    popoverHoveredRef.current = false
    setPopoverState(INITIAL_POPOVER_STATE)
  }, [])

  const handleUpgradeToFull = useCallback(() => {
    setPopoverState((prev) => ({ ...prev, mode: 'full' }))
  }, [])

  /** Show the popover for a thread (e.g. sidebar selection). */
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
  }, [popoverState.threadId, resolveThread])

  const handleReopen = useCallback(async () => {
    if (!popoverState.threadId) return
    await reopenThread(popoverState.threadId)
  }, [popoverState.threadId, reopenThread])

  const handleDelete = useCallback(
    async (commentId: string) => {
      await deleteComment(commentId)
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

  // Handler for initiating comment creation (e.g. a panel affordance).
  // Shows the input UI; actual comment creation happens on submit.
  const handleCreateComment = useCallback(async (anchorData: string): Promise<string | null> => {
    setNewCommentState({ visible: true, anchorData })
    return null
  }, [])

  // Handler for submitting a new comment
  const handleSubmitNewComment = useCallback(
    async (content: string) => {
      if (!newCommentState || !content.trim()) return

      await addComment({
        content: content.trim(),
        anchorType: 'text',
        anchorData: newCommentState.anchorData,
        targetSchema: PageSchema.schema['@id']
      })

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
      showThreadPopover(threadId, null)
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
    },
    [resolveThread]
  )

  const handleSidebarReopen = useCallback(
    async (threadId: string) => {
      await reopenThread(threadId)
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
      const thread = threads.find((t) => t.root.id === commentId)
      if (thread) {
        for (const reply of thread.replies) {
          await deleteComment(reply.id)
        }
        await deleteComment(commentId)
      }
    },
    [threads, deleteComment]
  )

  const handleReattachOrphaned = useCallback((commentId: string) => {
    console.log(`[Comments] Reattach not yet implemented for ${commentId}`)
  }, [])

  const toggleOrphanedCollapsed = useCallback(() => {
    setOrphanedCollapsed((prev) => !prev)
  }, [])

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
