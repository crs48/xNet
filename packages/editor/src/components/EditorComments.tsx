/**
 * EditorComments - Comment layer for the RichTextEditor.
 *
 * This component integrates the comment system with TipTap:
 * - Adds CommentMark and CommentPlugin extensions
 * - Restores comment marks from stored Comment nodes
 * - Manages popover state for click/hover interactions
 * - Provides comment creation from text selection
 */
import type { Editor } from '@tiptap/core'
import { encodeAnchor } from '@xnetjs/data'
import * as React from 'react'
import { useEffect, useCallback, useState, useRef } from 'react'
import {
  CommentMark,
  CommentPlugin,
  captureTextAnchor,
  restoreCommentMarks,
  setSelectedComment
} from '../extensions/comment'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CommentForEditor {
  id: string
  anchorType: string
  anchorData: string
  content: string
  resolved: boolean
  author: string
  authorDisplayName?: string
  createdAt: number
  edited?: boolean
  editedAt?: number
  replyToUser?: string
  replyToCommentId?: string
}

export interface CommentThreadForEditor {
  root: CommentForEditor
  replies: CommentForEditor[]
}

export interface EditorCommentsProps {
  /** TipTap editor instance */
  editor: Editor | null
  /** Document node ID (target for comments) */
  documentId: string
  /** Document schema IRI (for optimization) */
  documentSchema?: string
  /** All comment threads for this document */
  threads: CommentThreadForEditor[]
  /** Callback to create a new comment */
  onCreateComment?: (options: {
    content: string
    anchorType: 'text'
    anchorData: string
    targetSchema?: string
  }) => Promise<string | null>
  /** Callback when a reply is added */
  onReply?: (rootCommentId: string, content: string) => Promise<string | null>
  /** Callback to resolve a thread */
  onResolve?: (rootCommentId: string) => Promise<void>
  /** Callback to reopen a thread */
  onReopen?: (rootCommentId: string) => Promise<void>
  /** Callback to delete a comment */
  onDelete?: (commentId: string) => Promise<void>
  /** Callback to edit a comment */
  onEdit?: (commentId: string, content: string) => Promise<void>
  /** Render the popover UI (provided by parent) */
  renderPopover?: (props: {
    thread: CommentThreadForEditor
    anchor: HTMLElement | { x: number; y: number }
    mode: 'preview' | 'full'
    open: boolean
    onReply: (content: string) => void
    onResolve: () => void
    onReopen: () => void
    onDelete: (commentId: string) => void
    onEdit: (commentId: string, content: string) => void
    onDismiss: () => void
    onUpgradeToFull: () => void
  }) => React.ReactNode
}

interface PopoverState {
  visible: boolean
  mode: 'preview' | 'full'
  threadId: string | null
  anchor: HTMLElement | { x: number; y: number } | null
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * Comment integration layer for the editor.
 *
 * This component:
 * 1. Returns the TipTap extensions needed for comments
 * 2. Restores comment marks when the document loads
 * 3. Handles click/hover interactions on comment marks
 *
 * @example
 * ```tsx
 * function PageEditor({ documentId, ydoc }) {
 *   const { threads, addComment, replyTo } = useComments({ nodeId: documentId })
 *   const [editor, setEditor] = useState<Editor | null>(null)
 *
 *   return (
 *     <>
 *       <RichTextEditor
 *         ydoc={ydoc}
 *         extensions={[CommentMark, CommentPlugin.configure({
 *           onClickComment: (id, el) => showFull(id, el),
 *           onHoverComment: (id, el) => showPreview(id, el),
 *           onLeaveComment: () => cancelPreview()
 *         })]}
 *         onEditorReady={setEditor}
 *       />
 *       <EditorComments
 *         editor={editor}
 *         documentId={documentId}
 *         threads={threads}
 *         onCreateComment={addComment}
 *         onReply={replyTo}
 *       />
 *     </>
 *   )
 * }
 * ```
 */
export function EditorComments({
  editor,
  documentId: _documentId,
  documentSchema,
  threads,
  onCreateComment,
  onReply,
  onResolve,
  onReopen,
  onDelete,
  onEdit,
  renderPopover
}: EditorCommentsProps) {
  const [popoverState, setPopoverState] = useState<PopoverState>({
    visible: false,
    mode: 'preview',
    threadId: null,
    anchor: null
  })

  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoredRef = useRef(false)

  // Find a thread by root comment ID
  const findThread = useCallback(
    (commentId: string) => threads.find((t) => t.root.id === commentId),
    [threads]
  )

  // ─── Restore Comment Marks ───────────────────────────────────────────────────

  useEffect(() => {
    if (!editor || restoredRef.current) return

    // Wait for editor to be ready
    if (!editor.view) return

    // Convert threads to format expected by restoreCommentMarks
    const commentsToRestore = threads
      .filter((t) => t.root.anchorType === 'text')
      .map((t) => ({
        id: t.root.id,
        properties: {
          anchorType: t.root.anchorType,
          anchorData: t.root.anchorData,
          resolved: t.root.resolved
        }
      }))

    if (commentsToRestore.length > 0) {
      const { resolved, orphaned } = restoreCommentMarks(editor, commentsToRestore)
      if (resolved.length > 0 || orphaned.length > 0) {
        restoredRef.current = true
      }
    }
  }, [editor, threads])

  // ─── Popover Handlers ────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const showPreview = useCallback((commentId: string, anchorEl: HTMLElement) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }

    hoverTimeoutRef.current = setTimeout(() => {
      setPopoverState({
        visible: true,
        mode: 'preview',
        threadId: commentId,
        anchor: anchorEl
      })
    }, 300)
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const showFull = useCallback(
    (commentId: string, anchorEl: HTMLElement) => {
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

      // Update editor decoration
      if (editor) {
        setSelectedComment(editor.view, commentId)
      }
    },
    [editor]
  )

  const upgradeToFull = useCallback(() => {
    setPopoverState((prev) => ({ ...prev, mode: 'full' }))
  }, [])

  const dismiss = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }

    setPopoverState({
      visible: false,
      mode: 'preview',
      threadId: null,
      anchor: null
    })

    // Clear editor decoration
    if (editor) {
      setSelectedComment(editor.view, null)
    }
  }, [editor])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cancelPreview = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }

    // Only dismiss if in preview mode
    setPopoverState((prev) => (prev.mode === 'preview' ? { ...prev, visible: false } : prev))
  }, [])

  // ─── Comment Actions ─────────────────────────────────────────────────────────

  const handleReply = useCallback(
    async (content: string) => {
      if (!popoverState.threadId || !onReply) return
      await onReply(popoverState.threadId, content)
    },
    [popoverState.threadId, onReply]
  )

  const handleResolve = useCallback(async () => {
    if (!popoverState.threadId || !onResolve) return
    await onResolve(popoverState.threadId)

    // Update mark to show resolved state
    if (editor) {
      editor.commands.setCommentResolved(popoverState.threadId, true)
    }
  }, [popoverState.threadId, onResolve, editor])

  const handleReopen = useCallback(async () => {
    if (!popoverState.threadId || !onReopen) return
    await onReopen(popoverState.threadId)

    // Update mark to show active state
    if (editor) {
      editor.commands.setCommentResolved(popoverState.threadId, false)
    }
  }, [popoverState.threadId, onReopen, editor])

  const handleDelete = useCallback(
    async (commentId: string) => {
      if (!onDelete) return
      await onDelete(commentId)

      // If deleting the root, remove the mark and close popover
      const thread = findThread(commentId)
      if (thread && thread.replies.length === 0) {
        // Remove the mark from the document
        if (editor) {
          // We need to find and remove all marks with this commentId
          const { tr, doc } = editor.state
          doc.descendants((node, pos) => {
            const mark = node.marks.find(
              (m) => m.type.name === 'comment' && m.attrs.commentId === commentId
            )
            if (mark) {
              tr.removeMark(pos, pos + node.nodeSize, mark)
            }
          })
          if (tr.steps.length > 0) {
            editor.view.dispatch(tr)
          }
        }
        dismiss()
      }
    },
    [onDelete, findThread, editor, dismiss]
  )

  const handleEdit = useCallback(
    async (commentId: string, content: string) => {
      if (!onEdit) return
      await onEdit(commentId, content)
    },
    [onEdit]
  )

  // ─── Create Comment from Selection ───────────────────────────────────────────

  /**
   * Create a comment on the current text selection.
   * This should be called from a toolbar button or keyboard shortcut.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const createCommentFromSelection = useCallback(
    async (content: string): Promise<string | null> => {
      if (!editor || !onCreateComment) return null

      // Capture the anchor from current selection
      const anchor = captureTextAnchor(editor)
      if (!anchor) return null

      // Create the comment
      const commentId = await onCreateComment({
        content,
        anchorType: 'text',
        anchorData: encodeAnchor(anchor),
        targetSchema: documentSchema
      })

      if (commentId) {
        // Apply the mark to the selection
        editor.commands.setComment(commentId)
      }

      return commentId
    },
    [editor, onCreateComment, documentSchema]
  )

  // ─── Render Popover ──────────────────────────────────────────────────────────

  const thread = popoverState.threadId ? findThread(popoverState.threadId) : null

  return (
    <>
      {renderPopover &&
        thread &&
        popoverState.anchor &&
        renderPopover({
          thread,
          anchor: popoverState.anchor,
          mode: popoverState.mode,
          open: popoverState.visible,
          onReply: handleReply,
          onResolve: handleResolve,
          onReopen: handleReopen,
          onDelete: handleDelete,
          onEdit: handleEdit,
          onDismiss: dismiss,
          onUpgradeToFull: upgradeToFull
        })}
    </>
  )
}

// ─── Extension Configuration Helper ────────────────────────────────────────────

/**
 * Create configured comment extensions for the editor.
 */
export function createCommentExtensions(options: {
  onClickComment: (commentId: string, anchorEl: HTMLElement) => void
  onHoverComment: (commentId: string, anchorEl: HTMLElement) => void
  onLeaveComment: () => void
}) {
  return [
    CommentMark,
    CommentPlugin.configure({
      onClickComment: options.onClickComment,
      onHoverComment: options.onHoverComment,
      onLeaveComment: options.onLeaveComment
    })
  ]
}

/**
 * Export hooks and utilities for comment creation.
 */
export { captureTextAnchor } from '../extensions/comment'
