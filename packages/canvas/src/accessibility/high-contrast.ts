/**
 * High Contrast Mode
 *
 * Utilities for high contrast mode support.
 */

import { useState, useEffect } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * High contrast styles
 */
export interface HighContrastStyles {
  node: {
    border: string
    backgroundColor: string
  }
  edge: {
    stroke: string
    strokeWidth: number
  }
  selection: {
    outline: string
    outlineOffset: string
  }
  focus: {
    outline: string
    outlineOffset: string
  }
}

// ─── Default Styles ────────────────────────────────────────────────────────────

/**
 * High contrast styles for canvas elements.
 */
export const HIGH_CONTRAST_STYLES: HighContrastStyles = {
  node: {
    border: '2px solid black',
    backgroundColor: 'white'
  },
  edge: {
    stroke: 'black',
    strokeWidth: 2
  },
  selection: {
    outline: '3px solid blue',
    outlineOffset: '2px'
  },
  focus: {
    outline: '3px dashed black',
    outlineOffset: '4px'
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Hook to detect high contrast mode preference.
 */
export function useHighContrast(): boolean {
  const [isHighContrast, setIsHighContrast] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-contrast: more)')

    setIsHighContrast(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => {
      setIsHighContrast(e.matches)
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return isHighContrast
}

/**
 * Hook to detect reduced motion preference.
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return prefersReducedMotion
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Check if high contrast mode is enabled.
 */
export function isHighContrastEnabled(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-contrast: more)').matches
}

/**
 * Check if reduced motion is preferred.
 */
export function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
