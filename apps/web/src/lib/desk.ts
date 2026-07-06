/**
 * The Desk (exploration 0273) — a per-identity home canvas.
 *
 * The Desk is an ordinary canvas node with a deterministic, identity-derived
 * id: provisioning is lazy (the node is created on first visit via
 * `useNode(..., { createIfMissing })`), idempotent across devices (same DID →
 * same id → LWW upsert, the devtools-seed move), and requires no registry of
 * "which node is my desk" — the id *is* the lookup.
 *
 * Pinning is a persisted queue in the workbench store: any surface can queue
 * a pin without loading the Desk's Y.Doc; the CanvasView drains the queue
 * through the normal ingestion path next time the Desk is on screen.
 */

const DESK_ID_PREFIX = 'desk-'

/** djb2 — tiny, stable, dependency-free; ids only need per-identity uniqueness. */
function stableHash(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

/** The deterministic Desk canvas id for an identity. */
export function deskIdFor(did: string): string {
  return `${DESK_ID_PREFIX}${stableHash(did)}`
}

/** Whether a canvas node id is a Desk (drives bounded pan, chips, projection). */
export function isDeskId(id: string): boolean {
  return id.startsWith(DESK_ID_PREFIX)
}

export const DESK_TITLE = 'Desk'

/**
 * Staged rollout flag (0273 Phase 4): while dogfooding, the quiet-surface
 * default for NEW identities (Desk startup + quiet chrome) is opt-in via this
 * key; existing users are never moved either way. Flipping the default after
 * the dogfood period = inverting this check.
 */
export const QUIET_DEFAULT_KEY = 'xnet:experiment:quiet-default'

export function isQuietDefaultEnabled(): boolean {
  try {
    return localStorage.getItem(QUIET_DEFAULT_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Long-press radial menu on Desk cards (0273 Phase 5, flagged). Marking-menu
 * research says ≤8 items, one level; we ship a conservative subset behind
 * this flag while the gesture grammar settles.
 */
export const DESK_RADIAL_KEY = 'xnet:experiment:desk-radial'

export function isDeskRadialEnabled(): boolean {
  try {
    return localStorage.getItem(DESK_RADIAL_KEY) === '1'
  } catch {
    return false
  }
}
