/**
 * Shape path geometry (pure, no React) — extracted from shape-node so the
 * shape registry (0205) can import it without a component-module cycle.
 */

/** The built-in shape kinds. Shape kinds are open (registry-driven, 0205). */
export type BuiltinShapeType =
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

/** A built-in kind, or any plugin-registered shape kind string. */
export type ShapeType = BuiltinShapeType | (string & {})

/** Built-in shapes for the picker, in display order. */
export const BUILTIN_SHAPES: Array<{ type: BuiltinShapeType; label: string }> = [
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

/**
 * Build an SVG path for a built-in shape. Unknown kinds fall back to a
 * rectangle. Plugin shapes provide their own `buildPath` via the registry.
 */
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
