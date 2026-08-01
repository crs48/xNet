/**
 * Handing a saved lens from the Data Workspace to a canvas (exploration 0419).
 *
 * The desktop app could already do this because its canvas is always mounted:
 * the workspace calls a ref and the frame appears. The web app routes between
 * `/data` and `/canvas/:id`, so the canvas that should receive the frame does
 * not exist yet at the moment the user asks for it.
 *
 * This is the smallest thing that closes that gap: park the request, navigate,
 * and let the canvas claim it on arrival. Parking is in `sessionStorage` so a
 * full page load on the way still finds it, with an in-memory fallback for
 * environments that have no storage.
 *
 * A parked request is claimed exactly once. Leaving it in place would mean a
 * frame reappearing every time the user revisited that canvas, which reads as
 * the app duplicating their work.
 */

import type { SocialCanvasProjectionPlan } from '@xnetjs/social'

const STORAGE_KEY = 'xnet:views:pending-canvas-lens'

export type PendingCanvasLens = {
  /** Canvas the lens should land on. */
  canvasId: string
  /** Saved view id. */
  viewId: string
  title: string
  /** Serialized `SavedViewDescriptor`. */
  descriptorJson: string | null
  /**
   * A laid-out projection to place instead of a live query frame.
   *
   * Serializable by construction — the plan is plain data — which is what
   * lets the request survive a full page load between the two routes.
   */
  projection?: SocialCanvasProjectionPlan
}

/** In-memory fallback for environments without `sessionStorage`. */
let memoryPending: PendingCanvasLens | null = null

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    // Storage access throws in some sandboxed contexts rather than being absent.
    return null
  }
}

export function stashPendingCanvasLens(pending: PendingCanvasLens): void {
  memoryPending = pending
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(pending))
  } catch {
    // Memory already holds it; a quota or privacy-mode failure is not worth
    // failing the user's action over.
  }
}

function readPending(): PendingCanvasLens | null {
  const raw = (() => {
    try {
      return storage()?.getItem(STORAGE_KEY) ?? null
    } catch {
      return null
    }
  })()

  if (!raw) return memoryPending

  try {
    const parsed = JSON.parse(raw) as PendingCanvasLens
    if (typeof parsed?.canvasId !== 'string' || typeof parsed?.viewId !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function clearPending(): void {
  memoryPending = null
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do; the in-memory copy is already gone.
  }
}

/**
 * Claim the parked lens for a canvas, if one is waiting for it.
 *
 * Returns `null` when nothing is parked or when what is parked belongs to a
 * different canvas — in which case it is left alone, so opening an unrelated
 * canvas on the way does not swallow the request.
 */
export function takePendingCanvasLens(canvasId: string): PendingCanvasLens | null {
  const pending = readPending()
  if (!pending || pending.canvasId !== canvasId) return null

  clearPending()
  return pending
}

/** Drop any parked lens. Exported for tests and for cancel paths. */
export function clearPendingCanvasLens(): void {
  clearPending()
}
