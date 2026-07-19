/**
 * useAnchoredPosition — place a floating element next to an anchor and keep it
 * there (exploration 0375).
 *
 * Extracted from the coachmark implementation, which was the only surface in
 * the app doing this correctly: measure the anchor, clamp the result inside the
 * viewport, and re-measure on scroll and resize so the card tracks its anchor
 * instead of stranding where it first rendered.
 *
 * The anchor is anything that can report a rect, so a DOM element and a
 * synthetic point (a canvas pin projected through the current viewport
 * transform) are the same thing to this hook:
 *
 *   const pos = useAnchoredPosition(anchorEl, 'right', cardRef)
 *
 * Callers render at `position: fixed` with the returned coordinates. `pos` is
 * null for the first frame — before the element has been measured there is no
 * honest answer — so render it invisible (or offscreen) until it arrives.
 */
import { useCallback, useLayoutEffect, useState } from 'react'

/** Anything that can report a viewport rect. `DOMRect` for elements, a
 *  synthesised one for coordinate anchors (canvas pins, text selections). */
export interface VirtualAnchor {
  getBoundingClientRect(): DOMRect
}

export type AnchorLike = HTMLElement | VirtualAnchor

export type AnchorSide = 'top' | 'right' | 'bottom' | 'left'

export interface AnchoredPosition {
  left: number
  top: number
}

/** Gap between anchor and floating element, in px. */
const GAP = 8
/** Minimum breathing room between the floating element and the viewport edge. */
const MARGIN = 8

/**
 * Place a `w`×`h` box beside `rect` on `side`, then clamp it into the viewport.
 *
 * Clamping rather than flipping is deliberate: a comment island that flips
 * across its anchor mid-scroll is more disorienting than one that slides. The
 * anchor stays visible either way because the gap is small.
 */
export function placeAnchored(
  rect: DOMRect,
  side: AnchorSide,
  w: number,
  h: number,
  viewport: { width: number; height: number }
): AnchoredPosition {
  let left: number
  let top: number

  switch (side) {
    case 'right':
      left = rect.right + GAP
      top = rect.top
      break
    case 'left':
      left = rect.left - GAP - w
      top = rect.top
      break
    case 'top':
      left = rect.left
      top = rect.top - GAP - h
      break
    case 'bottom':
    default:
      left = rect.left
      top = rect.bottom + GAP
      break
  }

  // If the preferred side would push the box off the far edge, mirror it to the
  // other side of the anchor rather than letting the clamp cover the anchor.
  if (side === 'right' && left + w > viewport.width - MARGIN) {
    left = rect.left - GAP - w
  } else if (side === 'left' && left < MARGIN) {
    left = rect.right + GAP
  } else if (side === 'bottom' && top + h > viewport.height - MARGIN) {
    top = rect.top - GAP - h
  } else if (side === 'top' && top < MARGIN) {
    top = rect.bottom + GAP
  }

  left = Math.max(MARGIN, Math.min(left, viewport.width - w - MARGIN))
  top = Math.max(MARGIN, Math.min(top, viewport.height - h - MARGIN))

  return { left, top }
}

/**
 * Track `anchor`, returning fixed-position coordinates for the element at
 * `ref`. Returns null until the element has been measured.
 *
 * The scroll listener is registered in the capture phase so nested scroll
 * containers (the editor body, a virtualised grid) also trigger a re-measure —
 * scroll events from those do not bubble to window.
 */
export function useAnchoredPosition(
  anchor: AnchorLike | null,
  side: AnchorSide,
  ref: React.RefObject<HTMLElement | null>
): AnchoredPosition | null {
  const [pos, setPos] = useState<AnchoredPosition | null>(null)

  const reposition = useCallback(() => {
    const el = ref.current
    if (!el || !anchor) return
    const box = el.getBoundingClientRect()
    setPos(
      placeAnchored(anchor.getBoundingClientRect(), side, box.width, box.height, {
        width: window.innerWidth,
        height: window.innerHeight
      })
    )
  }, [anchor, side, ref])

  useLayoutEffect(() => {
    if (!anchor) {
      setPos(null)
      return
    }
    reposition()
    window.addEventListener('resize', reposition, { passive: true })
    window.addEventListener('scroll', reposition, { capture: true, passive: true })
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, { capture: true })
    }
  }, [anchor, reposition])

  return pos
}
