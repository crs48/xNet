/**
 * Shared client-side motion helpers for the marketing site's "performative UI"
 * accents (exploration 0223). Keep this tiny and dependency-free — it ships in
 * the small client bundles of the accent components.
 *
 * The taste rules these accents must pass live in
 * `src/components/ui/README.md` (the five-gate test). Every animation here is
 * opt-out via `prefersReducedMotion()`.
 */

/** True when the user has asked the OS to reduce motion. SSR-safe. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Run `cb(el)` once — the first time each element scrolls into view — then stop
 * observing it. Mirrors the IntersectionObserver pattern already used for
 * `.animate-on-scroll` in `layouts/Base.astro`.
 */
export function observeOnce(
  els: Iterable<Element>,
  cb: (el: Element) => void,
  options: IntersectionObserverInit = { threshold: 0.4 }
): void {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        cb(entry.target)
        io.unobserve(entry.target)
      }
    }
  }, options)
  for (const el of els) io.observe(el)
}

/**
 * Run `onEnter`/`onLeave` every time an element crosses the viewport edge — used
 * to pause expensive work (e.g. a canvas loop) while it is scrolled away.
 */
export function observeVisibility(
  el: Element,
  onEnter: () => void,
  onLeave: () => void,
  options: IntersectionObserverInit = {}
): void {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) onEnter()
      else onLeave()
    }
  }, options)
  io.observe(el)
}

/** easeOutCubic — fast start, gentle settle. Good default for count-ups. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)
