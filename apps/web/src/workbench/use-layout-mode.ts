/**
 * useLayoutMode — the single breakpoint signal for the workbench
 * (exploration 0196).
 *
 * Window size classes à la Material: the shell renders the desktop
 * `react-resizable-panels` grid on `expanded`, and a content-first,
 * sheet-driven composition on `compact`. `medium` (tablet) currently
 * follows the expanded grid; it gets its own tuning later.
 *
 *   compact   < 768px   phones — single surface + edge sheets + bottom nav
 *   medium    768–1023  tablets — expanded grid, narrower mins
 *   expanded  ≥ 1024px  desktop — today's shell, unchanged
 */
import { useMediaQuery } from '@xnetjs/ui'

export type LayoutMode = 'compact' | 'medium' | 'expanded'

/** Breakpoint boundaries, shared with the media queries below. */
export const LAYOUT_BREAKPOINTS = {
  /** Tablet lower bound (px). Below this is `compact`. */
  medium: 768,
  /** Desktop lower bound (px). At or above this is `expanded`. */
  expanded: 1024
} as const

/**
 * Pure resolver: derive the layout mode from the two matchMedia results.
 * Kept separate from the hook so the breakpoint logic is unit-testable
 * without a DOM.
 */
export function resolveLayoutMode(atLeastMedium: boolean, atLeastExpanded: boolean): LayoutMode {
  if (atLeastExpanded) return 'expanded'
  if (atLeastMedium) return 'medium'
  return 'compact'
}

/** True when the viewport is a phone-class (compact) width. */
export function useIsCompact(): boolean {
  return useLayoutMode() === 'compact'
}

/**
 * Reactive layout mode. SSR-safe (the underlying `useMediaQuery` starts
 * `false`, so the first paint is `compact` and corrects on mount).
 */
export function useLayoutMode(): LayoutMode {
  const atLeastMedium = useMediaQuery(`(min-width: ${LAYOUT_BREAKPOINTS.medium}px)`)
  const atLeastExpanded = useMediaQuery(`(min-width: ${LAYOUT_BREAKPOINTS.expanded}px)`)
  return resolveLayoutMode(atLeastMedium, atLeastExpanded)
}
