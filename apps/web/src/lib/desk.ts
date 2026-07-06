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
