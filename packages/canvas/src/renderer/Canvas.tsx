/**
 * Canvas Component
 *
 * Main infinite canvas component with pan, zoom, and node rendering.
 */

import React, {
  useRef,
  useCallback,
  useEffect,
  useState,
  useImperativeHandle,
  memo,
  forwardRef
} from 'react'
import type * as Y from 'yjs'
import type { CanvasConfig, CanvasNode, Point } from '../types'

/** Minimal Awareness interface (avoids y-protocols dependency) */
interface AwarenessLike {
  clientID: number
  getStates(): Map<number, Record<string, unknown>>
  setLocalStateField(field: string, value: unknown): void
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
}
import { useCanvas } from '../hooks/useCanvas'
import { CanvasNodeComponent } from '../nodes/CanvasNodeComponent'
import { CanvasEdgeComponent } from '../edges/CanvasEdgeComponent'
import { CommentOverlay } from '../comments/CommentOverlay'

/**
 * Remote user presence on the canvas
 */
export interface CanvasRemoteUser {
  clientId: number
  did: string
  color: string
  /** Node IDs this user has selected */
  selectedNodes?: string[]
}

/**
 * Imperative handle for Canvas component
 */
export interface CanvasHandle {
  /** Fit the viewport to show all content */
  fitToContent: (padding?: number) => void
  /** Reset viewport to origin at zoom 1 */
  resetView: () => void
}

export interface CanvasProps {
  /** Y.Doc containing the canvas data */
  doc: Y.Doc
  /** Canvas configuration */
  config?: CanvasConfig
  /** Initial viewport state */
  initialViewport?: { x?: number; y?: number; zoom?: number }
  /** Custom node renderer */
  renderNode?: (node: CanvasNode) => React.ReactNode
  /** Callback when node is double-clicked */
  onNodeDoubleClick?: (id: string) => void
  /** Callback when canvas background is clicked */
  onBackgroundClick?: () => void
  /** Yjs Awareness instance for presence (optional) */
  awareness?: AwarenessLike | null
  /** CSS class name */
  className?: string
  /** CSS styles */
  style?: React.CSSProperties
  /** Canvas Node ID for comments (enables comment overlay) */
  canvasNodeId?: string
  /** Schema IRI of the canvas (optimization for comments) */
  canvasSchema?: string
}

/**
 * Grid background component
 */
const GridBackground = memo(function GridBackground({
  gridSize,
  zoom
}: {
  gridSize: number
  zoom: number
}) {
  const scaledSize = gridSize * zoom
  const patternId = `canvas-grid-${gridSize}`

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none'
      }}
    >
      <defs>
        <pattern
          id={patternId}
          width={scaledSize}
          height={scaledSize}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={scaledSize / 2} cy={scaledSize / 2} r={1} fill="#e0e0e0" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
})

/**
 * Canvas Component
 */
export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  {
    doc,
    config = {},
    initialViewport,
    renderNode,
    onNodeDoubleClick,
    onBackgroundClick,
    awareness,
    className,
    style,
    canvasNodeId,
    canvasSchema
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const lastMousePos = useRef<Point>({ x: 0, y: 0 })

  // Use canvas hook
  const canvas = useCanvas({ doc, config, initialViewport })

  // Expose imperative methods via ref
  useImperativeHandle(
    ref,
    () => ({
      fitToContent: (padding?: number) => canvas.fitToContent(padding),
      resetView: () => canvas.resetView()
    }),
    [canvas]
  )
  const {
    nodes,
    edges,
    selectedNodeIds,
    selectedEdgeIds,
    viewport,
    selectNode,
    clearSelection,
    updateNodePosition,
    pan,
    zoomAt
  } = canvas

  // === Presence: track remote users' selected nodes ===
  const [nodePresence, setNodePresence] = useState<Map<string, CanvasRemoteUser[]>>(new Map())

  // Broadcast local selection to awareness
  useEffect(() => {
    if (!awareness) return
    awareness.setLocalStateField('canvasSelection', Array.from(selectedNodeIds))
  }, [awareness, selectedNodeIds])

  // Listen for remote awareness changes
  useEffect(() => {
    if (!awareness) return

    const updatePresence = () => {
      const states = awareness.getStates()
      const presenceMap = new Map<string, CanvasRemoteUser[]>()

      states.forEach((state: Record<string, unknown>, clientId: number) => {
        if (clientId === awareness.clientID) return // skip self
        const user = state.user as { did?: string; color?: string } | undefined
        if (!user?.did) return

        const selectedNodes = state.canvasSelection as string[] | undefined
        if (!selectedNodes || selectedNodes.length === 0) return

        const remoteUser: CanvasRemoteUser = {
          clientId,
          did: user.did,
          color: user.color || '#888',
          selectedNodes
        }

        for (const nodeId of selectedNodes) {
          const existing = presenceMap.get(nodeId) || []
          existing.push(remoteUser)
          presenceMap.set(nodeId, existing)
        }
      })

      setNodePresence(presenceMap)
    }

    updatePresence()
    awareness.on('change', updatePresence)
    return () => awareness.off('change', updatePresence)
  }, [awareness])

  // Update viewport size on resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateSize = () => {
      viewport.width = container.clientWidth
      viewport.height = container.clientHeight
    }

    updateSize()

    const observer = new ResizeObserver(updateSize)
    observer.observe(container)

    return () => observer.disconnect()
  }, [viewport])

  // Attach wheel handler with { passive: false } so preventDefault works
  // (React's onWheel registers as passive by default in modern browsers)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom: scale factor by deltaY magnitude for smooth control
        // Clamp delta to avoid extreme jumps from fast scrolling
        const delta = Math.max(-10, Math.min(10, e.deltaY))
        const factor = 1 - delta * 0.01
        // Convert client coordinates to container-relative coordinates
        const rect = container.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        zoomAt(x, y, factor)
      } else {
        // Pan
        pan(-e.deltaX, -e.deltaY)
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [pan, zoomAt])

  // Handle background mouse down for pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      if (e.target !== containerRef.current) return

      // Clicked on background
      clearSelection()
      onBackgroundClick?.()

      // Start panning
      isDragging.current = true
      lastMousePos.current = { x: e.clientX, y: e.clientY }

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return
        const deltaX = moveEvent.clientX - lastMousePos.current.x
        const deltaY = moveEvent.clientY - lastMousePos.current.y
        lastMousePos.current = { x: moveEvent.clientX, y: moveEvent.clientY }
        pan(deltaX, deltaY)
      }

      const handleMouseUp = () => {
        isDragging.current = false
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [clearSelection, onBackgroundClick, pan]
  )

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeIds.size > 0) {
          canvas.deleteSelected()
        }
      }

      // Select all
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        canvas.selectAll()
      }

      // Escape to clear selection
      if (e.key === 'Escape') {
        clearSelection()
      }

      // Fit to content
      if (e.key === '1' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        canvas.fitToContent()
      }

      // Reset view
      if (e.key === '0' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        canvas.resetView()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canvas, selectedNodeIds, clearSelection])

  // Node event handlers
  const handleNodeSelect = useCallback(
    (id: string, additive: boolean) => {
      selectNode(id, additive)
    },
    [selectNode]
  )

  const handleNodeDragStart = useCallback((_id: string, _point: Point) => {
    // Could start undo batch here
  }, [])

  const handleNodeDrag = useCallback(
    (id: string, delta: Point) => {
      // Move selected nodes together
      const nodesToMove = selectedNodeIds.has(id) ? Array.from(selectedNodeIds) : [id]

      nodesToMove.forEach((nodeId) => {
        // Read directly from store (not React state) to avoid stale position
        // during fast drags where React batches re-renders
        const node = canvas.store.getNode(nodeId)
        if (node) {
          updateNodePosition(nodeId, {
            x: node.position.x + delta.x / viewport.zoom,
            y: node.position.y + delta.y / viewport.zoom
          })
        }
      })
    },
    [selectedNodeIds, canvas.store, updateNodePosition, viewport.zoom]
  )

  const handleNodeDragEnd = useCallback((_id: string) => {
    // Could end undo batch here
  }, [])

  const handleNodeDoubleClick = useCallback(
    (id: string) => {
      onNodeDoubleClick?.(id)
    },
    [onNodeDoubleClick]
  )

  // Build node map for edge rendering
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  // Container styles
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#fafafa',
    cursor: isDragging.current ? 'grabbing' : 'default',
    ...style
  }

  // Canvas layer styles (applies transform)
  const canvasLayerStyle: React.CSSProperties = {
    position: 'absolute',
    transformOrigin: '0 0',
    transform: viewport.getTransform()
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={containerStyle}
      onMouseDown={handleMouseDown}
    >
      {/* Grid background */}
      {config.showGrid !== false && (
        <GridBackground gridSize={config.gridSize ?? 20} zoom={viewport.zoom} />
      )}

      {/* Edges layer (SVG) */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible'
        }}
      >
        <g style={{ transform: viewport.getTransform() }}>
          {edges.map((edge) => {
            const sourceNode = nodeMap.get(edge.sourceId)
            const targetNode = nodeMap.get(edge.targetId)
            if (!sourceNode || !targetNode) return null

            return (
              <CanvasEdgeComponent
                key={edge.id}
                edge={edge}
                sourceNode={sourceNode}
                targetNode={targetNode}
                selected={selectedEdgeIds.has(edge.id)}
                onSelect={(id) => canvas.selectEdge(id)}
              />
            )
          })}
        </g>
      </svg>

      {/* Nodes layer */}
      <div style={canvasLayerStyle}>
        {nodes.map((node) => (
          <CanvasNodeComponent
            key={node.id}
            node={node}
            selected={selectedNodeIds.has(node.id)}
            remoteUsers={nodePresence.get(node.id)}
            onSelect={handleNodeSelect}
            onDragStart={handleNodeDragStart}
            onDrag={handleNodeDrag}
            onDragEnd={handleNodeDragEnd}
            onDoubleClick={handleNodeDoubleClick}
          >
            {renderNode?.(node)}
          </CanvasNodeComponent>
        ))}
      </div>

      {/* Comment overlay (optional - only when canvasNodeId provided) */}
      {canvasNodeId && (
        <CommentOverlay
          canvasNodeId={canvasNodeId}
          canvasSchema={canvasSchema}
          transform={{
            panX: viewport.x,
            panY: viewport.y,
            zoom: viewport.zoom
          }}
          objects={
            new Map(
              nodes.map((n) => [
                n.id,
                {
                  id: n.id,
                  x: n.position.x,
                  y: n.position.y,
                  width: n.position.width,
                  height: n.position.height
                }
              ])
            )
          }
        />
      )}

      {/* Minimap could go here */}
    </div>
  )
})

export default Canvas
