/**
 * Editor extension tiers & Yjs schema-skew safety (exploration 0205).
 *
 * The editor is already a plugin architecture (TipTap), so "make the editor a
 * set of plugins" is mostly about drawing ONE line correctly:
 *
 *   SCHEMA extensions (TipTap Node + Mark) define the persisted document shape.
 *   With Yjs collaboration, every collaborator's editor MUST agree on this
 *   shape. If one client lacks a node/mark another client used, ProseMirror
 *   silently DROPS the unknown content — and with collab that corruption syncs
 *   without any error. Therefore schema extensions must be STATICALLY BUNDLED
 *   and identical across all collaborators — never lazy-loaded behind a route
 *   split or contributed by a plugin that only some peers have installed.
 *
 *   BEHAVIOR extensions (everything else: slash menu, drag handle, keymaps,
 *   decorations, toolbars, input rules without new schema) are safe to
 *   lazy-load and safe to contribute from a plugin — a peer without them just
 *   loses an affordance, not data.
 *
 * This module provides the drift-proof classifier (it inspects TipTap's own
 * `extension.type`, so it can never disagree with the actual schema) plus the
 * minimum required nodes a document cannot exist without.
 */

import type { AnyExtension } from '@tiptap/core'

/**
 * Nodes a ProseMirror/TipTap document cannot exist without. These must always
 * be present at editor construction (TipTap StarterKit provides them).
 */
export const REQUIRED_SCHEMA_NODES = ['doc', 'paragraph', 'text'] as const

/** A minimal structural view of a TipTap extension (Node/Mark/Extension). */
export interface ExtensionLike {
  /** TipTap sets this to 'node' | 'mark' | 'extension'. */
  type?: string
  /** TipTap extension name. */
  name?: string
}

/**
 * True if the extension defines persisted document schema (a Node or Mark).
 * Schema extensions are skew-sensitive — see the module doc.
 */
export function isSchemaExtension(ext: ExtensionLike): boolean {
  return ext?.type === 'node' || ext?.type === 'mark'
}

/** The extension's TipTap name, or 'unknown'. */
export function extensionName(ext: ExtensionLike): string {
  return ext?.name ?? 'unknown'
}

export interface PartitionedExtensions<T> {
  /** Skew-sensitive: must be bundled + identical across collaborators. */
  schema: T[]
  /** Skew-safe: lazy-loadable / plugin-contributable. */
  behavior: T[]
}

/**
 * Split extensions into schema (Node/Mark) vs behavior (everything else) so a
 * host can bundle the schema tier statically and lazy-load the behavior tier.
 */
export function partitionExtensions<T extends ExtensionLike>(
  extensions: readonly T[]
): PartitionedExtensions<T> {
  const schema: T[] = []
  const behavior: T[] = []
  for (const ext of extensions) {
    if (isSchemaExtension(ext)) schema.push(ext)
    else behavior.push(ext)
  }
  return { schema, behavior }
}

/**
 * Of a set of (plugin-contributed) extensions, return the names of those that
 * are schema-defining and therefore risk silent Yjs content loss if not every
 * collaborator has them. Empty array = safe to load dynamically.
 */
export function schemaSkewRisks(extensions: readonly AnyExtension[]): string[] {
  return extensions.filter(isSchemaExtension).map(extensionName)
}
