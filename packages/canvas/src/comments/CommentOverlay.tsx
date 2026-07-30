/**
 * CommentOverlay - Renders all comment pins on the canvas.
 *
 * This component:
 * - Renders comment pins at their resolved viewport positions
 * - Manages hover/click interactions
 * - Shows the CommentIsland on interaction, anchored to a *virtual* anchor
 *   that re-projects the pin through the live viewport transform, so the
 *   island tracks the pin under pan and zoom instead of stranding at the
 *   coordinates captured when it was clicked (0375).
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
import {
  CommentIsland,
  type CommentThreadData,
  type TaskPersonOption,
  type VirtualAnchor
} from '@xnetjs/ui'
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
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
  /**
   * People for @mention typeahead, and the source of author display names.
   * Without it, canvas comments render raw DIDs while page comments render
   * profile names (0375).
   */
  people?: TaskPersonOption[]
}

interface PopoverState {
  visible: boolean
  mode: 'preview' | 'full'
  thread: CommentThread | null
  /** Viewport point captured on open, in *world* space so it survives pan/zoom. */
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
  objects,
  people = []
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
  const overlayRef = useRef<HTMLDivElement | null>(null)

  // Clear any pending hover timer on unmount.
  useEffect(
    () => () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    },
    []
  )

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

  // Author DIDs resolve to profile names through the same people list that
  // drives @mention typeahead; without it the island shows raw DIDs (0375).
  const resolveAuthorName = useCallback(
    (did: string) => people.find((person) => person.did === did)?.name,
    [people]
  )

  // Convert thread to CommentThreadData format for the island
  const threadData: CommentThreadData | null = popoverState.thread
    ? {
        root: {
          id: popoverState.thread.root.id,
          author: popoverState.thread.root.properties.createdBy,
          authorDisplayName: resolveAuthorName(popoverState.thread.root.properties.createdBy),
          content: popoverState.thread.root.properties.content,
          createdAt: popoverState.thread.root.createdAt,
          edited: popoverState.thread.root.properties.edited,
          editedAt: popoverState.thread.root.properties.editedAt
        },
        replies: popoverState.thread.replies.map((r) => ({
          id: r.id,
          author: r.properties.createdBy,
          authorDisplayName: resolveAuthorName(r.properties.createdBy),
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

  // The live pin for the open thread. activePins is recomputed from the
  // viewport transform every render, so reading position from it — rather than
  // from coordinates captured at click time — is what makes the island follow
  // the pin under pan and zoom.
  const openPin = popoverState.thread
    ? activePins.find((pin) => pin.thread.root.id === popoverState.thread?.root.id)
    : undefined

  // Pin coordinates are relative to the overlay; the island is position:fixed,
  // so add the overlay's own viewport offset.
  const pinAnchor = useMemo<VirtualAnchor | null>(() => {
    if (!openPin) return null
    const { viewportX, viewportY } = openPin
    return {
      getBoundingClientRect: () => {
        const box = overlayRef.current?.getBoundingClientRect()
        const originX = (box?.left ?? 0) + viewportX
        const originY = (box?.top ?? 0) + viewportY
        return new DOMRect(originX, originY, 0, 0)
      }
    }
  }, [openPin?.viewportX, openPin?.viewportY, openPin])
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
      ref={overlayRef}
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

      {/* Comment island — portals to body, so it is not clipped by the
          overlay's pointer-events-none stacking context. */}
      {threadData && pinAnchor && (
        <CommentIsland
          thread={threadData}
          anchor={pinAnchor}
          mode={popoverState.mode}
          open={popoverState.visible}
          side="right"
          people={people}
          onReply={handleReply}
          onResolve={handleResolve}
          onReopen={handleReopen}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onDismiss={dismiss}
          onUpgradeToFull={upgradeToFull}
        />
      )}
    </div>
  )
}
