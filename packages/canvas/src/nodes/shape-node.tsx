/**
 * Shape Node Component
 *
 * Renders geometric shapes for diagrams with SVG paths.
 * Supports 10 shape types with fill, stroke, and optional label.
 */

import { memo, useEffect, useMemo, useState } from 'react'
import { type ShapeType } from './shape-paths'
import { resolveShapePath, shapeRegistry, shapeTypes } from './shape-registry'

// Re-exported for back-compat: createShapePath (built-in switch) + ShapeType.
export { createShapePath, type ShapeType } from './shape-paths'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShapeNodeData {
  id: string
  type: 'shape'
  position: {
    x: number
    y: number
    width: number
    height: number
  }
  properties: {
    shapeType: ShapeType
    fill: string
    stroke: string
    strokeWidth: number
    cornerRadius?: number
    label?: string
    labelColor?: string
  }
}

export interface ShapeNodeProps {
  node: ShapeNodeData
  onUpdate: (changes: Partial<ShapeNodeData['properties']>) => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ShapeNodeComponent = memo(function ShapeNodeComponent({
  node,
  onUpdate: _onUpdate
}: ShapeNodeProps) {
  const { shapeType, fill, stroke, strokeWidth, cornerRadius, label, labelColor } = node.properties
  const { width, height } = node.position

  const shapePath = useMemo(() => {
    return resolveShapePath(shapeType, width, height, cornerRadius)
  }, [shapeType, width, height, cornerRadius])

  return (
    <div className="shape-node" style={styles.node}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={styles.svg}>
        <path d={shapePath} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>

      {label && (
        <div
          className="shape-label"
          style={{
            ...styles.label,
            color: labelColor ?? styles.label.color
          }}
        >
          <span>{label}</span>
        </div>
      )}
    </div>
  )
})

// ─── Shape Picker ────────────────────────────────────────────────────────────

/**
 * Built-in shape list (back-compat). The picker uses the registry so
 * plugin-contributed shapes also appear; this constant lists the built-ins.
 */
export const SHAPE_TYPES: Array<{ type: ShapeType; label: string }> = shapeTypes()

export interface ShapePickerProps {
  onSelect: (shapeType: ShapeType) => void
  onClose: () => void
}

export const ShapePicker = memo(function ShapePicker({ onSelect, onClose }: ShapePickerProps) {
  // Registry-driven so plugin shapes appear in the picker (0205).
  const [types, setTypes] = useState(shapeTypes)
  useEffect(() => shapeRegistry.onChange(() => setTypes(shapeTypes())), [])

  return (
    <div className="shape-picker" style={pickerStyles.container}>
      <div className="shape-picker-header" style={pickerStyles.header}>
        <span>Shapes</span>
        <button onClick={onClose} style={pickerStyles.closeButton}>
          ×
        </button>
      </div>
      <div className="shape-picker-grid" style={pickerStyles.grid}>
        {types.map(({ type, label }) => (
          <button
            key={type}
            className="shape-option"
            onClick={() => onSelect(type)}
            title={label}
            style={pickerStyles.option}
          >
            <svg width="32" height="32" viewBox="0 0 32 32">
              <path
                d={resolveShapePath(type, 28, 28)}
                transform="translate(2, 2)"
                fill="#e5e7eb"
                stroke="#6b7280"
                strokeWidth="1"
              />
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
})

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  node: {
    position: 'relative',
    width: '100%',
    height: '100%'
  },
  svg: {
    display: 'block'
  },
  label: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center',
    fontSize: '14px',
    fontWeight: 500,
    color: '#111827',
    pointerEvents: 'none'
  }
}

const pickerStyles: Record<string, React.CSSProperties> = {
  container: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    padding: '8px',
    width: '200px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 8px',
    fontWeight: 500,
    fontSize: '13px',
    color: '#374151'
  },
  closeButton: {
    border: 'none',
    background: 'transparent',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#6b7280',
    padding: 0,
    lineHeight: 1
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '4px',
    padding: '8px 0'
  },
  option: {
    width: '36px',
    height: '36px',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    background: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0
  }
}
