/**
 * @xnetjs/plugins — importer resolution (exploration 0189).
 *
 * Consumer-side helpers for the `importers` contribution point: pull the adapter
 * objects out of plugin contributions, and merge them with a set of built-in
 * importers (deduped by id — a plugin-contributed importer overrides a built-in
 * with the same id). Kept generic and adapter-shape-agnostic so the social
 * import flow (or any importer host) can call it without `@xnetjs/plugins`
 * depending on `@xnetjs/social`.
 */

import type { ImporterContribution } from './contributions'

/** The adapter objects carried by importer contributions (opaque to the registry). */
export function importerAdapters(contributions: readonly ImporterContribution[]): unknown[] {
  return contributions.map((c) => c.adapter)
}

/**
 * Merge built-in importer adapters with contributed ones, deduped by `id`. A
 * contributed importer with the same id as a built-in overrides it (so a plugin
 * can replace a first-party importer). The consumer casts the result to its own
 * importer-adapter type.
 */
export function resolveImporters<A extends { id: string }>(
  builtIns: readonly A[],
  contributed: readonly A[]
): A[] {
  const byId = new Map<string, A>()
  for (const adapter of builtIns) byId.set(adapter.id, adapter)
  for (const adapter of contributed) byId.set(adapter.id, adapter)
  return [...byId.values()]
}
