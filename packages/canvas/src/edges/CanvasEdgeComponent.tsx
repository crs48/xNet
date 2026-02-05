/**
 * Canvas Edge Component
 *
 * Renders connections between nodes as SVG paths.
 */

import type { CanvasEdge, CanvasNode, Point, EdgeAnchor } from '../types'
import React, { memo, useMemo } from 'react'

export interface CanvasEdgeProps {
  edge: CanvasEdge
  sourceNode: CanvasNode
  targetNode: CanvasNode
  selected: boolean
  onSelect?: (id: string) => void
  onClick?: (id: string) => void
}

/**
 * Get anchor point on a node
 */
function getAnchorPoint(node: CanvasNode, anchor: EdgeAnchor, targetPoint?: Point): Point {
  const { x, y, width, height } = node.position
  const cx = x + width / 2
  const cy = y + height / 2

  switch (anchor) {
    case 'top':
      return { x: cx, y }
    case 'right':
      return { x: x + width, y: cy }
    case 'bottom':
      return { x: cx, y: y + height }
    case 'left':
      return { x, y: cy }
    case 'center':
      return { x: cx, y: cy }
    case 'auto':
    default: {
      // Find the best anchor based on target position
      if (!targetPoint) return { x: cx, y: cy }

      const dx = targetPoint.x - cx
      const dy = targetPoint.y - cy

      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal connection
        return dx > 0 ? { x: x + width, y: cy } : { x, y: cy }
      } else {
        // Vertical connection
        return dy > 0 ? { x: cx, y: y + height } : { x: cx, y }
      }
    }
  }
}

/**
 * Generate a smooth bezier path between two points
 */
function generatePath(start: Point, end: Point, curved = true): string {
  if (!curved) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
  }

  // Calculate control points for a smooth curve
  const dx = end.x - start.x
  const dy = end.y - start.y
  const tension = 0.5

  // Determine curve direction based on relative positions
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal curve
    const cp1x = start.x + dx * tension
    const cp2x = end.x - dx * tension
    return `M ${start.x} ${start.y} C ${cp1x} ${start.y}, ${cp2x} ${end.y}, ${end.x} ${end.y}`
  } else {
    // Vertical curve
    const cp1y = start.y + dy * tension
    const cp2y = end.y - dy * tension
    return `M ${start.x} ${start.y} C ${start.x} ${cp1y}, ${end.x} ${cp2y}, ${end.x} ${end.y}`
  }
}

/**
 * Generate orthogonal (right-angle) path
 */
function generateOrthogonalPath(start: Point, end: Point): string {
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2

  // Decide whether to go horizontal-first or vertical-first
  const dx = Math.abs(end.x - start.x)
  const dy = Math.abs(end.y - start.y)

  if (dx > dy) {
    // Horizontal first
    return `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`
  } else {
    // Vertical first
    return `M ${start.x} ${start.y} L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`
  }
}

/**
 * Arrow marker component
 */
function ArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
    </marker>
  )
}

/**
 * Canvas Edge Component
 */
export const CanvasEdgeComponent = memo(function CanvasEdgeComponent({
  edge,
  sourceNode,
  targetNode,
  selected,
  onSelect,
  onClick
}: CanvasEdgeProps) {
  // Calculate anchor points
  const { startPoint, endPoint, path } = useMemo(() => {
    const targetCenter = {
      x: targetNode.position.x + targetNode.position.width / 2,
      y: targetNode.position.y + targetNode.position.height / 2
    }
    const sourceCenter = {
      x: sourceNode.position.x + sourceNode.position.width / 2,
      y: sourceNode.position.y + sourceNode.position.height / 2
    }

    const start = getAnchorPoint(sourceNode, edge.sourceAnchor ?? 'auto', targetCenter)
    const end = getAnchorPoint(targetNode, edge.targetAnchor ?? 'auto', sourceCenter)

    const curved = edge.style?.curved !== false
    const pathD = curved ? generatePath(start, end, true) : generateOrthogonalPath(start, end)

    return { startPoint: start, endPoint: end, path: pathD }
  }, [sourceNode, targetNode, edge.sourceAnchor, edge.targetAnchor, edge.style?.curved])

  // Style
  const strokeColor = selected ? '#0066ff' : (edge.style?.stroke ?? '#999')
  const strokeWidth = edge.style?.strokeWidth ?? (selected ? 2 : 1.5)
  const strokeDasharray = edge.style?.strokeDasharray

  // Marker IDs
  const markerId = `arrow-${edge.id}`

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect?.(edge.id)
    onClick?.(edge.id)
  }

  return (
    <g data-edge-id={edge.id} onClick={handleClick} style={{ cursor: 'pointer' }}>
      {/* Invisible wider path for easier clicking */}
      <path d={path} stroke="transparent" strokeWidth={12} fill="none" />

      {/* Define markers */}
      <defs>
        {edge.style?.markerEnd === 'arrow' && <ArrowMarker id={markerId} color={strokeColor} />}
      </defs>

      {/* Visible path */}
      <path
        d={path}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        fill="none"
        markerEnd={edge.style?.markerEnd === 'arrow' ? `url(#${markerId})` : undefined}
      />

      {/* Label */}
      {edge.label && (
        <text
          x={(startPoint.x + endPoint.x) / 2}
          y={(startPoint.y + endPoint.y) / 2 - 8}
          textAnchor="middle"
          fontSize={12}
          fill="#666"
          style={{ pointerEvents: 'none' }}
        >
          {edge.label}
        </text>
      )}
    </g>
  )
})

export default CanvasEdgeComponent
