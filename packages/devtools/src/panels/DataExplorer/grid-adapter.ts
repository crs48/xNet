/**
 * Pure adapters mapping store nodes + schemas onto the @xnetjs/views grid model.
 *
 * Kept free of React so the column/cell derivation is unit-testable and the
 * Data panel stays a thin wrapper over the real database grid (GridSurface).
 */

import type {
  CellValue,
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
 */
export function buildGridFields(
  schema: Schema | null,
  observedKeys: string[],
  showSchemaColumn: boolean
): GridField[] {
  const fields: GridField[] = [
    {
      id: SYSTEM_FIELD.id,
      name: 'ID',
      type: 'text',
      config: {},
      width: 130,
      readonly: true,
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
      readonly: true
    })
  }

  if (schema) {
    for (const prop of schema.properties) {
      if (AUTO_PROPERTY_TYPES.has(prop.type)) continue // shown as system columns below
      let type = propertyTypeToFieldType(prop.type)
      let options: GridFieldOption[] | undefined
      if (type === 'select' || type === 'multiSelect') {
        options = optionsFor(prop)
        // Never hand a select cell renderer a value with no options — render
        // the raw value as text instead so the grid can't crash on dev data.
        if (!options) type = 'text'
      }
      fields.push({
        id: prop.name,
        name: prop.name,
        type,
        config: prop.config ?? {},
        width: 170,
        options,
        readonly: true
      })
    }
  } else {
    for (const key of observedKeys) {
      fields.push({ id: key, name: key, type: 'text', config: {}, width: 170, readonly: true })
    }
  }

  fields.push({
    id: SYSTEM_FIELD.updated,
    name: 'Updated',
    type: 'text',
    config: {},
    width: 160,
    readonly: true
  })
  fields.push({
    id: SYSTEM_FIELD.author,
    name: 'Author',
    type: 'text',
    config: {},
    width: 130,
    readonly: true
  })
  return fields
}

/** Coerce an arbitrary node property value into a CellValue the grid renders. */
export function coerceCellValue(value: unknown): CellValue {
  if (value == null) return null
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return value as CellValue
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value as string[]
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Map a node to a grid row with system + property cells (keyed by field id). */
export function nodeToGridRow(node: NodeState): GridRowData {
  const cells: Record<string, CellValue> = {
    [SYSTEM_FIELD.id]: node.id,
    [SYSTEM_FIELD.schema]: node.schemaId.split('/').pop() ?? node.schemaId,
    [SYSTEM_FIELD.updated]: new Date(node.updatedAt).toLocaleString(),
    [SYSTEM_FIELD.author]: truncateDID(node.createdBy)
  }
  for (const [key, value] of Object.entries(node.properties)) {
    cells[key] = coerceCellValue(value)
  }
  return { id: node.id, cells }
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
  if (plan.materializedCacheHit != null) {
    rows.push({ label: 'Mat. cache', value: plan.materializedCacheHit ? 'hit' : 'miss' })
  }
  return rows
}
