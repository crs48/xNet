/**
 * Effective-schema resolution: core schema + its registered extension fields.
 *
 * Unlike database-derived schemas (which are resolved through the registry's
 * `remoteResolver`), extensions on *built-in* schemas can't ride the registry:
 * `SchemaRegistry.get` short-circuits built-ins before the resolver runs, and
 * effective schemas are dynamic — extensions can be added or removed at
 * runtime, so caching them in the registry would serve stale columns.
 *
 * Instead the effective schema is composed fresh at read time. The universal
 * grid (and any other consumer) calls `resolveEffectiveSchema` to get the core
 * schema plus its current extension fields, composed by `buildEffectiveSchema`.
 */

import type { NodeStore } from '../store/store'
import type { SchemaIRI } from './node'
import type { Schema, PropertyType } from './types'
import { getBaseSchemaIRI } from './node'
import { buildEffectiveSchema, type EffectiveExtensionField } from './effective-schema'
import {
  SCHEMA_EXTENSION_SCHEMA_IRI,
  EXTENSION_FIELD_SCHEMA_IRI
} from './schemas/schema-extension'

/** Minimal registry surface needed to resolve a core schema. */
export interface CoreSchemaResolver {
  get(iri: SchemaIRI): Promise<{ schema: Schema } | undefined>
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Load the extension fields registered for a target schema, ordered by their
 * fractional `sortKey`. Matches `SchemaExtension.targetSchema` against the
 * exact IRI and its unversioned base, so an extension declared against
 * `Contact` applies to `Contact@1.0.0` and vice versa.
 */
export async function loadExtensionFields(
  store: NodeStore,
  targetSchema: SchemaIRI
): Promise<EffectiveExtensionField[]> {
  const base = getBaseSchemaIRI(targetSchema)

  const extensionNodes = await store.list({ schemaId: SCHEMA_EXTENSION_SCHEMA_IRI })
  const authorityByExtensionId = new Map<string, string>()
  for (const node of extensionNodes) {
    if (node.deleted) continue
    const target = readString(node.properties.targetSchema)
    const authority = readString(node.properties.authority)
    if (!target || !authority) continue
    if (target === targetSchema || getBaseSchemaIRI(target as SchemaIRI) === base) {
      authorityByExtensionId.set(node.id, authority)
    }
  }
  if (authorityByExtensionId.size === 0) return []

  const fieldNodes = await store.list({ schemaId: EXTENSION_FIELD_SCHEMA_IRI })
  const collected: Array<{ sortKey: string; field: EffectiveExtensionField }> = []
  for (const node of fieldNodes) {
    if (node.deleted) continue
    const extensionId = readString(node.properties.extension)
    if (!extensionId) continue
    const authority = authorityByExtensionId.get(extensionId)
    if (!authority) continue
    const name = readString(node.properties.name)
    const type = readString(node.properties.type)
    if (!name || !type) continue
    const config =
      node.properties.config && typeof node.properties.config === 'object'
        ? (node.properties.config as Record<string, unknown>)
        : undefined
    collected.push({
      sortKey: readString(node.properties.sortKey) ?? '',
      field: { authority, name, type: type as PropertyType, ...(config ? { config } : {}) }
    })
  }

  collected.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
  return collected.map((entry) => entry.field)
}

/**
 * Resolve the effective schema for a node type: the canonical core schema
 * (from the registry) plus its registered extension fields. Returns `null`
 * when the core schema can't be resolved.
 */
export async function resolveEffectiveSchema(options: {
  store: NodeStore
  registry: CoreSchemaResolver
  schemaId: SchemaIRI
}): Promise<Schema | null> {
  const { store, registry, schemaId } = options
  const defined = await registry.get(schemaId)
  if (!defined) return null
  const extensions = await loadExtensionFields(store, schemaId)
  return buildEffectiveSchema(defined.schema, extensions)
}
