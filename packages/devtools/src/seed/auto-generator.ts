/**
 * Tier-2 coverage backstop. For any registered schema NOT covered by a Tier-1
 * seeder, synthesize one deterministic representative node directly from its
 * field definitions. New schemas therefore get sample data automatically the
 * moment they're registered — no seeder edit required.
 */

import type { DefinedSchema, DeterministicNodeImportDraft, PropertyDefinition } from '@xnetjs/data'
import { seedId } from './seed-ids'

/** Auto-populated / computed field types we never write. */
const SKIP_TYPES = new Set<PropertyDefinition['type']>([
  'created',
  'updated',
  'createdBy',
  'rollup',
  'formula'
])

const BASE_TS = 1_750_000_000_000

/** Synthesize a value for one property definition, or `undefined` to skip it. */
export function autoValue(
  def: PropertyDefinition,
  ctx: { space: string; authorDID: string }
): unknown {
  if (SKIP_TYPES.has(def.type)) return undefined
  const config = (def.config ?? {}) as Record<string, unknown>

  switch (def.type) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return `Sample ${def.name}`
    case 'number':
      return 42
    case 'checkbox':
      return typeof config.default === 'boolean' ? config.default : false
    case 'date':
      return BASE_TS
    case 'dateRange':
      return { start: BASE_TS, end: BASE_TS + 86_400_000 }
    case 'geo':
      return { lat: 37.7749, lng: -122.4194 }
    case 'select': {
      const options = config.options as Array<{ id: string }> | undefined
      return (config.default as string | undefined) ?? options?.[0]?.id
    }
    case 'multiSelect': {
      const options = config.options as Array<{ id: string }> | undefined
      return options?.[0]?.id ? [options[0].id] : []
    }
    case 'json':
      return config.format === 'money' ? { amount: 1000, currency: 'USD' } : {}
    case 'person':
      return config.multiple ? [ctx.authorDID] : ctx.authorDID
    case 'relation':
      // Only the universal `space` relation can be satisfied generically.
      return def.name === 'space' ? ctx.space : undefined
    case 'file':
      return undefined
    default:
      return undefined
  }
}

/** Build a representative draft for a schema from its field definitions. */
export function autoDraft(
  schema: DefinedSchema,
  ctx: { space: string; authorDID: string }
): DeterministicNodeImportDraft {
  const properties: Record<string, unknown> = {}
  for (const def of schema.schema.properties) {
    const value = autoValue(def, ctx)
    if (value !== undefined) properties[def.name] = value
  }
  return {
    id: seedId('auto', schema.schema.name),
    schemaId: schema._schemaId,
    properties
  }
}
