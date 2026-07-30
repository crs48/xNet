/**
 * Pure adapters mapping store nodes + schemas onto the @xnetjs/views grid model.
 *
 * Kept free of React so the column/cell derivation is unit-testable and the
 * Data panel stays a thin wrapper over the real database grid (GridSurface).
 */

import type {
  CellValue,
  ColumnDefinition,
  FieldType,
  NodeQueryResult,
  NodeState,
  PropertyDefinition,
  PropertyType,
  Schema
} from '@xnetjs/data'
import type { GridField, GridFieldOption, GridRowData } from '@xnetjs/views'
import { truncateDID } from '../../utils/formatters'

/** Synthetic column ids for the always-present system columns (id, schema, …).
 *  Prefixed so they can never collide with a real node property key. */
export const SYSTEM_FIELD = {
  id: '@@id',
  schema: '@@schema',
  updated: '@@updatedAt',
  author: '@@createdBy'
} as const

/** Schema property types that are surfaced as dedicated system columns. */
const AUTO_PROPERTY_TYPES: ReadonlySet<PropertyType> = new Set(['created', 'updated', 'createdBy'])

/** Property types with a safe inline grid editor. Relation/person/file need
 *  pickers we don't provide, and json/rollup/formula are computed or structured —
 *  so those stay read-only even in edit mode. */
const INLINE_EDITABLE_TYPES: ReadonlySet<PropertyType> = new Set([
  'text',
  'number',
  'checkbox',
  'select',
  'multiSelect',
  'date',
  'dateRange',
  'url',
  'email',
  'phone'
])

/** Map a schema PropertyType onto a grid FieldType. The unions mostly overlap;
 *  `json` has no grid renderer, so it falls back to plain text. */
export function propertyTypeToFieldType(type: PropertyType): FieldType {
  if (type === 'json') return 'text'
  return type as FieldType
}

function optionsFor(prop: PropertyDefinition): GridFieldOption[] | undefined {
  const raw = (prop.config as { options?: unknown } | undefined)?.options
  if (!Array.isArray(raw)) return undefined
  const options: GridFieldOption[] = []
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && 'id' in entry && 'name' in entry) {
      const opt = entry as { id: unknown; name: unknown; color?: unknown }
      if (typeof opt.id === 'string' && typeof opt.name === 'string') {
        options.push({
          id: opt.id,
          name: opt.name,
          color: typeof opt.color === 'string' ? opt.color : undefined
        })
      }
    }
  }
  return options.length > 0 ? options : undefined
}

/**
 * Build the grid columns for a (possibly null) schema. With a known schema we
 * render real typed columns; without one (the "All schemas" view, or an
 * unregistered schema) we synthesize plain-text columns from observed keys.
 *
 * `editable` unlocks the inline-editable property columns (system columns and
 * relation/person/file/computed columns stay locked). It only has an effect
 * with a known schema — synthesized columns are never editable because we don't
 * know their real type.
 */
/** Hover reason for the always-read-only system columns (id/schema/updated/…). */
const SYSTEM_READONLY_REASON = 'System field — read-only'

export function buildGridFields(
  schema: Schema | null,
  observedKeys: string[],
  showSchemaColumn: boolean,
  editable = false
): GridField[] {
  const fields: GridField[] = [
    {
      id: SYSTEM_FIELD.id,
      name: 'ID',
      type: 'text',
      config: {},
      width: 130,
      readonly: true,
      readonlyReason: SYSTEM_READONLY_REASON,
      isTitle: true
    }
  ]
  if (showSchemaColumn) {
    fields.push({
      id: SYSTEM_FIELD.schema,
      name: 'Schema',
      type: 'text',
      config: {},
      width: 150,
      readonly: true,
      readonlyReason: SYSTEM_READONLY_REASON
    })
  }

  if (schema) {
    for (const prop of schema.properties) {
      if (AUTO_PROPERTY_TYPES.has(prop.type)) continue // shown as system columns below
      const typeInlineEditable = INLINE_EDITABLE_TYPES.has(prop.type)
      let type = propertyTypeToFieldType(prop.type)
      let options: GridFieldOption[] | undefined
      let missingOptions = false
      if (type === 'select' || type === 'multiSelect') {
        options = optionsFor(prop)
        // Never hand a select cell renderer a value with no options — render
        // the raw value as text instead, and lock it (we can't offer choices).
        if (!options) {
          type = 'text'
          missingOptions = true
        }
      }
      // Resolve the lock + a hover reason that explains *why* it's read-only,
      // so editability is legible even when authorization isn't enforced.
      let readonly = true
      let readonlyReason: string | undefined
      if (!typeInlineEditable) {
        readonlyReason = `${prop.type} fields can't be edited inline here`
      } else if (missingOptions) {
        readonlyReason = `This ${prop.type} field has no options to choose from`
      } else if (!editable) {
        readonlyReason = 'Turn on editing (top toolbar) to modify this field'
      } else {
        readonly = false
      }
      fields.push({
        id: prop.name,
        name: prop.name,
        type,
        config: prop.config ?? {},
        width: 170,
        options,
        readonly,
        readonlyReason
      })
    }
  } else {
    for (const key of observedKeys) {
      fields.push({
        id: key,
        name: key,
        type: 'text',
        config: {},
        width: 170,
        readonly: true,
        readonlyReason: "This schema isn't loaded, so its columns are read-only here"
      })
    }
  }

  fields.push({
    // An `updated` column (cell = epoch ms) so it sorts/filters chronologically
    // (a text locale string would sort lexicographically). `updated` over `date`
    // because its operator set is before/after/between — `date` would also offer
    // `equals`, which compares the epoch number against the picker's date string
    // and silently matches nothing.
    id: SYSTEM_FIELD.updated,
    name: 'Updated',
    type: 'updated',
    config: {},
    width: 170,
    readonly: true,
    readonlyReason: SYSTEM_READONLY_REASON
  })
  fields.push({
    id: SYSTEM_FIELD.author,
    name: 'Author',
    type: 'text',
    config: {},
    width: 130,
    readonly: true,
    readonlyReason: SYSTEM_READONLY_REASON
  })
  return fields
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const n = Number(value)
  return value !== '' && Number.isFinite(n) ? n : null
}

/**
 * Coerce an arbitrary node property value into the CellValue shape the grid's
 * renderer for `type` expects. Each built-in renderer wants a specific shape:
 * number/date renderers want a number, checkbox a boolean, dateRange a
 * `{start,end}` object, relation/person/multiSelect a string[], file a FileRef
 * object — and the text-family renderers call string methods (e.g. `.replace`),
 * so those must receive a string. Feeding the wrong shape renders broken cells
 * ("Invalid Date", "Empty", raw JSON), so coerce per type rather than blanket
 * stringifying.
 */
export function coerceCellValueForType(value: unknown, type: FieldType): CellValue {
  if (value == null) return null
  switch (type) {
    case 'number':
      return toNumberOrNull(value)
    case 'date': {
      // date cells render from an epoch number; accept numbers, numeric strings,
      // and ISO date strings (the inline editor may emit any of these).
      const n = toNumberOrNull(value)
      if (n != null) return n
      const parsed = Date.parse(String(value))
      return Number.isFinite(parsed) ? parsed : null
    }
    case 'checkbox':
      return typeof value === 'boolean' ? value : Boolean(value)
    case 'dateRange':
      return isObject(value) && 'start' in value && 'end' in value
        ? (value as unknown as CellValue)
        : null
    case 'geo':
      return isObject(value) && 'lat' in value && 'lng' in value
        ? (value as unknown as CellValue)
        : null
    case 'file':
      return isObject(value) && 'cid' in value ? (value as unknown as CellValue) : null
    case 'multiSelect':
    case 'relation':
    case 'person':
      // These renderers expect an array; wrap a lone value so it still shows.
      return Array.isArray(value) ? value.map(String) : [safeStringify(value)]
    default:
      // text-family (text/url/email/phone/select/createdBy/json/…) renders from
      // a string; stringify so a string method never lands on a non-string.
      return safeStringify(value)
  }
}

/** Generic coercion (no field type) — kept for callers that just need a CellValue. */
export function coerceCellValue(value: unknown): CellValue {
  if (value == null) return null
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return value as CellValue
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value as string[]
  return safeStringify(value)
}

/** A grid row that also carries the `sortKey` the sort engine needs. */
export type DataGridRow = GridRowData & { sortKey: string }

/**
 * Map a node to a grid row with system + property cells (keyed by field id).
 * `fieldTypeById` lets each property cell be coerced to its column's type.
 * Carries `sortKey` (the node id) so the sort engine has a stable tiebreak.
 */
export function nodeToGridRow(
  node: NodeState,
  fieldTypeById: ReadonlyMap<string, FieldType> = new Map()
): DataGridRow {
  const cells: Record<string, CellValue> = {
    [SYSTEM_FIELD.id]: node.id,
    [SYSTEM_FIELD.schema]: node.schemaId.split('/').pop() ?? node.schemaId,
    // Epoch ms so the `date` column sorts/filters chronologically; the grid's
    // date renderer formats it for display.
    [SYSTEM_FIELD.updated]: node.updatedAt,
    [SYSTEM_FIELD.author]: truncateDID(node.createdBy)
  }
  for (const [key, value] of Object.entries(node.properties)) {
    cells[key] = coerceCellValueForType(value, fieldTypeById.get(key) ?? 'text')
  }
  return { id: node.id, cells, sortKey: node.id }
}

/**
 * Map grid fields to the `ColumnDefinition[]` the filter/sort engines expect.
 * (The app's equivalent helper is private to useGridDatabase, so we reimplement
 * the small mapping here — FieldType and ColumnType are the same union.)
 */
export function gridFieldsToColumnDefinitions(fields: GridField[]): ColumnDefinition[] {
  return fields.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    config: f.config as ColumnDefinition['config'],
    width: f.width,
    isTitle: f.isTitle
  }))
}

/** Union of property keys across nodes (for the All/unknown-schema view). */
export function observedPropertyKeys(nodes: NodeState[], cap = 12): string[] {
  const keys = new Set<string>()
  for (const node of nodes) {
    for (const key of Object.keys(node.properties)) {
      keys.add(key)
      if (keys.size >= cap) return Array.from(keys)
    }
  }
  return Array.from(keys)
}

/** A short human label for a schema IRI: `xnet://xnet.fyi/Task@1.0.0` -> `Task`. */
export function schemaLabel(iri: string): string {
  const tail = iri.split('/').pop() ?? iri
  return tail.split('@')[0] || tail
}

/** Split a schema IRI into its base (no version) and version, if any. */
function splitSchemaIri(iri: string): { base: string; version: string | null } {
  const at = iri.lastIndexOf('@')
  return at > -1
    ? { base: iri.slice(0, at), version: iri.slice(at + 1) }
    : { base: iri, version: null }
}

/** The version-stripped base of a schema IRI (`…/Task@1.0.0` -> `…/Task`). */
export function baseSchemaIri(iri: string): string {
  return splitSchemaIri(iri).base
}

export interface SchemaOption {
  iri: string
  label: string
}

/**
 * Build the schema-picker options from a set of IRIs.
 *
 * The schema registry exposes each schema under TWO keys — a versioned IRI
 * (`…/Task@1.0.0`) and a bare alias (`…/Task`) — so a naive list shows every
 * schema twice. Group by base IRI and emit one option per schema, preferring
 * the versioned IRI to query with (nodes store versioned schemaIds). Only when
 * a schema genuinely has multiple distinct versions do we keep them separate,
 * disambiguated by a version suffix.
 */
export function buildSchemaOptions(iris: Iterable<string>): SchemaOption[] {
  const groups = new Map<string, { versions: Map<string, string>; bare: string | null }>()
  for (const iri of iris) {
    const { base, version } = splitSchemaIri(iri)
    let group = groups.get(base)
    if (!group) {
      group = { versions: new Map(), bare: null }
      groups.set(base, group)
    }
    if (version) group.versions.set(version, iri)
    else group.bare = iri
  }

  const options: SchemaOption[] = []
  for (const [base, group] of groups) {
    const label = schemaLabel(base)
    const versions = [...group.versions.entries()]
    if (versions.length === 0) {
      options.push({ iri: group.bare ?? base, label })
    } else if (versions.length === 1) {
      options.push({ iri: versions[0][1], label })
    } else {
      for (const [version, iri] of versions) options.push({ iri, label: `${label} @${version}` })
    }
  }
  return options.sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Render a schema-picker label with its entity count, e.g. `Task (12)` or
 * `Person (0)`, so it's obvious at a glance where the data lives. A null /
 * undefined count (still loading, or uncountable) yields just the label so the
 * dropdown degrades gracefully rather than showing `Task ()`. Grouping is
 * pinned to `en-US` so large counts read as `1,234` deterministically
 * regardless of the runtime locale.
 */
export function formatSchemaOptionLabel(label: string, count: number | null | undefined): string {
  return typeof count === 'number' ? `${label} (${count.toLocaleString('en-US')})` : label
}

export type PlanMeta = NonNullable<NodeQueryResult['plan']>

export interface PlanRow {
  label: string
  value: string
}

/** Flatten query-plan metadata into compact label/value rows for the inspector. */
export function formatPlanRows(plan: PlanMeta): PlanRow[] {
  const rows: PlanRow[] = [
    { label: 'Strategy', value: plan.strategy },
    { label: 'Duration', value: `${plan.durationMs.toFixed(1)}ms` },
    { label: 'Returned', value: String(plan.returnedNodeCount) },
    { label: 'Candidates', value: String(plan.candidateNodeCount) }
  ]
  if (plan.usedIndexNames && plan.usedIndexNames.length > 0) {
    rows.push({ label: 'Indexes', value: plan.usedIndexNames.join(', ') })
  }
  if (plan.fullTableScan) {
    rows.push({ label: 'Scan', value: 'full table' })
  }
  if (plan.materializedViewId) {
    rows.push({ label: 'Mat. view', value: plan.materializedViewId })
  }
  if (plan.materializedCacheHit != null) {
    rows.push({ label: 'Mat. cache', value: plan.materializedCacheHit ? 'hit' : 'miss' })
  }
  // On a miss, the refresh reason (incl. 'authz-changed' from exploration 0226)
  // explains why the cached view was rebuilt.
  if (plan.materializedCacheHit === false && plan.materializedRefreshReason) {
    rows.push({ label: 'Mat. refresh', value: plan.materializedRefreshReason })
  }
  return rows
}
