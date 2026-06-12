/**
 * Theme bridge: derive chart colors from the Tailwind CSS custom properties
 * the xNet UI theme already defines (hsl token triples on :root), so charts
 * follow light/dark mode without their own theme switch.
 */

import type { ChartTheme } from './spec'

const FALLBACK_PALETTE = [
  '#4f46e5',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6'
]

function cssHsl(styles: CSSStyleDeclaration, token: string, fallback: string): string {
  const value = styles.getPropertyValue(token).trim()
  return value ? `hsl(${value})` : fallback
}

/** Read the active chart theme from the document's CSS custom properties. */
export function readChartTheme(element?: Element | null): ChartTheme {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      palette: FALLBACK_PALETTE,
      textColor: '#6b7280',
      axisColor: '#d1d5db',
      splitLineColor: '#e5e7eb',
      backgroundColor: '#ffffff'
    }
  }

  const styles = window.getComputedStyle(element ?? document.documentElement)
  const primary = cssHsl(styles, '--primary', FALLBACK_PALETTE[0])

  return {
    palette: [primary, ...FALLBACK_PALETTE.filter((color) => color !== primary)],
    textColor: cssHsl(styles, '--muted-foreground', '#6b7280'),
    axisColor: cssHsl(styles, '--border', '#d1d5db'),
    splitLineColor: cssHsl(styles, '--border', '#e5e7eb'),
    backgroundColor: cssHsl(styles, '--background', '#ffffff')
  }
}
