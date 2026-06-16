/**
 * Sidecar extensions — the join-node form of schema extension.
 *
 * Where an on-record *overlay* (`ext:` namespace) stores custom attributes on
 * the target node itself (and therefore inherits the node's authorization), a
 * *sidecar* is a separate node that references the target and carries its own
 * authorization. Use a sidecar when the attributes need a different owner or
 * different access — e.g. *your* private CRM notes on a `Contact` someone else
 * owns and shares with you.
 *
 * A sidecar schema is ordinary user code (a `defineSchema` with a
 * `target: relation(...)` and its own `authorization`, typically
 * `presets.private()`); this module supplies the shared conventions: a
 * deterministic id (so one sidecar per `(authority, target)` upserts, mirroring
 * `SpaceMembership`/`Grant`) and a merge that folds a sidecar's attributes into
 * the logical grid row under the same `ext:<authority>/<field>` keys overlays
 * use — so the universal grid renders overlay and sidecar columns uniformly.
 */

import { extKey } from './extension'

/** Reserved prefix for deterministic sidecar node ids. */
export const SIDECAR_PREFIX = 'sidecar:'

/**
 * Deterministic id for a sidecar so re-creating the sidecar for the same
 * `(authority, targetId)` upserts instead of forking a second one.
 *
 * @example
 * sidecarId('did:key:z6Mk…', 'contact1') // => 'sidecar:did:key:z6Mk…:contact1'
 */
export function sidecarId(authority: string, targetId: string): string {
  return `${SIDECAR_PREFIX}${authority}:${targetId}`
}

/** Property keys that are structural to a sidecar and must not surface as columns. */
const RESERVED_SIDECAR_KEYS = new Set(['target', 'space'])

export interface SidecarOverlay {
  /** Namespace authority of this sidecar (becomes the ext: key authority). */
  authority: string
  /** The sidecar node's properties. */
  properties: Record<string, unknown>
  /** Extra keys to exclude beyond the structural defaults (`target`, `space`). */
  exclude?: Iterable<string>
}

/**
 * Project a sidecar's attributes into namespaced overlay keys
 * (`ext:<authority>/<field>`), skipping structural keys. The result merges
 * into a logical row exactly like on-record overlay values, so the grid treats
 * both uniformly.
 */
export function sidecarOverlayKeys(overlay: SidecarOverlay): Record<string, unknown> {
  const excluded = new Set(RESERVED_SIDECAR_KEYS)
  for (const key of overlay.exclude ?? []) excluded.add(key)

  const out: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(overlay.properties)) {
    if (excluded.has(field)) continue
    // Skip keys that aren't valid field tokens (e.g. already-namespaced).
    try {
      out[extKey(overlay.authority, field)] = value
    } catch {
      // ignore un-projectable keys
    }
  }
  return out
}

/**
 * Merge a base row's properties with one or more sidecars, folding each
 * sidecar's attributes in under `ext:<authority>/<field>` keys. Base properties
 * win on direct key collisions; sidecars are applied in order.
 */
export function mergeSidecarsIntoRow(
  baseProps: Record<string, unknown>,
  sidecars: SidecarOverlay[]
): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const sidecar of sidecars) {
    Object.assign(merged, sidecarOverlayKeys(sidecar))
  }
  // Base wins over sidecar projections on any shared key.
  return { ...merged, ...baseProps }
}
