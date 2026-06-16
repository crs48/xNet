/**
 * Extension field operations — create / list / reorder / delete the custom
 * columns a user adds to an existing schema.
 *
 * These mirror `field-operations.ts` (which manage `DatabaseField` columns for
 * free-form databases) but operate on `ExtensionField` nodes keyed to a
 * `SchemaExtension`. The "+ Add field" affordance on a typed schema's grid
 * calls `createExtensionField`; core (schema-defined) columns are structurally
 * locked and routed nowhere — only extension fields are mutable.
 */

import type { SchemaIRI } from '../schema/node'
import type { NodeStore } from '../store/store'
import { extKey } from '../schema/extension'
import {
  SchemaExtensionSchema,
  ExtensionFieldSchema,
  schemaExtensionId
} from '../schema/schemas/schema-extension'
import { createNodeQueryDescriptor } from '../store/query'
import { isFieldType } from './field-types'
import { generateSortKeyWithJitter } from './fractional-index'

const EXTENSION_SCHEMA_ID = SchemaExtensionSchema.schema['@id']
const EXTENSION_FIELD_SCHEMA_ID = ExtensionFieldSchema.schema['@id']

export interface EnsureExtensionOptions {
  /** Versioned (or base) IRI of the schema being extended. */
  targetSchema: string
  /** Namespace authority that owns the overlay (Space id, DID, or domain). */
  authority: string
  /** Human label for the extension set. */
  label?: string
  /** Optional owning Space for the authorization cascade. */
  space?: string
}

/**
 * Ensure a `SchemaExtension` exists for `(authority, targetSchema)` and return
 * its id. Uses the deterministic id so repeated calls upsert rather than fork.
 */
export async function ensureSchemaExtension(
  store: NodeStore,
  options: EnsureExtensionOptions
): Promise<string> {
  const id = schemaExtensionId(options.authority, options.targetSchema)
  const existing = await store.get(id)
  if (existing && !existing.deleted) return id

  await store.create({
    id,
    schemaId: EXTENSION_SCHEMA_ID,
    properties: {
      targetSchema: options.targetSchema,
      authority: options.authority,
      ...(options.label !== undefined ? { label: options.label } : {}),
      ...(options.space !== undefined ? { space: options.space } : {})
    }
  })
  return id
}

export interface CreateExtensionFieldOptions {
  targetSchema: string
  authority: string
  /** Field token — the `<field>` segment; must be a valid extension field name. */
  name: string
  /** Field type (FieldType union). */
  type: string
  config?: Record<string, unknown>
  width?: number
  space?: string
}

/**
 * Add a custom column to a schema. Returns the new `ExtensionField` node id.
 * The resulting overlay property key on target nodes is
 * `ext:<authority>/<name>`.
 *
 * @throws if `type` is not a valid field type, or `name` is not a valid
 *   extension field token.
 */
export async function createExtensionField(
  store: NodeStore,
  options: CreateExtensionFieldOptions
): Promise<{ fieldId: string; key: string }> {
  if (!isFieldType(options.type)) {
    throw new Error(`Invalid field type: ${String(options.type)}`)
  }
  // Validates the token shape (throws on bad authority/field) and yields the
  // overlay key callers will read/write on target nodes.
  const key = extKey(options.authority, options.name)

  const extensionId = await ensureSchemaExtension(store, {
    targetSchema: options.targetSchema,
    authority: options.authority,
    ...(options.space !== undefined ? { space: options.space } : {})
  })

  const sortKey = await nextExtensionFieldSortKey(store, extensionId)

  const node = await store.create({
    schemaId: EXTENSION_FIELD_SCHEMA_ID,
    properties: {
      extension: extensionId,
      name: options.name,
      type: options.type,
      config: options.config ?? {},
      sortKey,
      ...(options.width !== undefined ? { width: options.width } : {}),
      ...(options.space !== undefined ? { space: options.space } : {})
    }
  })

  return { fieldId: node.id, key }
}

/** Rename an extension field's display token (does not change the stored key). */
export async function renameExtensionField(
  store: NodeStore,
  fieldId: string,
  name: string
): Promise<void> {
  await store.update(fieldId, { properties: { name } })
}

/** Delete (soft) an extension field. Does not remove overlay values on nodes. */
export async function deleteExtensionField(store: NodeStore, fieldId: string): Promise<void> {
  await store.delete(fieldId)
}

/** Next fractional sortKey after the current last extension field. */
async function nextExtensionFieldSortKey(store: NodeStore, extensionId: string): Promise<string> {
  const descriptor = createNodeQueryDescriptor(EXTENSION_FIELD_SCHEMA_ID as SchemaIRI, {
    where: { extension: extensionId },
    orderBy: { sortKey: 'desc' },
    limit: 1
  })
  const result = await store.query(descriptor)
  const last = result.nodes[0]?.properties.sortKey as string | undefined
  return generateSortKeyWithJitter(last, undefined)
}
