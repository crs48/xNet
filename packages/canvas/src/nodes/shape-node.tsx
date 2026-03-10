/**
 * Shape Node Component
 *
 * Renders geometric shapes for diagrams with SVG paths.
 * Supports 10 shape types with fill, stroke, and optional label.
 */

import { memo, useMemo } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ShapeType =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'hexagon'
  | 'star'
  | 'arrow'
  | 'cylinder'
  | 'cloud'

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

// ─── Shape Path Generator ────────────────────────────────────────────────────

export function createShapePath(
  type: ShapeType,
  width: number,
  height: number,
  cornerRadius?: number
): string {
  const cx = width / 2
  const cy = height / 2

  switch (type) {
    case 'rectangle':
      return `M 0 0 H ${width} V ${height} H 0 Z`

    case 'rounded-rectangle': {
      const r = Math.min(cornerRadius ?? 8, width / 2, height / 2)
      return `
        M ${r} 0
        H ${width - r}
        Q ${width} 0 ${width} ${r}
        V ${height - r}
        Q ${width} ${height} ${width - r} ${height}
        H ${r}
        Q 0 ${height} 0 ${height - r}
        V ${r}
        Q 0 0 ${r} 0
        Z
      `
        .trim()
        .replace(/\s+/g, ' ')
    }

    case 'ellipse':
      return `
        M ${cx} 0
        A ${cx} ${cy} 0 1 1 ${cx} ${height}
        A ${cx} ${cy} 0 1 1 ${cx} 0
        Z
      `
        .trim()
        .replace(/\s+/g, ' ')

    case 'diamond':
      return `
        M ${cx} 0
        L ${width} ${cy}
        L ${cx} ${height}
        L 0 ${cy}
        Z
      `
        .trim()
        .replace(/\s+/g, ' ')

    case 'triangle':
      return `
        M ${cx} 0
        L ${width} ${height}
        L 0 ${height}
        Z
      `
        .trim()
        .replace(/\s+/g, ' ')

    case 'hexagon': {
      const r = Math.min(width, height) / 2
      const points: string[] = []
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2
        const px = cx + r * Math.cos(angle)
        const py = cy + r * Math.sin(angle)
        points.push(`${px.toFixed(2)} ${py.toFixed(2)}`)
      }
      return `M ${points.join(' L ')} Z`
    }

    case 'star': {
      const outerR = Math.min(width, height) / 2
      const innerR = outerR * 0.4
      const points: string[] = []
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2
        const r = i % 2 === 0 ? outerR : innerR
        const px = cx + r * Math.cos(angle)
        const py = cy + r * Math.sin(angle)
        points.push(`${px.toFixed(2)} ${py.toFixed(2)}`)
      }
      return `M ${points.join(' L ')} Z`
    }

    case 'arrow':
      return `
        M 0 ${height * 0.3}
        H ${width * 0.6}
        V 0
        L ${width} ${cy}
        L ${width * 0.6} ${height}
        V ${height * 0.7}
        H 0
        Z
      `
        .trim()
        .replace(/\s+/g, ' ')

    case 'cylinder': {
      const ry = height * 0.1
      return `
        M 0 ${ry}
        A ${cx} ${ry} 0 0 1 ${width} ${ry}
        V ${height - ry}
        A ${cx} ${ry} 0 0 1 0 ${height - ry}
        Z
        M 0 ${ry}
        A ${cx} ${ry} 0 0 0 ${width} ${ry}
      `
        .trim()
        .replace(/\s+/g, ' ')
    }

    case 'cloud':
      return `
        M ${width * 0.25} ${height * 0.6}
        A ${width * 0.15} ${height * 0.15} 0 1 1 ${width * 0.35} ${height * 0.35}
        A ${width * 0.2} ${height * 0.2} 0 1 1 ${width * 0.65} ${height * 0.3}
        A ${width * 0.15} ${height * 0.2} 0 1 1 ${width * 0.8} ${height * 0.5}
        A ${width * 0.12} ${height * 0.15} 0 1 1 ${width * 0.7} ${height * 0.7}
        Q ${width * 0.5} ${height * 0.8} ${width * 0.25} ${height * 0.6}
        Z
      `
        .trim()
        .replace(/\s+/g, ' ')

    default:
      return `M 0 0 H ${width} V ${height} H 0 Z`
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ShapeNodeComponent = memo(function ShapeNodeComponent({
  node,
  onUpdate: _onUpdate
}: ShapeNodeProps) {
  const { shapeType, fill, stroke, strokeWidth, cornerRadius, label, labelColor } = node.properties
  const { width, height } = node.position

  const shapePath = useMemo(() => {
    return createShapePath(shapeType, width, height, cornerRadius)
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

export const SHAPE_TYPES: Array<{ type: ShapeType; label: string }> = [
  { type: 'rectangle', label: 'Rectangle' },
  { type: 'rounded-rectangle', label: 'Rounded' },
  { type: 'ellipse', label: 'Ellipse' },
  { type: 'diamond', label: 'Diamond' },
  { type: 'triangle', label: 'Triangle' },
  { type: 'hexagon', label: 'Hexagon' },
  { type: 'star', label: 'Star' },
  { type: 'arrow', label: 'Arrow' },
  { type: 'cylinder', label: 'Cylinder' },
  { type: 'cloud', label: 'Cloud' }
]

export interface ShapePickerProps {
  onSelect: (shapeType: ShapeType) => void
  onClose: () => void
}

export const ShapePicker = memo(function ShapePicker({ onSelect, onClose }: ShapePickerProps) {
  return (
    <div className="shape-picker" style={pickerStyles.container}>
      <div className="shape-picker-header" style={pickerStyles.header}>
        <span>Shapes</span>
        <button onClick={onClose} style={pickerStyles.closeButton}>
          ×
        </button>
      </div>
      <div className="shape-picker-grid" style={pickerStyles.grid}>
        {SHAPE_TYPES.map(({ type, label }) => (
          <button
            key={type}
            className="shape-option"
            onClick={() => onSelect(type)}
            title={label}
            style={pickerStyles.option}
          >
            <svg width="32" height="32" viewBox="0 0 32 32">
              <path
                d={createShapePath(type, 28, 28)}
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
