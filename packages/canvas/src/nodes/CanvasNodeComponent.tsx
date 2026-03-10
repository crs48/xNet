/**
 * Canvas Node Component
 *
 * Renders individual nodes on the canvas with selection, resize handles, etc.
 * Supports Level of Detail (LOD) rendering for performance at different zoom levels.
 */

import type { CanvasNode, EdgeAnchor, ResizeHandle, Point } from '../types'
import React, { useCallback, useRef, useEffect, memo } from 'react'
import { getCanvasResolvedNodeKind } from '../scene/node-kind'
import { useCanvasThemeTokens } from '../theme/canvas-theme'

/**
 * Level of Detail for node rendering
 * - placeholder: Just a colored rectangle (zoom < 0.1)
 * - minimal: Title only (zoom 0.1-0.3)
 * - compact: Title + icon (zoom 0.3-0.6)
 * - full: Complete interactive node (zoom > 0.6)
 */
export type LODLevel = 'placeholder' | 'minimal' | 'compact' | 'full'

/**
 * Calculate LOD level based on zoom
 */
export function calculateLOD(zoom: number): LODLevel {
  if (zoom < 0.1) return 'placeholder'
  if (zoom < 0.3) return 'minimal'
  if (zoom < 0.6) return 'compact'
  return 'full'
}

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
  focused?: boolean
  connectionTargeted?: boolean
  /** Level of detail for rendering (defaults to 'full') */
  lod?: LODLevel
  /** Remote users who have this node selected */
  remoteUsers?: NodeRemoteUser[]
  onSelect: (id: string, additive: boolean) => void
  onDragStart: (id: string, point: Point) => void
  onDrag: (id: string, delta: Point) => void
  onDragEnd: (id: string) => void
  onResizeStart?: (id: string, handle: ResizeHandle, point: Point) => void
  onResize?: (id: string, handle: ResizeHandle, delta: Point) => void
  onResizeEnd?: (id: string) => void
  onConnectStart?: (id: string, point: Point, placement: EdgeAnchor) => void
  onConnectDrag?: (id: string, point: Point) => void
  onConnectEnd?: (id: string, point: Point) => void
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
function getHandleStyle(
  handle: ResizeHandle,
  colors: {
    background: string
    border: string
    shadow: string
  }
): React.CSSProperties {
  const size = 8
  const offset = -size / 2

  const base: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    backgroundColor: colors.background,
    border: `1px solid ${colors.border}`,
    borderRadius: 2,
    cursor: getHandleCursor(handle),
    boxShadow: colors.shadow
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
 * Get a color for a node based on its type (for placeholder LOD)
 */
function getNodeColor(node: CanvasNode): string {
  const colors: Record<string, string> = {
    page: '#e3f2fd',
    database: '#e8f5e9',
    'external-reference': '#fce7f3',
    media: '#ede9fe',
    note: '#fff7ed',
    frame: '#ecfdf5',
    group: '#f5f5f5',
    shape: '#fff3e0',
    default: '#f5f5f5'
  }
  return colors[getCanvasResolvedNodeKind(node)] ?? colors.default
}

/**
 * Get node title for display
 */
function getNodeTitle(node: CanvasNode): string {
  return node.alias ?? (node.properties.title as string) ?? node.type ?? 'Untitled'
}

function getNodeTypeLabel(node: CanvasNode): string {
  switch (getCanvasResolvedNodeKind(node)) {
    case 'page':
      return 'Page'
    case 'database':
      return 'Database'
    case 'note':
      return 'Note'
    case 'external-reference':
      return 'Link preview'
    case 'media':
      return 'Media asset'
    case 'frame':
      return 'Frame'
    case 'group':
      return 'Group'
    case 'shape':
      return 'Shape'
    default:
      return 'Canvas object'
  }
}

function getNodeAccessibleLabel(node: CanvasNode): string {
  const segments = [`${getNodeTypeLabel(node)}: ${getNodeTitle(node)}`]

  if (node.locked) {
    segments.push('Locked')
  }

  return segments.join('. ')
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.closest('[data-canvas-resize-handle]')) {
    return true
  }

  if (target.closest('[data-canvas-interactive="true"]')) {
    return true
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  )
}

function focusCanvasSurface(nodeElement: HTMLDivElement | null): void {
  nodeElement?.closest<HTMLElement>('[data-canvas-surface="true"]')?.focus()
}

/**
 * Node icon based on type (for compact LOD)
 */
function NodeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    page: '📄',
    database: '🗃️',
    'external-reference': '🔗',
    media: '🖼️',
    note: '📝',
    frame: '🗂️',
    group: '🧩',
    shape: '⬡',
    default: '📌'
  }
  return <span style={{ fontSize: 14 }}>{icons[type] ?? icons.default}</span>
}

/**
 * Default node content based on type
 */
function DefaultNodeContent({ node }: { node: CanvasNode }) {
  const title = (node.properties.title as string) ?? node.type
  const sourceId = node.sourceNodeId ?? node.linkedNodeId

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
      {sourceId && (
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          Source: {sourceId.slice(0, 8)}...
        </div>
      )}
    </div>
  )
}

/**
 * Canvas Node Component
 *
 * Renders nodes with LOD (Level of Detail) support for performance optimization.
 * At low zoom levels, simplified representations are used to reduce DOM complexity.
 */
export const CanvasNodeComponent = memo(function CanvasNodeComponent({
  node,
  selected,
  focused = false,
  connectionTargeted = false,
  lod = 'full',
  remoteUsers,
  onSelect,
  onDragStart,
  onDrag,
  onDragEnd,
  onResizeStart,
  onResize,
  onResizeEnd,
  onConnectStart,
  onConnectDrag,
  onConnectEnd,
  onDoubleClick,
  children
}: CanvasNodeProps) {
  const nodeRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStart = useRef<Point>({ x: 0, y: 0 })
  const mountedRef = useRef(true)
  const theme = useCanvasThemeTokens()

  // Track mounted state for cleanup of window listeners
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const { position } = node

  // Determine border color based on presence
  const hasRemotePresence = remoteUsers && remoteUsers.length > 0
  const presenceColor = hasRemotePresence ? remoteUsers[0].color : undefined
  const resolvedKind = getCanvasResolvedNodeKind(node)
  const isPrimitiveShell =
    resolvedKind === 'shape' || resolvedKind === 'group' || resolvedKind === 'frame'
  const defaultBorder = `1px solid ${theme.panelBorder}`
  const selectionBorder = '2px solid #3b82f6'
  const connectionTargetBorder = '2px solid #60a5fa'
  const remoteBorder = hasRemotePresence ? `2px solid ${presenceColor}` : defaultBorder
  const neutralBorder = isPrimitiveShell ? '1px solid transparent' : defaultBorder
  const activeBorder = selected ? selectionBorder : remoteBorder
  const inactiveBorder = hasRemotePresence ? remoteBorder : neutralBorder
  const panelShadow = theme.panelShadow
  const focusRingShadow =
    theme.mode === 'dark'
      ? '0 0 0 3px rgba(96, 165, 250, 0.42)'
      : '0 0 0 3px rgba(59, 130, 246, 0.24)'
  const resizeHandleColors = {
    background: theme.panelBackground,
    border: '#3b82f6',
    shadow:
      theme.mode === 'dark'
        ? '0 0 0 1px rgba(10, 10, 10, 0.75)'
        : '0 1px 2px rgba(15, 23, 42, 0.18)'
  }
  const connectHandleColors = {
    background: theme.mode === 'dark' ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)',
    border: theme.mode === 'dark' ? 'rgba(96, 165, 250, 0.8)' : 'rgba(59, 130, 246, 0.78)',
    color: theme.mode === 'dark' ? 'rgba(191, 219, 254, 0.98)' : 'rgba(29, 78, 216, 0.92)'
  }

  // Handle click for selection (used by all LOD levels)
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      focusCanvasSurface(nodeRef.current)
      onSelect(node.id, e.shiftKey || e.metaKey)
    },
    [node.id, onSelect]
  )

  // Handle mouse down for drag (full LOD only, but must be defined before conditionals)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()

      // Select node
      onSelect(node.id, e.shiftKey || e.metaKey)

      if (isInteractiveTarget(e.target)) {
        return
      }

      focusCanvasSurface(nodeRef.current)

      if (node.locked) {
        return
      }

      // Start drag tracking
      isDragging.current = true
      dragStart.current = { x: e.clientX, y: e.clientY }
      onDragStart(node.id, { x: e.clientX, y: e.clientY })
      const ownerDocument = nodeRef.current?.ownerDocument ?? document

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
        ownerDocument.removeEventListener('mousemove', handleMouseMove)
        ownerDocument.removeEventListener('mouseup', handleMouseUp)
        // Only call callback if still mounted
        if (mountedRef.current) {
          onDragEnd(node.id)
        }
      }

      ownerDocument.addEventListener('mousemove', handleMouseMove)
      ownerDocument.addEventListener('mouseup', handleMouseUp)
    },
    [node.id, node.locked, onSelect, onDragStart, onDrag, onDragEnd]
  )

  // Handle resize
  const handleResizePointerDown = useCallback(
    (handle: ResizeHandle, e: React.PointerEvent<HTMLDivElement>) => {
      if (!onResizeStart || !onResize || !onResizeEnd) return
      e.stopPropagation()
      e.preventDefault()

      const handleElement = e.currentTarget
      const start = { x: e.clientX, y: e.clientY }
      onResizeStart(node.id, handle, start)
      handleElement.setPointerCapture?.(e.pointerId)

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!mountedRef.current) return
        const delta = {
          x: moveEvent.clientX - start.x,
          y: moveEvent.clientY - start.y
        }
        onResize(node.id, handle, delta)
      }

      const handlePointerEnd = () => {
        handleElement.releasePointerCapture?.(e.pointerId)
        handleElement.removeEventListener('pointermove', handlePointerMove)
        handleElement.removeEventListener('pointerup', handlePointerEnd)
        handleElement.removeEventListener('pointercancel', handlePointerEnd)
        // Only call callback if still mounted
        if (mountedRef.current) {
          onResizeEnd(node.id)
        }
      }

      handleElement.addEventListener('pointermove', handlePointerMove)
      handleElement.addEventListener('pointerup', handlePointerEnd)
      handleElement.addEventListener('pointercancel', handlePointerEnd)
    },
    [node.id, onResizeStart, onResize, onResizeEnd]
  )

  const handleConnectMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onConnectStart || !onConnectDrag || !onConnectEnd || node.locked) {
        return
      }

      e.stopPropagation()
      e.preventDefault()

      focusCanvasSurface(nodeRef.current)
      onSelect(node.id, false)

      const handleElement = e.currentTarget
      const startPoint = { x: e.clientX, y: e.clientY }
      onConnectStart(node.id, startPoint, 'right')
      const ownerDocument = handleElement.ownerDocument ?? document

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!mountedRef.current) {
          return
        }

        onConnectDrag(node.id, {
          x: moveEvent.clientX,
          y: moveEvent.clientY
        })
      }

      const handleMouseUp = (endEvent: MouseEvent) => {
        ownerDocument.removeEventListener('mousemove', handleMouseMove)
        ownerDocument.removeEventListener('mouseup', handleMouseUp)

        if (mountedRef.current) {
          onConnectEnd(node.id, {
            x: endEvent.clientX,
            y: endEvent.clientY
          })
        }
      }

      ownerDocument.addEventListener('mousemove', handleMouseMove)
      ownerDocument.addEventListener('mouseup', handleMouseUp)
    },
    [node.id, node.locked, onConnectDrag, onConnectEnd, onConnectStart, onSelect]
  )

  // Handle double click
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()

      if (isInteractiveTarget(e.target)) {
        return
      }

      onDoubleClick?.(node.id)
    },
    [node.id, onDoubleClick]
  )

  // ─── Placeholder LOD: Just a colored rectangle ─────────────────────────
  if (lod === 'placeholder') {
    return (
      <div
        className="canvas-node canvas-node--placeholder"
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          width: position.width,
          height: position.height,
          backgroundColor: getNodeColor(node),
          borderRadius: 4,
          pointerEvents: 'auto',
          cursor: 'pointer',
          border: selected ? selectionBorder : hasRemotePresence ? remoteBorder : defaultBorder,
          boxShadow: selected
            ? '0 0 0 2px rgba(59,130,246,0.2)'
            : focused
              ? focusRingShadow
              : undefined
        }}
        onClick={handleClick}
        data-node-id={node.id}
        data-selected={selected ? 'true' : 'false'}
        data-focused={focused ? 'true' : 'false'}
        data-node-locked={node.locked ? 'true' : 'false'}
        data-lod="placeholder"
        data-canvas-node-label={getNodeAccessibleLabel(node)}
      />
    )
  }

  // ─── Minimal LOD: Title only ───────────────────────────────────────────
  if (lod === 'minimal') {
    return (
      <div
        className="canvas-node canvas-node--minimal"
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          width: position.width,
          height: position.height,
          backgroundColor: theme.panelBackground,
          color: theme.panelText,
          border: selected ? selectionBorder : hasRemotePresence ? remoteBorder : defaultBorder,
          borderRadius: 4,
          padding: 4,
          overflow: 'hidden',
          pointerEvents: 'auto',
          cursor: 'pointer',
          boxShadow: selected
            ? '0 0 0 2px rgba(59,130,246,0.2)'
            : focused
              ? `${focusRingShadow}, ${panelShadow}`
              : panelShadow
        }}
        onClick={handleClick}
        data-node-id={node.id}
        data-selected={selected ? 'true' : 'false'}
        data-focused={focused ? 'true' : 'false'}
        data-node-locked={node.locked ? 'true' : 'false'}
        data-lod="minimal"
        data-canvas-node-label={getNodeAccessibleLabel(node)}
      >
        <span
          style={{
            fontSize: 11,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block'
          }}
        >
          {getNodeTitle(node)}
        </span>
      </div>
    )
  }

  // ─── Compact LOD: Title + icon ─────────────────────────────────────────
  if (lod === 'compact') {
    return (
      <div
        className="canvas-node canvas-node--compact"
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          width: position.width,
          height: position.height,
          backgroundColor: theme.panelBackground,
          color: theme.panelText,
          border: selected ? selectionBorder : hasRemotePresence ? remoteBorder : defaultBorder,
          borderRadius: 6,
          padding: 8,
          overflow: 'hidden',
          pointerEvents: 'auto',
          cursor: 'pointer',
          boxShadow: selected
            ? '0 0 0 2px rgba(59,130,246,0.2)'
            : focused
              ? `${focusRingShadow}, ${panelShadow}`
              : panelShadow,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
        onClick={handleClick}
        data-node-id={node.id}
        data-selected={selected ? 'true' : 'false'}
        data-focused={focused ? 'true' : 'false'}
        data-node-locked={node.locked ? 'true' : 'false'}
        data-lod="compact"
        data-canvas-node-label={getNodeAccessibleLabel(node)}
      >
        <NodeIcon type={resolvedKind} />
        <span
          style={{
            fontWeight: 500,
            fontSize: 12,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {getNodeTitle(node)}
        </span>
      </div>
    )
  }

  // ─── Full LOD: Complete interactive node ───────────────────────────────
  // Node styles
  const nodeStyle: React.CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    width: position.width,
    height: position.height,
    transform: position.rotation ? `rotate(${position.rotation}deg)` : undefined,
    zIndex: position.zIndex ?? 0,
    backgroundColor: isPrimitiveShell ? 'transparent' : theme.panelBackground,
    color: theme.panelText,
    border: selected ? activeBorder : connectionTargeted ? connectionTargetBorder : inactiveBorder,
    borderRadius: 8,
    boxShadow: selected
      ? '0 0 0 2px rgba(59,130,246,0.2)'
      : connectionTargeted
        ? theme.mode === 'dark'
          ? '0 0 0 3px rgba(96,165,250,0.24)'
          : '0 0 0 3px rgba(59,130,246,0.18)'
        : focused
          ? `${focusRingShadow}, ${hasRemotePresence ? `0 0 0 2px ${presenceColor}33` : isPrimitiveShell ? 'none' : panelShadow}`
          : hasRemotePresence
            ? `0 0 0 2px ${presenceColor}33`
            : isPrimitiveShell
              ? 'none'
              : panelShadow,
    cursor: node.locked ? 'default' : 'move',
    userSelect: 'none',
    overflow: 'visible',
    opacity: node.locked ? 0.92 : 1
  }

  return (
    <div
      ref={nodeRef}
      className="canvas-node canvas-node--full"
      style={nodeStyle}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      data-node-id={node.id}
      data-node-type={node.type}
      data-selected={selected ? 'true' : 'false'}
      data-focused={focused ? 'true' : 'false'}
      data-canvas-connect-target={connectionTargeted ? 'true' : 'false'}
      data-node-locked={node.locked ? 'true' : 'false'}
      data-lod="full"
      data-canvas-node-label={getNodeAccessibleLabel(node)}
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
              data-canvas-node-remote-user="true"
              data-canvas-node-remote-client-id={user.clientId}
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                backgroundColor: user.color,
                border:
                  theme.mode === 'dark'
                    ? '2px solid rgba(10, 10, 10, 0.92)'
                    : '2px solid rgba(255, 255, 255, 0.96)',
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
            style={getHandleStyle(handle, resizeHandleColors)}
            onPointerDown={(e) => handleResizePointerDown(handle, e)}
            role="button"
            aria-label={`Resize ${getNodeTitle(node)} from ${handle}`}
            title={`Resize ${getNodeTitle(node)} from ${handle}`}
            data-canvas-interactive="true"
            data-handle={handle}
            data-canvas-resize-handle={handle}
          />
        ))}

      {selected && !node.locked && onConnectStart && onConnectDrag && onConnectEnd ? (
        <div
          role="button"
          aria-label={`Connect ${getNodeTitle(node)}`}
          title={`Drag to connect ${getNodeTitle(node)}`}
          style={{
            position: 'absolute',
            top: '50%',
            right: -10,
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: `1px solid ${connectHandleColors.border}`,
            background: connectHandleColors.background,
            color: connectHandleColors.color,
            boxShadow:
              theme.mode === 'dark'
                ? '0 6px 18px rgba(2, 6, 23, 0.42)'
                : '0 8px 18px rgba(15, 23, 42, 0.18)',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'crosshair'
          }}
          onMouseDown={handleConnectMouseDown}
          data-canvas-interactive="true"
          data-canvas-connect-handle="true"
          data-canvas-connect-placement="right"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M2.5 5h5M6 3.5L7.5 5 6 6.5"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ) : null}
    </div>
  )
})

export default CanvasNodeComponent
