/**
 * Resolve a coachmark anchor selector to a live element (exploration 0206).
 *
 * Returns the matching element, or null if it isn't in the DOM yet. A view
 * often renders a frame after navigation, so we watch with a MutationObserver
 * and resolve as soon as the anchor appears — and re-resolve to null if it
 * later leaves the DOM (so a stale tip doesn't float over nothing).
 */
import { useEffect, useState } from 'react'

export function useAnchorEl(selector: string | null): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!selector || typeof document === 'undefined') {
      setEl(null)
      return
    }

    const resolve = () => setEl(document.querySelector<HTMLElement>(selector))
    resolve()

    const observer = new MutationObserver(resolve)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [selector])

  return el
}
