/**
 * useCanvasComments - Canvas-specific comment hook.
 *
 * Extends the universal useComments hook with canvas-specific helpers:
 * - Resolve comment pins to viewport coordinates
 * - Position pins (fixed coordinates)
 * - Object-attached pins (follow object movement)
 * - Orphaned pin detection (object deleted)
 *
 * Following the Universal Social Primitives pattern from planStep03_6Comments.
 */
import { useMemo, useCallback } from 'react'
import { useComments, type CommentThread } from '@xnet/react'
import {
  encodeAnchor,
  decodeAnchor,
  type CanvasPositionAnchor,
  type CanvasObjectAnchor
} from '@xnet/data'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CanvasTransform {
  /** Horizontal pan offset (canvas units) */
  panX: number
  /** Vertical pan offset (canvas units) */
  panY: number
  /** Zoom level (1 = 100%) */
  zoom: number
}

export interface CanvasObject {
  /** Unique object ID */
  id: string
  /** X position (canvas units) */
  x: number
  /** Y position (canvas units) */
  y: number
  /** Width (canvas units) */
  width: number
  /** Height (canvas units) */
  height: number
}

export interface UseCanvasCommentsOptions {
  /** The canvas Node ID (target for all comments) */
  canvasNodeId: string
  /** Schema IRI of the canvas (optimization hint) */
  canvasSchema?: string
  /** Current viewport transform */
  transform: CanvasTransform
  /** Map of all canvas objects (for resolving object-attached pins) */
  objects: Map<string, CanvasObject>
}

/** A resolved comment pin with viewport coordinates */
export interface ResolvedPin {
  /** The comment thread */
  thread: CommentThread
  /** X coordinate in viewport space (pixels) */
  viewportX: number
  /** Y coordinate in viewport space (pixels) */
  viewportY: number
  /** Whether the anchor is orphaned (object deleted) */
  orphaned: boolean
  /** Canvas coordinates (for position pins) or null for orphaned */
  canvasCoords: { x: number; y: number } | null
}

export interface UseCanvasCommentsResult {
  /** All comment threads for this canvas */
  threads: CommentThread[]
  /** Total comment count */
  count: number
  /** Count of unresolved threads */
  unresolvedCount: number
  /** Whether loading */
  loading: boolean
  /** Any error */
  error: Error | null

  // ─── Resolved Pins ──────────────────────────────────────────────────────────
  /** All canvas comment pins with resolved viewport positions */
  resolvedPins: ResolvedPin[]
  /** Active (non-orphaned) pins */
  activePins: ResolvedPin[]
  /** Orphaned pins (object was deleted) */
  orphanedPins: ResolvedPin[]

  // ─── Create Comment Actions ─────────────────────────────────────────────────
  /** Create a comment at a canvas position (position pin) */
  commentAtPosition: (canvasX: number, canvasY: number, content: string) => Promise<string | null>
  /** Create a comment attached to an object */
  commentOnObject: (
    objectId: string,
    content: string,
    offsetX?: number,
    offsetY?: number
  ) => Promise<string | null>

  // ─── Thread Actions (from base hook) ────────────────────────────────────────
  /** Reply to a thread */
  replyTo: (rootCommentId: string, content: string) => Promise<string | null>
  /** Resolve a thread */
  resolveThread: (rootCommentId: string) => Promise<void>
  /** Reopen a thread */
  reopenThread: (rootCommentId: string) => Promise<void>
  /** Delete a comment */
  deleteComment: (commentId: string) => Promise<void>
  /** Delete an entire thread */
  deleteThread: (rootCommentId: string) => Promise<void>
  /** Edit a comment */
  editComment: (commentId: string, content: string) => Promise<void>
  /** Reload comments */
  reload: () => Promise<void>
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Canvas-specific comment hook that extends useComments.
 *
 * @example
 * ```tsx
 * const {
 *   activePins,
 *   commentAtPosition,
 *   commentOnObject
 * } = useCanvasComments({
 *   canvasNodeId: canvas.id,
 *   canvasSchema: 'xnet://xnet.fyi/Canvas',
 *   transform: { panX: 0, panY: 0, zoom: 1 },
 *   objects: objectsMap
 * })
 *
 * // Render pins
 * activePins.map(pin => (
 *   <CommentPin key={pin.thread.root.id} x={pin.viewportX} y={pin.viewportY} />
 * ))
 *
 * // Create a position pin
 * await commentAtPosition(100, 200, 'Review this area')
 *
 * // Attach comment to an object
 * await commentOnObject('shape-123', 'Nice shape!')
 * ```
 */
export function useCanvasComments({
  canvasNodeId,
  canvasSchema,
  transform,
  objects
}: UseCanvasCommentsOptions): UseCanvasCommentsResult {
  // Use the universal hook (no anchorType filter - we want all canvas comments)
  const {
    threads,
    count,
    unresolvedCount,
    loading,
    error,
    addComment,
    replyTo,
    resolveThread,
    reopenThread,
    deleteComment,
    deleteThread,
    editComment,
    reload
  } = useComments({ nodeId: canvasNodeId })

  // ─── Resolve Pin Positions ──────────────────────────────────────────────────

  /**
   * Resolve all canvas comment threads to viewport coordinates.
   * Position pins use their fixed coordinates.
   * Object-attached pins follow the object's position.
   */
  const resolvedPins = useMemo((): ResolvedPin[] => {
    return threads
      .filter((t) => {
        const anchorType = t.root.properties.anchorType
        return anchorType === 'canvas-position' || anchorType === 'canvas-object'
      })
      .map((thread): ResolvedPin | null => {
        const anchorType = thread.root.properties.anchorType as 'canvas-position' | 'canvas-object'

        try {
          if (anchorType === 'canvas-position') {
            const anchor = decodeAnchor<CanvasPositionAnchor>(thread.root.properties.anchorData)
            const { x, y } = anchor

            // Transform canvas coords to viewport coords
            const viewportX = (x - transform.panX) * transform.zoom
            const viewportY = (y - transform.panY) * transform.zoom

            return {
              thread,
              viewportX,
              viewportY,
              orphaned: false,
              canvasCoords: { x, y }
            }
          }

          if (anchorType === 'canvas-object') {
            const anchor = decodeAnchor<CanvasObjectAnchor>(thread.root.properties.anchorData)
            const { objectId, offsetX = 0, offsetY = 0 } = anchor

            const obj = objects.get(objectId)
            if (!obj) {
              // Object was deleted - orphaned pin
              return {
                thread,
                viewportX: 0,
                viewportY: 0,
                orphaned: true,
                canvasCoords: null
              }
            }

            // Position pin at object's right edge with offset
            const x = obj.x + obj.width + offsetX
            const y = obj.y + offsetY

            // Transform to viewport coords
            const viewportX = (x - transform.panX) * transform.zoom
            const viewportY = (y - transform.panY) * transform.zoom

            return {
              thread,
              viewportX,
              viewportY,
              orphaned: false,
              canvasCoords: { x, y }
            }
          }

          return null
        } catch {
          // Invalid anchor data - treat as orphaned
          return {
            thread,
            viewportX: 0,
            viewportY: 0,
            orphaned: true,
            canvasCoords: null
          }
        }
      })
      .filter((p): p is ResolvedPin => p !== null)
  }, [threads, transform, objects])

  /** Non-orphaned pins only */
  const activePins = useMemo(() => {
    return resolvedPins.filter((p) => !p.orphaned)
  }, [resolvedPins])

  /** Orphaned pins (object deleted) */
  const orphanedPins = useMemo(() => {
    return resolvedPins.filter((p) => p.orphaned)
  }, [resolvedPins])

  // ─── Create Comment Actions ─────────────────────────────────────────────────

  /** Create a comment at a fixed canvas position (position pin) */
  const commentAtPosition = useCallback(
    async (canvasX: number, canvasY: number, content: string): Promise<string | null> => {
      const anchor: CanvasPositionAnchor = { x: canvasX, y: canvasY }
      return addComment({
        content,
        anchorType: 'canvas-position',
        anchorData: encodeAnchor(anchor),
        targetSchema: canvasSchema
      })
    },
    [addComment, canvasSchema]
  )

  /** Create a comment attached to an object */
  const commentOnObject = useCallback(
    async (
      objectId: string,
      content: string,
      offsetX?: number,
      offsetY?: number
    ): Promise<string | null> => {
      const anchor: CanvasObjectAnchor = { objectId, offsetX, offsetY }
      return addComment({
        content,
        anchorType: 'canvas-object',
        anchorData: encodeAnchor(anchor),
        targetSchema: canvasSchema
      })
    },
    [addComment, canvasSchema]
  )

  return {
    // From base hook
    threads,
    count,
    unresolvedCount,
    loading,
    error,
    replyTo,
    resolveThread,
    reopenThread,
    deleteComment,
    deleteThread,
    editComment,
    reload,

    // Canvas-specific
    resolvedPins,
    activePins,
    orphanedPins,
    commentAtPosition,
    commentOnObject
  }
}

// ─── Utility Functions ─────────────────────────────────────────────────────────

/**
 * Convert viewport coordinates to canvas coordinates.
 */
export function viewportToCanvas(
  viewportX: number,
  viewportY: number,
  transform: CanvasTransform
): { x: number; y: number } {
  return {
    x: viewportX / transform.zoom + transform.panX,
    y: viewportY / transform.zoom + transform.panY
  }
}

/**
 * Convert canvas coordinates to viewport coordinates.
 */
export function canvasToViewport(
  canvasX: number,
  canvasY: number,
  transform: CanvasTransform
): { x: number; y: number } {
  return {
    x: (canvasX - transform.panX) * transform.zoom,
    y: (canvasY - transform.panY) * transform.zoom
  }
}

/**
 * Find the topmost object at a given canvas point.
 * Returns null if no object at that point.
 */
export function findObjectAtPoint(
  canvasX: number,
  canvasY: number,
  objects: Map<string, CanvasObject>
): CanvasObject | null {
  // Iterate in reverse order to find topmost (assuming later = higher z-index)
  const entries = Array.from(objects.entries()).reverse()

  for (const [, obj] of entries) {
    if (
      canvasX >= obj.x &&
      canvasX <= obj.x + obj.width &&
      canvasY >= obj.y &&
      canvasY <= obj.y + obj.height
    ) {
      return obj
    }
  }

  return null
}

/**
 * Check if a canvas anchor is orphaned.
 * Object-attached anchors are orphaned if the object no longer exists.
 * Position anchors are never orphaned.
 */
export function isCanvasAnchorOrphaned(
  anchorType: 'canvas-position' | 'canvas-object',
  anchorData: string,
  existingObjectIds: Set<string>
): boolean {
  if (anchorType === 'canvas-position') {
    return false // Position pins are never orphaned
  }

  try {
    const anchor = decodeAnchor<CanvasObjectAnchor>(anchorData)
    return !existingObjectIds.has(anchor.objectId)
  } catch {
    // Invalid anchor data is considered orphaned
    return true
  }
}
