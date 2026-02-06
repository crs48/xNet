/**
 * Canvas Node Component
 *
 * Renders individual nodes on the canvas with selection, resize handles, etc.
 */

import type { CanvasNode, ResizeHandle, Point } from '../types'
import React, { useCallback, useRef, useEffect, memo } from 'react'

/**
 * Remote user presence on a specific node
 */
export interface NodeRemoteUser {
  clientId: number
  did: string
  color: string
}

export interface CanvasNodeProps {
  node: CanvasNode
  selected: boolean
  /** Remote users who have this node selected */
  remoteUsers?: NodeRemoteUser[]
  onSelect: (id: string, additive: boolean) => void
  onDragStart: (id: string, point: Point) => void
  onDrag: (id: string, delta: Point) => void
  onDragEnd: (id: string) => void
  onResizeStart?: (id: string, handle: ResizeHandle, point: Point) => void
  onResize?: (id: string, handle: ResizeHandle, delta: Point) => void
  onResizeEnd?: (id: string) => void
  onDoubleClick?: (id: string) => void
  children?: React.ReactNode
}

/**
 * Resize handle positions
 */
const RESIZE_HANDLES: ResizeHandle[] = [
  'top-left',
  'top',
  'top-right',
  'right',
  'bottom-right',
  'bottom',
  'bottom-left',
  'left'
]

/**
 * Get cursor style for resize handle
 */
function getHandleCursor(handle: ResizeHandle): string {
  const cursors: Record<ResizeHandle, string> = {
    'top-left': 'nwse-resize',
    top: 'ns-resize',
    'top-right': 'nesw-resize',
    right: 'ew-resize',
    'bottom-right': 'nwse-resize',
    bottom: 'ns-resize',
    'bottom-left': 'nesw-resize',
    left: 'ew-resize'
  }
  return cursors[handle]
}

/**
 * Get handle position styles
 */
function getHandleStyle(handle: ResizeHandle): React.CSSProperties {
  const size = 8
  const offset = -size / 2

  const base: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    backgroundColor: '#fff',
    border: '1px solid #0066ff',
    borderRadius: 2,
    cursor: getHandleCursor(handle)
  }

  switch (handle) {
    case 'top-left':
      return { ...base, top: offset, left: offset }
    case 'top':
      return { ...base, top: offset, left: '50%', marginLeft: offset }
    case 'top-right':
      return { ...base, top: offset, right: offset }
    case 'right':
      return { ...base, top: '50%', marginTop: offset, right: offset }
    case 'bottom-right':
      return { ...base, bottom: offset, right: offset }
    case 'bottom':
      return { ...base, bottom: offset, left: '50%', marginLeft: offset }
    case 'bottom-left':
      return { ...base, bottom: offset, left: offset }
    case 'left':
      return { ...base, top: '50%', marginTop: offset, left: offset }
  }
}

/**
 * Default node content based on type
 */
function DefaultNodeContent({ node }: { node: CanvasNode }) {
  const title = (node.properties.title as string) ?? node.type

  return (
    <div
      style={{
        padding: 12,
        height: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          fontWeight: 500,
          fontSize: 14,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {title}
      </div>
      {node.linkedNodeId && (
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          Linked: {node.linkedNodeId.slice(0, 8)}...
        </div>
      )}
    </div>
  )
}

/**
 * Canvas Node Component
 */
export const CanvasNodeComponent = memo(function CanvasNodeComponent({
  node,
  selected,
  remoteUsers,
  onSelect,
  onDragStart,
  onDrag,
  onDragEnd,
  onResizeStart,
  onResize,
  onResizeEnd,
  onDoubleClick,
  children
}: CanvasNodeProps) {
  const nodeRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStart = useRef<Point>({ x: 0, y: 0 })
  const mountedRef = useRef(true)

  // Track mounted state for cleanup of window listeners
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const { position } = node

  // Handle mouse down for drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()

      // Select node
      onSelect(node.id, e.shiftKey || e.metaKey)

      // Start drag tracking
      isDragging.current = true
      dragStart.current = { x: e.clientX, y: e.clientY }
      onDragStart(node.id, { x: e.clientX, y: e.clientY })

      // Track mouse movement
      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current || !mountedRef.current) return
        const delta = {
          x: moveEvent.clientX - dragStart.current.x,
          y: moveEvent.clientY - dragStart.current.y
        }
        dragStart.current = { x: moveEvent.clientX, y: moveEvent.clientY }
        onDrag(node.id, delta)
      }

      const handleMouseUp = () => {
        isDragging.current = false
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        // Only call callback if still mounted
        if (mountedRef.current) {
          onDragEnd(node.id)
        }
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [node.id, onSelect, onDragStart, onDrag, onDragEnd]
  )

  // Handle resize
  const handleResizeMouseDown = useCallback(
    (handle: ResizeHandle, e: React.MouseEvent) => {
      if (!onResizeStart || !onResize || !onResizeEnd) return
      e.stopPropagation()
      e.preventDefault()

      const start = { x: e.clientX, y: e.clientY }
      onResizeStart(node.id, handle, start)

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!mountedRef.current) return
        const delta = {
          x: moveEvent.clientX - start.x,
          y: moveEvent.clientY - start.y
        }
        onResize(node.id, handle, delta)
      }

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        // Only call callback if still mounted
        if (mountedRef.current) {
          onResizeEnd(node.id)
        }
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [node.id, onResizeStart, onResize, onResizeEnd]
  )

  // Handle double click
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDoubleClick?.(node.id)
    },
    [node.id, onDoubleClick]
  )

  // Determine border color based on presence
  const hasRemotePresence = remoteUsers && remoteUsers.length > 0
  const presenceColor = hasRemotePresence ? remoteUsers[0].color : undefined

  // Node styles
  const nodeStyle: React.CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    width: position.width,
    height: position.height,
    transform: position.rotation ? `rotate(${position.rotation}deg)` : undefined,
    zIndex: position.zIndex ?? 0,
    backgroundColor: '#fff',
    border: selected
      ? '2px solid #0066ff'
      : hasRemotePresence
        ? `2px solid ${presenceColor}`
        : '1px solid #e0e0e0',
    borderRadius: 8,
    boxShadow: selected
      ? '0 0 0 2px rgba(0,102,255,0.2)'
      : hasRemotePresence
        ? `0 0 0 2px ${presenceColor}33`
        : '0 1px 3px rgba(0,0,0,0.1)',
    cursor: 'move',
    userSelect: 'none',
    overflow: 'visible'
  }

  return (
    <div
      ref={nodeRef}
      style={nodeStyle}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      data-node-id={node.id}
      data-node-type={node.type}
    >
      {/* Content wrapper (clips overflow) */}
      <div style={{ overflow: 'hidden', width: '100%', height: '100%', borderRadius: 6 }}>
        {children ?? <DefaultNodeContent node={node} />}
      </div>

      {/* Remote user presence indicators */}
      {hasRemotePresence && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            right: -4,
            display: 'flex',
            gap: 2
          }}
        >
          {remoteUsers.map((user) => (
            <div
              key={user.clientId}
              title={user.did.slice(0, 20) + '...'}
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                backgroundColor: user.color,
                border: '2px solid #fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 8,
                fontWeight: 700,
                color: '#fff'
              }}
            >
              {user.did.slice(8, 10).toUpperCase()}
            </div>
          ))}
        </div>
      )}

      {/* Resize handles (only when selected) */}
      {selected &&
        RESIZE_HANDLES.map((handle) => (
          <div
            key={handle}
            style={getHandleStyle(handle)}
            onMouseDown={(e) => handleResizeMouseDown(handle, e)}
            data-handle={handle}
          />
        ))}
    </div>
  )
})

export default CanvasNodeComponent
