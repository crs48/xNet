/**
 * Effective-schema composition: core schema + registered extension fields.
 *
 * The *effective* schema is what the universal database grid renders. It is
 * the core schema's properties (structurally locked) followed by the
 * extension fields (editable, namespaced as `ext:<authority>/<field>`).
 *
 * "Locked" is structural, not value-level: the grid must not let a user
 * rename, retype, or delete a core column (those keys are encoded in the
 * schema), but cell *values* stay editable. Extension fields carry no lock,
 * so they can be renamed/retyped/deleted freely by whoever owns the overlay.
 */

import type { Schema, PropertyDefinition, PropertyType } from './types'
import { extKey } from './extension'

/**
 * A normalized extension field, independent of how it was stored (an
 * `ExtensionField` node, a `StoredColumn`, etc.).
 */
export interface EffectiveExtensionField {
  /** Namespace authority that owns the field */
  authority: string
  /** Field token (the `<field>` segment) */
  name: string
  /** Property type */
  type: PropertyType
  /** Type-specific configuration */
  config?: Record<string, unknown>
}

/**
 * Compose an effective schema from a core schema and its extension fields.
 *
 * - Core properties are returned first, each marked `readonly: true`
 *   (structurally locked) when there is at least one extension.
 * - Extension fields follow, named `ext:<authority>/<field>`, never readonly.
 *
 * When there are no extensions the core schema is returned unchanged (no
 * spurious lock flags), so callers can pass any schema through unconditionally.
 */
export function buildEffectiveSchema(
  core: Schema,
  extensions: EffectiveExtensionField[]
): Schema {
  if (extensions.length === 0) return core

  const lockedCore: PropertyDefinition[] = core.properties.map((property) => ({
    ...property,
    readonly: true
  }))

  const extensionProperties: PropertyDefinition[] = extensions.map((field) => {
    const key = extKey(field.authority, field.name)
    return {
      '@id': `${core['@id']}#${key}`,
      name: key,
      type: field.type,
      required: false,
      readonly: false,
      ...(field.config ? { config: field.config } : {})
    }
  })

  return { ...core, properties: [...lockedCore, ...extensionProperties] }
}

/** Property keys on a schema that are structurally locked (readonly columns). */
export function lockedPropertyKeys(schema: Schema): string[] {
  return schema.properties.filter((property) => property.readonly).map((property) => property.name)
}

/**
 * Whether a structural column operation (rename / retype / delete) is allowed
 * on the given property of the effective schema. Locked (core) columns return
 * false; extension and ordinary columns return true. Unknown keys also return
 * false — you can't restructure a column the schema doesn't declare.
 */
export function canModifyColumn(schema: Schema, propertyName: string): boolean {
  const property = schema.properties.find((entry) => entry.name === propertyName)
  if (!property) return false
  return property.readonly !== true
}

/**
 * Validate a set of structural column operations against the effective schema,
 * returning the keys that may NOT be restructured (locked core columns). An
 * empty array means every requested column op is permitted.
 */
export function findLockedColumns(schema: Schema, propertyNames: Iterable<string>): string[] {
  const locked = new Set(lockedPropertyKeys(schema))
  const violations: string[] = []
  for (const name of propertyNames) {
    if (locked.has(name)) violations.push(name)
  }
  return violations
}
