/**
 * Explorer space scoping (exploration 0190) — pure and unit-tested.
 *
 * One persisted "primary" scope (`currentSpaceId`) drives identity, the
 * breadcrumb, and the create target; an optional multi-select `spaceFilter`
 * widens the *view* without changing the create target. This module is the
 * single source of truth for "does this node belong in the current view" and
 * for the toggle math that moves between single-scope and multi-filter.
 */

/** Sentinel scope: items that belong to no Space at all ("No workspace"). */
export const NO_SPACE = '__none__'

/** Normalize a node's `space` to a comparable scope key (NO_SPACE for space-less). */
export function scopeKeyOf(space: string | null | undefined): string {
  return space && space.length > 0 ? space : NO_SPACE
}

/** Is a scope a real Space id (not All / `null`, not the No-workspace sentinel)? */
export function isRealSpace(scope: string | null): scope is string {
  return scope !== null && scope !== NO_SPACE
}

/** A node's Space id from a query result, or null when it belongs to no Space. */
export function nodeSpaceId(
  nodeId: string,
  nodes: Array<{ id: string; space?: string }> | null | undefined
): string | null {
  const node = (nodes ?? []).find((entry) => entry.id === nodeId)
  const space = typeof node?.space === 'string' ? node.space : ''
  return space.length > 0 ? space : null
}

/**
 * Does a node with this `space` belong in the current view?
 * - `filter` non-empty (multi mode): the node's scope key must be in the filter.
 * - else `scope === null` (All): everything matches.
 * - else single scope: the node's scope key must equal it (NO_SPACE = space-less).
 */
export function matchesScope(
  space: string | null | undefined,
  scope: string | null,
  filter: readonly string[] = []
): boolean {
  if (filter.length > 0) return filter.includes(scopeKeyOf(space))
  if (scope === null) return true
  return scopeKeyOf(space) === scope
}

export interface ScopeSelection {
  /** Primary scope: identity + create target. `null` = All. */
  scope: string | null
  /** Multi-select view filter (empty = follow `scope`). */
  filter: string[]
}

/**
 * Toggle a Space chip, returning the next selection.
 * - `additive` false (plain click): single scope = id, filter cleared.
 * - `additive` true (cmd/ctrl-click): toggle id in the multi set (seeded from
 *   the current single real scope). Collapses back to single scope at ≤1, so
 *   the create target is always an unambiguous Space.
 */
export function toggleScopeSelection(
  current: ScopeSelection,
  id: string,
  additive: boolean
): ScopeSelection {
  if (!additive) return { scope: id, filter: [] }

  const seed =
    current.filter.length > 0 ? current.filter : isRealSpace(current.scope) ? [current.scope] : []
  const set = new Set(seed)
  if (set.has(id)) set.delete(id)
  else set.add(id)

  const next = [...set]
  if (next.length <= 1) return { scope: next[0] ?? null, filter: [] }
  // Keep the existing primary if it survives, else promote the first.
  const primary = current.scope && next.includes(current.scope) ? current.scope : next[0]
  return { scope: primary, filter: next }
}
