/**
 * Slot-drag lifecycle (exploration 0282, research pattern 3).
 *
 * HTML5 DnD only tells the element under the cursor about a drag; the
 * shell needs the OPPOSITE — while any slot view is being dragged, every
 * dock (including closed ones) must materialize as a visible drop target.
 * This tiny store broadcasts "a slot drag is in flight" to whoever
 * renders targets, the way `setNodeTransfer` carries node drags.
 *
 * The window `dragend`/`drop` listeners are the safety net: `dragend`
 * fires on the SOURCE element even for cancelled drags, but a source
 * unmounted mid-drag (its dock re-rendered) would otherwise leave the
 * shell stuck in drag dress.
 */
import { useSyncExternalStore } from 'react'

export interface ActiveSlotDrag {
  viewId: string
}

type Listener = () => void

let active: ActiveSlotDrag | null = null
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function beginSlotDrag(viewId: string): void {
  active = { viewId }
  emit()
}

export function endSlotDrag(): void {
  if (!active) return
  active = null
  emit()
}

export function activeSlotDrag(): ActiveSlotDrag | null {
  return active
}

if (typeof window !== 'undefined') {
  window.addEventListener('dragend', endSlotDrag)
  window.addEventListener('drop', endSlotDrag)
}

/** The in-flight slot drag, or null. Re-renders on begin/end only. */
export function useSlotDragActive(): ActiveSlotDrag | null {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    activeSlotDrag,
    () => null
  )
}

// ─── Landing flash (research pattern 7) ─────────────────────────────

const FLASH_MS = 700

let landingRegion: string | null = null
let landingTimer: ReturnType<typeof setTimeout> | undefined

/** Record where a drop landed so that dock can flash (motion-safe). */
export function markSlotLanding(region: string): void {
  landingRegion = region
  emit()
  clearTimeout(landingTimer)
  landingTimer = setTimeout(() => {
    landingRegion = null
    emit()
  }, FLASH_MS)
}

/** Whether this region should currently render its landing flash. */
export function useSlotLanding(region: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    () => landingRegion === region,
    () => false
  )
}
