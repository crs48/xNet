/**
 * Canvas Component
 *
 * Main infinite canvas component with pan, zoom, and node rendering.
 */

import type { CanvasConfig, CanvasNode, GridType, Point } from '../types'
import type * as Y from 'yjs'
import React, {
  useRef,
  useCallback,
  useEffect,
  useState,
  useImperativeHandle,
  useMemo,
  forwardRef
} from 'react'
import { CommentOverlay } from '../comments/CommentOverlay'
import { CanvasEdgeComponent } from '../edges/CanvasEdgeComponent'
import { useCanvas } from '../hooks/useCanvas'
import { createGridLayer, type GridLayer } from '../layers'
import { CanvasNodeComponent } from '../nodes/CanvasNodeComponent'

/** Minimal Awareness interface (avoids y-protocols dependency) */
interface AwarenessLike {
  clientID: number
  getStates(): Map<number, Record<string, unknown>>
  setLocalStateField(field: string, value: unknown): void
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
}

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
 * WebGL Grid background hook
 *
 * Creates and manages the WebGL grid layer lifecycle.
 * Falls back to CSS grid if WebGL is unavailable.
 */
function useWebGLGrid(
  containerRef: React.RefObject<HTMLDivElement | null>,
  config: {
    showGrid: boolean
    gridType: GridType
    gridSize: number
  },
  viewport: { x: number; y: number; zoom: number }
): void {
  const gridLayerRef = useRef<GridLayer | null>(null)

  // Initialize/cleanup grid layer
  useEffect(() => {
    const container = containerRef.current
    if (!container || !config.showGrid || config.gridType === 'none') {
      // Cleanup if grid is disabled
      gridLayerRef.current?.destroy()
      gridLayerRef.current = null
      return
    }

    // Create grid layer (WebGL with CSS fallback)
    gridLayerRef.current = createGridLayer(container, {
      type: config.gridType === 'dots' ? 'dots' : 'lines',
      gridSpacing: config.gridSize,
      gridColor: [0.5, 0.5, 0.5, 0.3],
      majorGridColor: [0.5, 0.5, 0.5, 0.5],
      majorEvery: 5
    })

    // Initial resize
    gridLayerRef.current.resize()

    return () => {
      gridLayerRef.current?.destroy()
      gridLayerRef.current = null
    }
  }, [containerRef, config.showGrid, config.gridType, config.gridSize])

  // Handle resize - uses ref to avoid re-subscribing on viewport changes
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport

  useEffect(() => {
    const container = containerRef.current
    if (!container || !gridLayerRef.current) return

    const handleResize = () => {
      gridLayerRef.current?.resize()
      // Re-render after resize with current viewport from ref
      gridLayerRef.current?.render(viewportRef.current)
    }

    const observer = new ResizeObserver(handleResize)
    observer.observe(container)

    return () => observer.disconnect()
  }, [containerRef])

  // Render on viewport change
  useEffect(() => {
    gridLayerRef.current?.render(viewport)
  }, [viewport.x, viewport.y, viewport.zoom])
}

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
  const [isDragging, setIsDragging] = useState(false)
  const lastMousePos = useRef<Point>({ x: 0, y: 0 })

  // Track initial positions when drag starts to prevent drift during fast drags
  // Key: nodeId, Value: { x, y } at drag start
  const dragInitialPositions = useRef<Map<string, Point>>(new Map())
  // Track cumulative drag offset since drag started
  const dragCumulativeOffset = useRef<Point>({ x: 0, y: 0 })

  // Use canvas hook
  const canvas = useCanvas({ doc, config, initialViewport })

  // Extract grid config with defaults
  const gridConfig = useMemo(
    () => ({
      showGrid: config.showGrid !== false,
      gridType: config.gridType ?? 'dots',
      gridSize: config.gridSize ?? 20
    }),
    [config.showGrid, config.gridType, config.gridSize]
  )

  // Initialize WebGL grid layer (or CSS fallback)
  useWebGLGrid(containerRef, gridConfig, {
    x: canvas.viewport.x,
    y: canvas.viewport.y,
    zoom: canvas.viewport.zoom
  })

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
      setIsDragging(true)
      lastMousePos.current = { x: e.clientX, y: e.clientY }

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - lastMousePos.current.x
        const deltaY = moveEvent.clientY - lastMousePos.current.y
        lastMousePos.current = { x: moveEvent.clientX, y: moveEvent.clientY }
        pan(deltaX, deltaY)
      }

      const handleMouseUp = () => {
        setIsDragging(false)
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
      // Check if canvas container or its children have focus
      const container = containerRef.current
      if (!container) return

      // For destructive operations (delete/backspace), only proceed if:
      // 1. Canvas container itself has focus, OR
      // 2. No input/textarea/contenteditable has focus
      const activeElement = document.activeElement
      const isInputFocused =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.getAttribute('contenteditable') === 'true'

      // Delete selected - only if canvas has focus or no input focused
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isInputFocused) return // Don't intercept if typing in an input
        if (selectedNodeIds.size > 0 && container.contains(activeElement)) {
          e.preventDefault()
          canvas.deleteSelected()
        }
      }

      // Select all - only if canvas has focus
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        if (container.contains(activeElement) && !isInputFocused) {
          e.preventDefault()
          canvas.selectAll()
        }
      }

      // Escape to clear selection - safe to handle globally within canvas
      if (e.key === 'Escape') {
        if (container.contains(activeElement)) {
          clearSelection()
        }
      }

      // Fit to content - only if canvas has focus
      if (e.key === '1' && (e.metaKey || e.ctrlKey)) {
        if (container.contains(activeElement)) {
          e.preventDefault()
          canvas.fitToContent()
        }
      }

      // Reset view - only if canvas has focus
      if (e.key === '0' && (e.metaKey || e.ctrlKey)) {
        if (container.contains(activeElement)) {
          e.preventDefault()
          canvas.resetView()
        }
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

  const handleNodeDragStart = useCallback(
    (id: string, _point: Point) => {
      // Capture initial positions of all nodes being dragged
      const nodesToMove = selectedNodeIds.has(id) ? Array.from(selectedNodeIds) : [id]

      dragInitialPositions.current.clear()
      dragCumulativeOffset.current = { x: 0, y: 0 }

      nodesToMove.forEach((nodeId) => {
        const node = canvas.store.getNode(nodeId)
        if (node) {
          dragInitialPositions.current.set(nodeId, {
            x: node.position.x,
            y: node.position.y
          })
        }
      })
      // Could start undo batch here
    },
    [selectedNodeIds, canvas.store]
  )

  const handleNodeDrag = useCallback(
    (_id: string, delta: Point) => {
      // Accumulate offset and compute final position from initial positions.
      // This prevents drift during fast drags where deltas might be applied
      // before the store has updated from the previous delta.
      dragCumulativeOffset.current = {
        x: dragCumulativeOffset.current.x + delta.x / viewport.zoom,
        y: dragCumulativeOffset.current.y + delta.y / viewport.zoom
      }

      dragInitialPositions.current.forEach((initialPos, nodeId) => {
        updateNodePosition(nodeId, {
          x: initialPos.x + dragCumulativeOffset.current.x,
          y: initialPos.y + dragCumulativeOffset.current.y
        })
      })
    },
    [updateNodePosition, viewport.zoom]
  )

  const handleNodeDragEnd = useCallback((_id: string) => {
    // Clear drag state
    dragInitialPositions.current.clear()
    dragCumulativeOffset.current = { x: 0, y: 0 }
    // Could end undo batch here
  }, [])

  const handleNodeDoubleClick = useCallback(
    (id: string) => {
      onNodeDoubleClick?.(id)
    },
    [onNodeDoubleClick]
  )

  // Build node map for edge rendering (memoized to avoid recreating on every render)
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  // PERF-01: Viewport culling - only render nodes visible in the viewport
  // Add a buffer (200px in canvas coordinates) to avoid nodes popping in/out at edges
  const visibleNodes = useMemo(() => {
    const visibleRect = viewport.getVisibleRect()
    // Expand rect by buffer to include nodes just outside viewport
    const buffer = 200 / viewport.zoom // Buffer in canvas coordinates
    const expandedRect = {
      x: visibleRect.x - buffer,
      y: visibleRect.y - buffer,
      width: visibleRect.width + buffer * 2,
      height: visibleRect.height + buffer * 2
    }
    return canvas.store.getVisibleNodes(expandedRect)
  }, [canvas.store, viewport])

  // PERF-01: Set of visible node IDs for fast edge culling lookup
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])

  // PERF-01: Filter edges to only those with at least one visible endpoint
  const visibleEdges = useMemo(
    () =>
      edges.filter(
        (edge) => visibleNodeIds.has(edge.sourceId) || visibleNodeIds.has(edge.targetId)
      ),
    [edges, visibleNodeIds]
  )

  // Build comment objects map (memoized for CommentOverlay)
  // Note: Uses all nodes for comments, not just visible ones
  const commentObjects = useMemo(
    () =>
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
      ),
    [nodes]
  )

  // Container styles
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#fafafa',
    cursor: isDragging ? 'grabbing' : 'default',
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
      tabIndex={0} // Make container focusable for keyboard shortcuts
    >
      {/* Grid background is rendered via WebGL/CSS layer (useWebGLGrid hook) */}

      {/* Edges layer (SVG) - PERF-01: Only render edges with visible endpoints */}
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
          {visibleEdges.map((edge) => {
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

      {/* Nodes layer - PERF-01: Only render nodes visible in viewport */}
      <div style={canvasLayerStyle}>
        {visibleNodes.map((node) => (
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
          objects={commentObjects}
        />
      )}

      {/* Minimap could go here */}
    </div>
  )
})

export default Canvas
