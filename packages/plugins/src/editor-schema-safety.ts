/**
 * Editor schema-skew guard for plugin contributions (exploration 0205,
 * re-based on BlockNote specs in 0312).
 *
 * A plugin editor contribution that registers block/inline/style SPECS
 * changes the PERSISTED document schema. Under Yjs collaboration, if some
 * collaborators have the plugin and others don't, the unknown content is
 * silently dropped and the corruption syncs without any error.
 * Behavior-only contributions (slash menu items) are skew-safe.
 *
 * The rule since 0312: schema specs must be statically bundled in
 * @xnetjs/editor's schema (its `XNET_SCHEMA_SPEC_NAMES` lists them). A
 * plugin may contribute a spec only when it's one of those bundled names
 * (gating the UI affordance, not the schema); anything else is flagged.
 */

import type { EditorContribution } from './contributions'

export interface EditorSchemaRisk {
  /** The contribution id. */
  id: string
  /** 'block' | 'inlineContent' | 'style' (the skew-sensitive kinds). */
  kind: string
  /** The spec name. */
  name: string
}

function collectSpecNames(
  contribution: EditorContribution
): Array<{ kind: string; name: string }> {
  return [
    ...Object.keys(contribution.blockSpecs ?? {}).map((name) => ({ kind: 'block', name })),
    ...Object.keys(contribution.inlineContentSpecs ?? {}).map((name) => ({
      kind: 'inlineContent',
      name
    })),
    ...Object.keys(contribution.styleSpecs ?? {}).map((name) => ({ kind: 'style', name }))
  ]
}

/** True if the contribution registers any persisted-schema specs. */
export function isSchemaDefiningContribution(contribution: EditorContribution): boolean {
  return collectSpecNames(contribution).length > 0
}

/**
 * Of a plugin's editor contributions, return the specs that add persisted
 * schema NOT statically bundled by the host editor (`bundledSpecNames`),
 * and therefore risk silent Yjs content loss across version skew. Empty
 * array means the contributions are skew-safe.
 */
export function findEditorSchemaRisks(
  contributions: readonly EditorContribution[],
  bundledSpecNames: readonly string[] = []
): EditorSchemaRisk[] {
  const bundled = new Set(bundledSpecNames)
  const risks: EditorSchemaRisk[] = []
  for (const c of contributions) {
    for (const spec of collectSpecNames(c)) {
      if (!bundled.has(spec.name)) {
        risks.push({ id: c.id, kind: spec.kind, name: spec.name })
      }
    }
  }
  return risks
}

/**
 * Warn (in development) when a plugin's editor contributions add schema
 * beyond the host's bundled specs. Returns the detected risks so callers
 * can also gate or surface them.
 */
export function warnOnEditorSchemaRisks(
  pluginId: string,
  contributions: readonly EditorContribution[],
  bundledSpecNames: readonly string[] = []
): EditorSchemaRisk[] {
  const risks = findEditorSchemaRisks(contributions, bundledSpecNames)
  if (risks.length > 0 && process.env.NODE_ENV !== 'production') {
    for (const r of risks) {
      console.warn(
        `[plugins] '${pluginId}' editor contribution '${r.id}' adds a schema ${r.kind} ` +
          `spec ('${r.name}') that is not statically bundled. Schema-defining specs must ` +
          'be present for ALL collaborators or Yjs will silently drop content across ' +
          'version skew. Ship schema specs in the bundled core and contribute only the ' +
          'UI affordance (slash menu items).'
      )
    }
  }
  return risks
}
