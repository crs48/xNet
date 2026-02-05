/**
 * Skeleton loading placeholder.
 *
 * Shows a pulsing placeholder while content is loading. Supports
 * different shapes (text lines, circles, rectangles).
 */

// ─── Types ──────────────────────────────────────────────────

export type SkeletonProps = {
  /** Width (CSS value). Default: '100%'. */
  width?: string | number
  /** Height (CSS value). Default: '1em'. */
  height?: string | number
  /** Border radius. Use '50%' for circles. Default: '4px'. */
  borderRadius?: string | number
  /** Additional inline styles. */
  style?: React.CSSProperties
  /** Number of lines to render. Default: 1. */
  lines?: number
  /** Gap between lines. Default: '0.5rem'. */
  gap?: string
}

// ─── Component ──────────────────────────────────────────────

// Auto-inject keyframes on first render (no external dependency needed)
let stylesInjected = false
function ensureStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return
  const id = 'xnet-skeleton-styles'
  if (document.getElementById(id)) {
    stylesInjected = true
    return
  }
  const el = document.createElement('style')
  el.id = id
  el.textContent = `
    @keyframes xnet-skeleton-pulse {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `
  document.head.appendChild(el)
  stylesInjected = true
}

export function Skeleton({
  width = '100%',
  height = '1em',
  borderRadius = '4px',
  style,
  lines = 1,
  gap = '0.5rem'
}: SkeletonProps): JSX.Element {
  ensureStyles()

  const baseStyle: React.CSSProperties = {
    display: 'block',
    width,
    height,
    borderRadius,
    background: 'linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)',
    backgroundSize: '200% 100%',
    animation: 'xnet-skeleton-pulse 1.5s ease-in-out infinite',
    ...style
  }

  if (lines <= 1) {
    return <span aria-hidden="true" style={baseStyle} />
  }

  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          style={{
            ...baseStyle,
            // Last line is shorter for visual realism
            width: i === lines - 1 ? '60%' : width
          }}
        />
      ))}
    </div>
  )
}

/**
 * Inject the skeleton keyframes into the document head.
 * Call once at app startup, or include the CSS in your stylesheet:
 *
 * ```css
 * @keyframes xnet-skeleton-pulse {
 *   0% { background-position: 200% 0; }
 *   100% { background-position: -200% 0; }
 * }
 * ```
 */
export function injectSkeletonStyles(): void {
  if (typeof document === 'undefined') return
  const id = 'xnet-skeleton-styles'
  if (document.getElementById(id)) return

  const style = document.createElement('style')
  style.id = id
  style.textContent = `
    @keyframes xnet-skeleton-pulse {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `
  document.head.appendChild(style)
}
