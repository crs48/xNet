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
import React, { useState, useCallback, useMemo, useRef } from 'react'
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
  const {
    activePins,
    orphanedPins,
    replyTo,
    resolveThread,
    reopenThread,
    deleteComment,
    editComment
  } = useCanvasComments({
    canvasNodeId,
    canvasSchema,
    transform,
    objects
  })

  // Popover state
  const [popoverState, setPopoverState] = useState<PopoverState>(INITIAL_POPOVER_STATE)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const orphanTrayAnchorRef = useRef<HTMLButtonElement | null>(null)

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

  const openOrphanThread = useCallback((thread: CommentThread) => {
    const rect = orphanTrayAnchorRef.current?.getBoundingClientRect()
    setPopoverState({
      visible: true,
      mode: 'full',
      thread,
      anchor: rect ? { x: rect.left, y: rect.top - 8 } : { x: 32, y: 32 }
    })
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
  const orphanedThreadPreview = useMemo(() => {
    if (orphanedPins.length === 0) {
      return null
    }

    const [firstPin] = orphanedPins
    const rootContent = firstPin.thread.root.properties.content.trim()
    if (!rootContent) {
      return 'Open orphaned comment'
    }

    return rootContent.length > 42 ? `${rootContent.slice(0, 39)}...` : rootContent
  }, [orphanedPins])

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

      {orphanedPins.length > 0 ? (
        <div
          className="pointer-events-none absolute bottom-6 left-6 flex max-w-[min(26rem,calc(100%-3rem))] justify-start"
          data-canvas-comment-orphan-tray="true"
        >
          <button
            ref={orphanTrayAnchorRef}
            type="button"
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-background/92 px-3 py-2 text-left text-xs text-foreground shadow-lg shadow-black/10 backdrop-blur-xl transition-colors hover:bg-background"
            onClick={() => openOrphanThread(orphanedPins[0].thread)}
            data-canvas-comment-orphan="true"
            data-canvas-comment-orphan-count={String(orphanedPins.length)}
            aria-label={`Open ${orphanedPins.length} orphaned comment${orphanedPins.length === 1 ? '' : 's'}`}
          >
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              {orphanedPins.length}
            </span>
            <span className="truncate">
              {orphanedPins.length === 1
                ? orphanedThreadPreview
                : `${orphanedPins.length} orphaned comments`}
            </span>
          </button>
        </div>
      ) : null}

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
