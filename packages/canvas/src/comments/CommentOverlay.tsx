/**
 * CommentOverlay - Renders all comment pins on the canvas.
 *
 * This component:
 * - Renders comment pins at their resolved viewport positions
 * - Manages hover/click interactions
 * - Shows the CommentPopover on interaction
 *
 * @example
 * ```tsx
 * <CommentOverlay
 *   canvasNodeId={canvas.id}
 *   canvasSchema="xnet://xnet.fyi/Canvas"
 *   transform={{ panX: 0, panY: 0, zoom: 1 }}
 *   objects={objectsMap}
 * />
 * ```
 */
import type { CommentThread } from '@xnetjs/react'
import { CommentPopover, type CommentThreadData } from '@xnetjs/ui'
import React, { useState, useCallback, useRef } from 'react'
import {
  useCanvasComments,
  type CanvasTransform,
  type CanvasObject
} from '../hooks/useCanvasComments'
import { CommentPin } from './CommentPin'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CommentOverlayProps {
  /** The canvas Node ID */
  canvasNodeId: string
  /** Schema IRI of the canvas */
  canvasSchema?: string
  /** Current viewport transform */
  transform: CanvasTransform
  /** Map of all canvas objects */
  objects: Map<string, CanvasObject>
  /** Whether comment mode is active (for creating new comments) */
  commentModeActive?: boolean
  /** Callback when a new comment should be created */
  onCreateComment?: (canvasX: number, canvasY: number, objectId?: string) => void
}

interface PopoverState {
  visible: boolean
  mode: 'preview' | 'full'
  thread: CommentThread | null
  anchor: { x: number; y: number } | null
}

const INITIAL_POPOVER_STATE: PopoverState = {
  visible: false,
  mode: 'preview',
  thread: null,
  anchor: null
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CommentOverlay({
  canvasNodeId,
  canvasSchema,
  transform,
  objects
}: CommentOverlayProps) {
  const { activePins, replyTo, resolveThread, reopenThread, deleteComment, editComment } =
    useCanvasComments({
      canvasNodeId,
      canvasSchema,
      transform,
      objects
    })

  // Popover state
  const [popoverState, setPopoverState] = useState<PopoverState>(INITIAL_POPOVER_STATE)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // ─── Popover Handlers ─────────────────────────────────────────────────────────

  const showPreview = useCallback((thread: CommentThread, viewportX: number, viewportY: number) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setPopoverState((prev) => {
        // Don't downgrade from full to preview
        if (prev.visible && prev.mode === 'full' && prev.thread?.root.id === thread.root.id) {
          return prev
        }
        return {
          visible: true,
          mode: 'preview',
          thread,
          anchor: { x: viewportX, y: viewportY }
        }
      })
    }, 300)
  }, [])

  const showFull = useCallback((thread: CommentThread, viewportX: number, viewportY: number) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setPopoverState({
      visible: true,
      mode: 'full',
      thread,
      anchor: { x: viewportX + 20, y: viewportY }
    })
  }, [])

  const cancelPreview = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setPopoverState((prev) => (prev.mode === 'preview' ? INITIAL_POPOVER_STATE : prev))
  }, [])

  const dismiss = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setPopoverState(INITIAL_POPOVER_STATE)
  }, [])

  const upgradeToFull = useCallback(() => {
    setPopoverState((prev) => ({ ...prev, mode: 'full' }))
  }, [])

  // ─── Comment Actions ──────────────────────────────────────────────────────────

  const handleReply = useCallback(
    async (content: string) => {
      if (!popoverState.thread) return
      await replyTo(popoverState.thread.root.id, content)
    },
    [popoverState.thread, replyTo]
  )

  const handleResolve = useCallback(async () => {
    if (!popoverState.thread) return
    await resolveThread(popoverState.thread.root.id)
  }, [popoverState.thread, resolveThread])

  const handleReopen = useCallback(async () => {
    if (!popoverState.thread) return
    await reopenThread(popoverState.thread.root.id)
  }, [popoverState.thread, reopenThread])

  const handleDelete = useCallback(
    async (commentId: string) => {
      await deleteComment(commentId)
    },
    [deleteComment]
  )

  const handleEdit = useCallback(
    async (commentId: string, newContent: string) => {
      await editComment(commentId, newContent)
    },
    [editComment]
  )

  // Convert thread to CommentThreadData format for popover
  const threadData: CommentThreadData | null = popoverState.thread
    ? {
        root: {
          id: popoverState.thread.root.id,
          author: popoverState.thread.root.properties.createdBy,
          content: popoverState.thread.root.properties.content,
          createdAt: popoverState.thread.root.createdAt,
          edited: popoverState.thread.root.properties.edited,
          editedAt: popoverState.thread.root.properties.editedAt
        },
        replies: popoverState.thread.replies.map((r) => ({
          id: r.id,
          author: r.properties.createdBy,
          content: r.properties.content,
          createdAt: r.createdAt,
          edited: r.properties.edited,
          editedAt: r.properties.editedAt,
          replyToUser: r.properties.replyToUser,
          replyToCommentId: r.properties.replyToCommentId
        })),
        resolved: popoverState.thread.root.properties.resolved
      }
    : null

  return (
    <div
      className="comment-overlay absolute inset-0 pointer-events-none z-50"
      aria-label="Comment pins"
    >
      {/* Render all active pins */}
      {activePins.map(({ thread, viewportX, viewportY }) => (
        <div key={thread.root.id} style={{ pointerEvents: 'auto' }}>
          <CommentPin
            thread={thread}
            viewportX={viewportX}
            viewportY={viewportY}
            isHovered={
              popoverState.thread?.root.id === thread.root.id && popoverState.mode === 'preview'
            }
            isSelected={
              popoverState.thread?.root.id === thread.root.id && popoverState.mode === 'full'
            }
            onMouseEnter={() => showPreview(thread, viewportX, viewportY)}
            onMouseLeave={cancelPreview}
            onClick={() => showFull(thread, viewportX, viewportY)}
          />
        </div>
      ))}

      {/* Comment Popover */}
      {threadData && popoverState.anchor && (
        <div style={{ pointerEvents: 'auto' }}>
          <CommentPopover
            thread={threadData}
            anchor={popoverState.anchor}
            mode={popoverState.mode}
            open={popoverState.visible}
            side="right"
            onReply={handleReply}
            onResolve={handleResolve}
            onReopen={handleReopen}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onDismiss={dismiss}
            onUpgradeToFull={upgradeToFull}
          />
        </div>
      )}
    </div>
  )
}
