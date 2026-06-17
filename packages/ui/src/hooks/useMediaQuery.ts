/**
 * useMediaQuery - SSR-safe media query hook
 *
 * Provides reactive media query matching with convenience hooks
 * for common breakpoints.
 */

import * as React from 'react'

/**
 * Hook that tracks whether a media query matches.
 *
 * Uses SSR-safe pattern: starts with false, updates on mount.
 *
 * @param query - CSS media query string
 * @returns Whether the media query currently matches
 *
 * @example
 * const isWide = useMediaQuery('(min-width: 1024px)')
 * const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
 */
export function useMediaQuery(query: string): boolean {
  // Initialise synchronously from matchMedia (guarded for SSR) so the very
  // first render already has the correct value. Starting from a fixed
  // `false` caused a one-frame flash of the wrong layout — e.g. the mobile
  // shell briefly rendering on a desktop load before the effect corrected
  // it (exploration 0196). This app is a client-only SPA, so there is no
  // hydration mismatch to worry about.
  const [matches, setMatches] = React.useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  )

  React.useEffect(() => {
    // Check if window is available (SSR safety)
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(query)

    // Set initial value
    setMatches(mediaQuery.matches)

    // Create listener
    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    // Add listener
    mediaQuery.addEventListener('change', handler)

    // Cleanup
    return () => {
      mediaQuery.removeEventListener('change', handler)
    }
  }, [query])

  return matches
}

// ─── Convenience Hooks ─────────────────────────────────────────────

/**
 * Returns true when viewport is mobile-sized (< 768px).
 *
 * @example
 * const isMobile = useIsMobile()
 * if (isMobile) return <MobileNav />
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}

/**
 * Returns true when viewport is tablet-sized (768px - 1023px).
 *
 * @example
 * const isTablet = useIsTablet()
 * if (isTablet) return <CollapsedSidebar />
 */
export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 768px) and (max-width: 1023px)')
}

/**
 * Returns true when viewport is desktop-sized (>= 1024px).
 *
 * @example
 * const isDesktop = useIsDesktop()
 * if (isDesktop) return <FullSidebar />
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}

/**
 * Returns true when user prefers reduced motion.
 *
 * @example
 * const prefersReducedMotion = usePrefersReducedMotion()
 * const animationDuration = prefersReducedMotion ? 0 : 300
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/**
 * Returns true when user prefers dark color scheme.
 *
 * @example
 * const prefersDark = usePrefersDarkMode()
 */
export function usePrefersDarkMode(): boolean {
  return useMediaQuery('(prefers-color-scheme: dark)')
}
