/**
 * Canvas Component
 *
 * Main infinite canvas component with pan, zoom, and node rendering.
 */

import React, { useRef, useCallback, useEffect, memo } from 'react'
import type * as Y from 'yjs'
import type { CanvasConfig, CanvasNode, Point, ResizeHandle } from '../types'
import { useCanvas, type UseCanvasReturn } from '../hooks/useCanvas'
import { CanvasNodeComponent } from '../nodes/CanvasNodeComponent'
import { CanvasEdgeComponent } from '../edges/CanvasEdgeComponent'

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
  /** CSS class name */
  className?: string
  /** CSS styles */
  style?: React.CSSProperties
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
export const Canvas = memo(function Canvas({
  doc,
  config = {},
  initialViewport,
  renderNode,
  onNodeDoubleClick,
  onBackgroundClick,
  className,
  style
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const lastMousePos = useRef<Point>({ x: 0, y: 0 })

  // Use canvas hook
  const canvas = useCanvas({ doc, config, initialViewport })
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
    zoomAt,
    findNodeAt
  } = canvas

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

  // Handle wheel for zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()

      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const factor = e.deltaY > 0 ? 0.9 : 1.1
        zoomAt(e.clientX, e.clientY, factor)
      } else {
        // Pan
        pan(-e.deltaX, -e.deltaY)
      }
    },
    [pan, zoomAt]
  )

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

  const handleNodeDragStart = useCallback((id: string, point: Point) => {
    // Could start undo batch here
  }, [])

  const handleNodeDrag = useCallback(
    (id: string, delta: Point) => {
      // Move selected nodes together
      const nodesToMove = selectedNodeIds.has(id) ? Array.from(selectedNodeIds) : [id]

      nodesToMove.forEach((nodeId) => {
        const node = nodes.find((n) => n.id === nodeId)
        if (node) {
          updateNodePosition(nodeId, {
            x: node.position.x + delta.x / viewport.zoom,
            y: node.position.y + delta.y / viewport.zoom
          })
        }
      })
    },
    [selectedNodeIds, nodes, updateNodePosition, viewport.zoom]
  )

  const handleNodeDragEnd = useCallback((id: string) => {
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
      onWheel={handleWheel}
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

      {/* Minimap could go here */}
    </div>
  )
})

export default Canvas
