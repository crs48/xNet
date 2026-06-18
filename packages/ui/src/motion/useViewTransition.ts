/**
 * useViewTransition — clean cross-fades for discrete UI swaps, zero library.
 *
 * Wraps the native View Transitions API (`document.startViewTransition`). The
 * browser snapshots the page before and after your DOM mutation and cross-
 * fades between them; opt individual elements into shared-element motion with
 * `view-transition-name`. Where the API is missing (older Firefox) or the user
 * prefers reduced motion, it degrades to an instant, un-animated mutation —
 * never an error.
 *
 *   const withTransition = useViewTransition()
 *   const reScope = (id: string) => withTransition(() => setCurrentSpace(id))
 *
 * Use it for discrete, user-initiated swaps (re-scoping a list, switching a
 * surface), not high-frequency updates.
 */
import { usePrefersReducedMotion } from '../hooks/useMediaQuery'

/**
 * Minimal structural view of the API. Standalone (does not extend `Document`)
 * so it never collides with whichever lib.dom version is in play, and keeps
 * `startViewTransition` optional so feature-detection and test teardown
 * (`delete`) typecheck cleanly.
 */
type ViewTransitionCapable = { startViewTransition?: (callback: () => void) => unknown }

function viewTransitionDoc(): ViewTransitionCapable | null {
  if (typeof document === 'undefined') return null
  return document as unknown as ViewTransitionCapable
}

/** True when the running browser supports the View Transitions API. */
export function supportsViewTransitions(): boolean {
  return typeof viewTransitionDoc()?.startViewTransition === 'function'
}

/**
 * Run `mutate` inside a view transition when supported, else run it directly.
 * Reduced-motion-unaware (no hook context) — prefer {@link useViewTransition}
 * inside components.
 */
export function startViewTransition(mutate: () => void): void {
  const doc = viewTransitionDoc()
  if (!doc?.startViewTransition) {
    mutate()
    return
  }
  doc.startViewTransition(mutate)
}

/**
 * Returns a `withTransition(mutate)` function that cross-fades the DOM mutation
 * when the browser supports it AND the user has not requested reduced motion;
 * otherwise applies the mutation instantly.
 */
export function useViewTransition(): (mutate: () => void) => void {
  const reduced = usePrefersReducedMotion()
  return (mutate: () => void) => {
    if (reduced) {
      mutate()
      return
    }
    startViewTransition(mutate)
  }
}
