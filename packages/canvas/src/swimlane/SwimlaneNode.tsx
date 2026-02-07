/**
 * Swimlane Node Component
 *
 * A container node that organizes child nodes into distinct regions.
 */

import type { SwimlaneNode, GenericCanvasNode } from './types'
import type { CSSProperties, DragEvent } from 'react'
import { memo, useCallback, useMemo } from 'react'

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface SwimlaneNodeProps {
  /** The swimlane node data */
  node: SwimlaneNode
  /** Child nodes contained in this swimlane */
  children: GenericCanvasNode[]
  /** Whether the swimlane is selected */
  isSelected?: boolean
  /** Whether drag-over feedback should show */
  isDragOver?: boolean
  /** Called when properties update */
  onUpdate?: (changes: Partial<SwimlaneNode['properties']>) => void
  /** Called when a node is dropped into the swimlane */
  onNodeDrop?: (nodeId: string, swimlaneId: string) => void
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const SwimlaneNodeComponent = memo(function SwimlaneNodeComponent({
  node,
  children,
  isSelected = false,
  isDragOver = false,
  onUpdate,
  onNodeDrop
}: SwimlaneNodeProps) {
  const { title, orientation, color, headerSize, collapsed } = node.properties
  const { x, y, width, height } = node.position

  const isHorizontal = orientation === 'horizontal'

  // Calculate effective dimensions
  const effectiveHeight = collapsed && isHorizontal ? headerSize : height
  const effectiveWidth = collapsed && !isHorizontal ? headerSize : width

  // Handle drag over
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  // Handle drop
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const nodeId = e.dataTransfer.getData('text/node-id')
      if (nodeId && nodeId !== node.id && onNodeDrop) {
        onNodeDrop(nodeId, node.id)
      }
    },
    [node.id, onNodeDrop]
  )

  // Toggle collapse
  const toggleCollapse = useCallback(() => {
    onUpdate?.({ collapsed: !collapsed })
  }, [collapsed, onUpdate])

  // Header styles
  const headerStyle = useMemo<CSSProperties>(() => {
    if (isHorizontal) {
      return {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: headerSize,
        backgroundColor: color,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 8,
        borderRadius: '6px 6px 0 0',
        color: getContrastColor(color),
        fontWeight: 600,
        fontSize: 14,
        userSelect: 'none'
      }
    } else {
      return {
        position: 'absolute',
        top: 0,
        left: 0,
        width: headerSize,
        height: '100%',
        backgroundColor: color,
        writingMode: 'vertical-lr',
        textOrientation: 'mixed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px 0',
        gap: 8,
        borderRadius: '6px 0 0 6px',
        color: getContrastColor(color),
        fontWeight: 600,
        fontSize: 14,
        userSelect: 'none'
      }
    }
  }, [isHorizontal, headerSize, color])

  // Content styles
  const contentStyle = useMemo<CSSProperties>(() => {
    if (isHorizontal) {
      return {
        position: 'absolute',
        top: headerSize,
        left: 0,
        width: '100%',
        height: collapsed ? 0 : height - headerSize,
        overflow: 'hidden',
        transition: 'height 200ms ease-out',
        backgroundColor: isDragOver ? `${color}20` : 'transparent'
      }
    } else {
      return {
        position: 'absolute',
        top: 0,
        left: headerSize,
        width: collapsed ? 0 : width - headerSize,
        height: '100%',
        overflow: 'hidden',
        transition: 'width 200ms ease-out',
        backgroundColor: isDragOver ? `${color}20` : 'transparent'
      }
    }
  }, [isHorizontal, headerSize, collapsed, height, width, isDragOver, color])

  // Container styles
  const containerStyle = useMemo<CSSProperties>(
    () => ({
      position: 'absolute',
      left: x,
      top: y,
      width: effectiveWidth,
      height: effectiveHeight,
      border: `2px solid ${isSelected ? '#3b82f6' : color}`,
      borderRadius: 8,
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      overflow: 'hidden',
      boxShadow: isSelected ? '0 0 0 2px rgba(59, 130, 246, 0.3)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
      transition: 'box-shadow 150ms ease, width 200ms ease, height 200ms ease'
    }),
    [x, y, effectiveWidth, effectiveHeight, isSelected, color]
  )

  return (
    <div
      className="swimlane-node"
      style={containerStyle}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-swimlane-id={node.id}
    >
      {/* Header */}
      <div style={headerStyle}>
        <button
          className="swimlane-collapse-btn"
          onClick={toggleCollapse}
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: 4,
            fontSize: 16,
            lineHeight: 1,
            opacity: 0.8
          }}
          aria-label={collapsed ? 'Expand swimlane' : 'Collapse swimlane'}
        >
          {collapsed ? '+' : '-'}
        </button>
        <span className="swimlane-title">{title}</span>
        <span className="swimlane-count" style={{ opacity: 0.7, marginLeft: 'auto' }}>
          ({children.length})
        </span>
      </div>

      {/* Content area */}
      <div style={contentStyle} className="swimlane-content">
        {/* Child nodes are rendered by parent Canvas, not here */}
      </div>
    </div>
  )
})

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get a contrasting text color (black or white) for a given background color.
 */
function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '')

  // Parse RGB values
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

  return luminance > 0.5 ? '#000000' : '#ffffff'
}
