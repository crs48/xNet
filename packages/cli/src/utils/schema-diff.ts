/**
 * Schema Diff Utility - Compare two schema versions and identify changes.
 *
 * This utility analyzes the differences between two schema definitions
 * and classifies changes by risk level for migration planning.
 *
 * @example
 * ```typescript
 * const changes = diffSchemas(oldSchema, newSchema)
 * for (const change of changes) {
 *   console.log(`${change.risk}: ${change.description}`)
 * }
 * ```
 */

import type { Schema } from '@xnet/data'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Extended property definition that includes optional select options.
 * This is a superset of the base PropertyDefinition from @xnet/data
 * to handle select/multiSelect options which may be stored in config or directly.
 */
export interface ExtendedPropertyDefinition {
  '@id': string
  name: string
  type: string
  required: boolean
  config?: Record<string, unknown>
  /** Select options (may be in config or directly on definition) */
  options?: Array<{ value: string; label?: string }>
}

export type SchemaChangeType = 'add' | 'remove' | 'modify' | 'rename'

export type RiskLevel = 'safe' | 'caution' | 'breaking'

/**
 * A single change between two schema versions.
 */
export interface SchemaChange {
  /** Type of change */
  type: SchemaChangeType
  /** Property name (or old name for renames) */
  property: string
  /** New property name (for renames) */
  newProperty?: string
  /** Risk level of this change */
  risk: RiskLevel
  /** Human-readable description */
  description: string
  /** Suggested lens operation (if applicable) */
  suggestedLens?: string
  /** Old property definition (for modifications/removals) */
  oldDefinition?: ExtendedPropertyDefinition
  /** New property definition (for additions/modifications) */
  newDefinition?: ExtendedPropertyDefinition
}

/**
 * Result of schema comparison.
 */
export interface SchemaDiffResult {
  /** Old schema version */
  fromVersion: string
  /** New schema version */
  toVersion: string
  /** List of changes detected */
  changes: SchemaChange[]
  /** Overall risk level (highest of all changes) */
  overallRisk: RiskLevel
  /** Whether automatic migration is possible */
  autoMigratable: boolean
  /** Summary of changes by category */
  summary: {
    safe: number
    caution: number
    breaking: number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPropertyMap(schema: Schema): Map<string, ExtendedPropertyDefinition> {
  const map = new Map<string, ExtendedPropertyDefinition>()
  for (const prop of schema.properties) {
    // Cast to extended type - runtime data may have options field
    map.set(prop.name, prop as unknown as ExtendedPropertyDefinition)
  }
  return map
}

function getDefaultValue(def: ExtendedPropertyDefinition): string {
  switch (def.type) {
    case 'text':
      return "''"
    case 'number':
      return '0'
    case 'checkbox':
      return 'false'
    case 'date':
      return 'null'
    case 'select':
      return def.options?.[0] ? `'${def.options[0].value}'` : 'null'
    case 'multiSelect':
      return '[]'
    case 'person':
      return '[]'
    case 'relation':
      return '[]'
    case 'url':
      return 'null'
    case 'email':
      return 'null'
    case 'phone':
      return 'null'
    case 'file':
      return '[]'
    default:
      return 'null'
  }
}

function areTypesCompatible(oldType: string, newType: string): boolean {
  // Same type is compatible
  if (oldType === newType) return true

  // Some type widening is safe
  const wideningPairs: Array<[string, string]> = [
    ['text', 'url'],
    ['text', 'email'],
    ['text', 'phone']
  ]

  return wideningPairs.some(([from, to]) => oldType === to && newType === from)
}

function detectPotentialRename(
  removedProps: Map<string, ExtendedPropertyDefinition>,
  addedProps: Map<string, ExtendedPropertyDefinition>
): Array<{ from: string; to: string; confidence: number }> {
  const renames: Array<{ from: string; to: string; confidence: number }> = []

  for (const [removedName, removedDef] of removedProps) {
    for (const [addedName, addedDef] of addedProps) {
      // Same type is a strong indicator
      if (removedDef.type === addedDef.type) {
        let confidence = 0.5

        // Similar names increase confidence
        const removedLower = removedName.toLowerCase()
        const addedLower = addedName.toLowerCase()

        if (removedLower.includes(addedLower) || addedLower.includes(removedLower)) {
          confidence += 0.2
        }

        // Same required status increases confidence
        if (removedDef.required === addedDef.required) {
          confidence += 0.1
        }

        // For select types, same options increase confidence
        if (removedDef.type === 'select' && addedDef.type === 'select') {
          const oldOptions = new Set(removedDef.options?.map((o) => o.value) ?? [])
          const newOptions = new Set(addedDef.options?.map((o) => o.value) ?? [])
          const intersection = new Set([...oldOptions].filter((x) => newOptions.has(x)))
          if (intersection.size === oldOptions.size && oldOptions.size === newOptions.size) {
            confidence += 0.2
          }
        }

        if (confidence >= 0.5) {
          renames.push({ from: removedName, to: addedName, confidence })
        }
      }
    }
  }

  // Sort by confidence and return non-overlapping renames
  renames.sort((a, b) => b.confidence - a.confidence)
  const usedFrom = new Set<string>()
  const usedTo = new Set<string>()

  return renames.filter((r) => {
    if (usedFrom.has(r.from) || usedTo.has(r.to)) return false
    usedFrom.add(r.from)
    usedTo.add(r.to)
    return true
  })
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Compare two schema versions and identify all changes.
 *
 * @param oldSchema - The source schema version
 * @param newSchema - The target schema version
 * @returns Detailed diff result with changes and risk assessment
 */
export function diffSchemas(oldSchema: Schema, newSchema: Schema): SchemaDiffResult {
  const changes: SchemaChange[] = []
  const oldProps = getPropertyMap(oldSchema)
  const newProps = getPropertyMap(newSchema)

  const removedProps = new Map<string, ExtendedPropertyDefinition>()
  const addedProps = new Map<string, ExtendedPropertyDefinition>()

  // Find removed properties
  for (const [name, def] of oldProps) {
    if (!newProps.has(name)) {
      removedProps.set(name, def)
    }
  }

  // Find added properties
  for (const [name, def] of newProps) {
    if (!oldProps.has(name)) {
      addedProps.set(name, def)
    }
  }

  // Detect potential renames
  const potentialRenames = detectPotentialRename(removedProps, addedProps)

  // Process renames
  for (const { from, to } of potentialRenames) {
    const oldDef = removedProps.get(from)!
    const newDef = addedProps.get(to)!

    changes.push({
      type: 'rename',
      property: from,
      newProperty: to,
      risk: 'breaking',
      description: `Renamed property "${from}" to "${to}"`,
      suggestedLens: `rename('${from}', '${to}')`,
      oldDefinition: oldDef,
      newDefinition: newDef
    })

    removedProps.delete(from)
    addedProps.delete(to)
  }

  // Process remaining removed properties
  for (const [name, def] of removedProps) {
    changes.push({
      type: 'remove',
      property: name,
      risk: 'caution',
      description: `Removed property "${name}" (${def.type})`,
      suggestedLens: `remove('${name}')`,
      oldDefinition: def
    })
  }

  // Process remaining added properties
  for (const [name, def] of addedProps) {
    const isRequired = def.required === true

    changes.push({
      type: 'add',
      property: name,
      risk: isRequired ? 'caution' : 'safe',
      description: isRequired
        ? `Added required property "${name}" (${def.type}) - needs default value`
        : `Added optional property "${name}" (${def.type})`,
      suggestedLens: isRequired ? `addDefault('${name}', ${getDefaultValue(def)})` : undefined,
      newDefinition: def
    })
  }

  // Check for modified properties (same name, different definition)
  for (const [name, oldDef] of oldProps) {
    const newDef = newProps.get(name)
    if (!newDef) continue // Already handled as removed

    // Check type change
    if (oldDef.type !== newDef.type) {
      const compatible = areTypesCompatible(oldDef.type, newDef.type)
      changes.push({
        type: 'modify',
        property: name,
        risk: compatible ? 'caution' : 'breaking',
        description: `Changed type of "${name}" from ${oldDef.type} to ${newDef.type}`,
        suggestedLens: compatible
          ? undefined
          : `// TODO: Custom transform for ${oldDef.type} -> ${newDef.type}`,
        oldDefinition: oldDef,
        newDefinition: newDef
      })
      continue
    }

    // Check select options change
    if (oldDef.type === 'select' && newDef.type === 'select') {
      const oldOptions = new Set(oldDef.options?.map((o) => o.value) ?? [])
      const newOptions = new Set(newDef.options?.map((o) => o.value) ?? [])

      // Check for removed options
      const removedOptions = [...oldOptions].filter((o) => !newOptions.has(o))
      if (removedOptions.length > 0) {
        changes.push({
          type: 'modify',
          property: name,
          risk: 'breaking',
          description: `Removed select options from "${name}": ${removedOptions.join(', ')}`,
          suggestedLens: `// TODO: Map removed options ${removedOptions.join(', ')} to valid values`,
          oldDefinition: oldDef,
          newDefinition: newDef
        })
      }

      // Added options are safe
      const addedOptions = [...newOptions].filter((o) => !oldOptions.has(o))
      if (addedOptions.length > 0 && removedOptions.length === 0) {
        changes.push({
          type: 'modify',
          property: name,
          risk: 'safe',
          description: `Added select options to "${name}": ${addedOptions.join(', ')}`,
          oldDefinition: oldDef,
          newDefinition: newDef
        })
      }
    }

    // Check required status change
    if (!oldDef.required && newDef.required) {
      changes.push({
        type: 'modify',
        property: name,
        risk: 'caution',
        description: `Made "${name}" required (was optional) - needs default for existing null values`,
        suggestedLens: `addDefault('${name}', ${getDefaultValue(newDef)})`,
        oldDefinition: oldDef,
        newDefinition: newDef
      })
    } else if (oldDef.required && !newDef.required) {
      changes.push({
        type: 'modify',
        property: name,
        risk: 'safe',
        description: `Made "${name}" optional (was required)`,
        oldDefinition: oldDef,
        newDefinition: newDef
      })
    }
  }

  // Calculate summary
  const summary = {
    safe: changes.filter((c) => c.risk === 'safe').length,
    caution: changes.filter((c) => c.risk === 'caution').length,
    breaking: changes.filter((c) => c.risk === 'breaking').length
  }

  const overallRisk: RiskLevel =
    summary.breaking > 0 ? 'breaking' : summary.caution > 0 ? 'caution' : 'safe'

  // Auto-migratable if all changes have suggested lenses (except safe changes)
  const autoMigratable = changes
    .filter((c) => c.risk !== 'safe')
    .every((c) => c.suggestedLens && !c.suggestedLens.startsWith('// TODO'))

  return {
    fromVersion: oldSchema.version,
    toVersion: newSchema.version,
    changes,
    overallRisk,
    autoMigratable,
    summary
  }
}
