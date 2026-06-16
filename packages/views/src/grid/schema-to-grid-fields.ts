/**
 * Schema → grid columns adapter.
 *
 * Turns any `Schema` (a built-in typed schema, a database-derived schema, or
 * an effective schema with extension fields) into the `GridField[]` the grid
 * surface renders. This is the read direction counterpart of
 * `fieldsToStoredColumns` (`packages/data/src/database/schema-from-fields.ts`),
 * and it is what lets the universal database view render *any* node type — not
 * just free-form `DatabaseRow`s.
 *
 * Each `GridField.id` is the schema property *key* (e.g. `title`,
 * `ext:acme.com/leadScore`), which is also the node property key — so grid
 * cell edits map straight back to node properties with no translation layer.
 */

import type { Schema, PropertyDefinition, FieldType } from '@xnetjs/data'
import { parseExtKey } from '@xnetjs/data'
import type { GridField, GridFieldOption } from './model.js'

/** Default column width when the schema carries none. */
const DEFAULT_WIDTH = 180

export interface SchemaToGridFieldsOptions {
  /**
   * Property key to treat as the title column. When omitted, the first
   * property named `title` or `name` is used, falling back to the first
   * property of a text-like type.
   */
  titleField?: string
  /** Hide auto-populated columns (created/updated/createdBy). Default false. */
  hideAutoFields?: boolean
}

const AUTO_TYPES = new Set<FieldType>(['created', 'updated', 'createdBy'])
const TITLE_CANDIDATE_TYPES = new Set<FieldType>(['text', 'url', 'email'])

/** A human display label for a property key (extension keys show their field token). */
export function displayLabelForProperty(property: PropertyDefinition): string {
  const parsed = parseExtKey(property.name)
  if (parsed) return parsed.field
  return property.name
}

function optionsFromConfig(
  config: Record<string, unknown> | undefined
): GridFieldOption[] | undefined {
  const raw = config?.options
  if (!Array.isArray(raw)) return undefined
  const options: GridFieldOption[] = []
  for (const entry of raw) {
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>
      if (typeof obj.id === 'string' && typeof obj.name === 'string') {
        options.push({
          id: obj.id,
          name: obj.name,
          ...(typeof obj.color === 'string' ? { color: obj.color } : {})
        })
      }
    }
  }
  return options.length > 0 ? options : undefined
}

function pickTitleKey(properties: PropertyDefinition[], explicit?: string): string | undefined {
  if (explicit && properties.some((p) => p.name === explicit)) return explicit
  const named = properties.find((p) => p.name === 'title' || p.name === 'name')
  if (named) return named.name
  const textish = properties.find((p) => TITLE_CANDIDATE_TYPES.has(p.type as FieldType))
  return textish?.name ?? properties[0]?.name
}

/**
 * Convert a schema's property definitions into grid columns.
 *
 * The `readonly` flag is carried through verbatim from the property
 * definition, so columns locked by `buildEffectiveSchema` render as
 * structurally locked in the grid.
 */
export function schemaToGridFields(
  schema: Schema,
  options: SchemaToGridFieldsOptions = {}
): GridField[] {
  const source = options.hideAutoFields
    ? schema.properties.filter((p) => !AUTO_TYPES.has(p.type as FieldType))
    : schema.properties

  const titleKey = pickTitleKey(source, options.titleField)

  return source.map((property) => {
    const config = (property.config as Record<string, unknown> | undefined) ?? {}
    const width = typeof config.width === 'number' ? config.width : DEFAULT_WIDTH
    const fieldOptions = optionsFromConfig(config)
    const field: GridField = {
      id: property.name,
      name: displayLabelForProperty(property),
      type: property.type as FieldType,
      config,
      width,
      isTitle: property.name === titleKey,
      ...(fieldOptions ? { options: fieldOptions } : {}),
      ...(property.readonly ? { readonly: true } : {})
    }
    return field
  })
}
