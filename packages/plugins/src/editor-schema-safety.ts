/**
 * Editor schema-skew guard for plugin contributions (exploration 0205).
 *
 * A plugin editor contribution whose TipTap extension is a Node or Mark changes
 * the PERSISTED document schema. Under Yjs collaboration, if some collaborators
 * have the plugin and others don't, ProseMirror silently drops the unknown
 * content and the corruption syncs without any error. Behavior-only extensions
 * (commands, keymaps, decorations, slash items) are skew-safe.
 *
 * This module classifies a plugin's editor contributions so the registry can
 * warn loudly in development. It mirrors `@xnetjs/editor`'s extension-tiers
 * classifier but lives here so the plugins package needs no editor dependency.
 */

import type { EditorContribution } from './contributions'

export interface EditorSchemaRisk {
  /** The contribution id. */
  id: string
  /** 'node' | 'mark' (the skew-sensitive kinds). */
  kind: string
  /** The TipTap extension name. */
  name: string
}

/** True if the extension defines persisted document schema (a Node or Mark). */
export function isSchemaDefiningExtension(ext: { type?: string }): boolean {
  return ext?.type === 'node' || ext?.type === 'mark'
}

/**
 * Of a plugin's editor contributions, return those that add persisted schema
 * and therefore risk silent Yjs content loss across version skew. Empty array
 * means the contributions are skew-safe.
 */
export function findEditorSchemaRisks(
  contributions: readonly EditorContribution[]
): EditorSchemaRisk[] {
  const risks: EditorSchemaRisk[] = []
  for (const c of contributions) {
    const ext = c.extension as { type?: string; name?: string }
    if (isSchemaDefiningExtension(ext)) {
      risks.push({ id: c.id, kind: ext.type ?? 'unknown', name: ext.name ?? 'unknown' })
    }
  }
  return risks
}

/**
 * Warn (in development) when a plugin's editor contributions add schema. Returns
 * the detected risks so callers can also gate or surface them.
 */
export function warnOnEditorSchemaRisks(
  pluginId: string,
  contributions: readonly EditorContribution[]
): EditorSchemaRisk[] {
  const risks = findEditorSchemaRisks(contributions)
  if (risks.length > 0 && process.env.NODE_ENV !== 'production') {
    for (const r of risks) {
      console.warn(
        `[plugins] '${pluginId}' editor contribution '${r.id}' adds a schema ${r.kind} ` +
          `('${r.name}'). Schema-defining extensions must be present for ALL collaborators ` +
          'or Yjs will silently drop content across version skew. Prefer behavior-only ' +
          'extensions, or ship schema nodes in the bundled core.'
      )
    }
  }
  return risks
}
