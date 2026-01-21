/**
 * Canvas Node Component
 *
 * Renders individual nodes on the canvas with selection, resize handles, etc.
 */

import React, { useCallback, useRef, memo } from 'react'
import type { CanvasNode, ResizeHandle, Point } from '../types'

export interface CanvasNodeProps {
  node: CanvasNode
  selected: boolean
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
        if (!isDragging.current) return
        const delta = {
          x: moveEvent.clientX - dragStart.current.x,
          y: moveEvent.clientY - dragStart.current.y
        }
        dragStart.current = { x: moveEvent.clientX, y: moveEvent.clientY }
        onDrag(node.id, delta)
      }

      const handleMouseUp = () => {
        isDragging.current = false
        onDragEnd(node.id)
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
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
        const delta = {
          x: moveEvent.clientX - start.x,
          y: moveEvent.clientY - start.y
        }
        onResize(node.id, handle, delta)
      }

      const handleMouseUp = () => {
        onResizeEnd(node.id)
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
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
    border: selected ? '2px solid #0066ff' : '1px solid #e0e0e0',
    borderRadius: 8,
    boxShadow: selected ? '0 0 0 2px rgba(0,102,255,0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
    cursor: 'move',
    userSelect: 'none',
    overflow: 'hidden'
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
      {children ?? <DefaultNodeContent node={node} />}

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
