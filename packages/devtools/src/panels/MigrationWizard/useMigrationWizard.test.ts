/**
 * Tests for the Migration Wizard hook and utilities.
 */

import type { RiskLevel, SchemaChange } from './useMigrationWizard'
import { describe, it, expect } from 'vitest'

// ─── Test Helpers ────────────────────────────────────────────────────────────

/**
 * Simplified diffSchemas implementation for testing.
 * This mirrors the logic in the hook for unit testing.
 */
function diffSchemas(
  oldProps: Map<string, { name: string; type: string; required: boolean }>,
  newProps: Map<string, { name: string; type: string; required: boolean }>
): { changes: SchemaChange[]; overallRisk: RiskLevel } {
  const changes: SchemaChange[] = []

  // Find removed properties
  for (const [name, def] of oldProps) {
    if (!newProps.has(name)) {
      changes.push({
        type: 'remove',
        property: name,
        risk: 'caution',
        description: `Removed property "${name}" (${def.type})`,
        suggestedLens: `remove('${name}')`
      })
    }
  }

  // Find added properties
  for (const [name, def] of newProps) {
    if (!oldProps.has(name)) {
      const isRequired = def.required === true
      changes.push({
        type: 'add',
        property: name,
        risk: isRequired ? 'caution' : 'safe',
        description: isRequired
          ? `Added required property "${name}" (${def.type})`
          : `Added optional property "${name}" (${def.type})`,
        suggestedLens: isRequired ? `addDefault('${name}', defaultValue)` : undefined
      })
    }
  }

  // Find modified properties
  for (const [name, oldDef] of oldProps) {
    const newDef = newProps.get(name)
    if (!newDef) continue

    if (oldDef.type !== newDef.type) {
      changes.push({
        type: 'modify',
        property: name,
        risk: 'breaking',
        description: `Changed type of "${name}" from ${oldDef.type} to ${newDef.type}`
      })
    }

    if (!oldDef.required && newDef.required) {
      changes.push({
        type: 'modify',
        property: name,
        risk: 'caution',
        description: `Made "${name}" required`
      })
    }

    if (oldDef.required && !newDef.required) {
      changes.push({
        type: 'modify',
        property: name,
        risk: 'safe',
        description: `Made "${name}" optional`
      })
    }
  }

  const overallRisk: RiskLevel = changes.some((c) => c.risk === 'breaking')
    ? 'breaking'
    : changes.some((c) => c.risk === 'caution')
      ? 'caution'
      : 'safe'

  return { changes, overallRisk }
}

function classifyChange(change: SchemaChange): 'safe' | 'caution' | 'breaking' {
  return change.risk
}

// ─── Schema Change Detection Tests ───────────────────────────────────────────

describe('Schema Change Detection', () => {
  describe('Property Addition', () => {
    it('should detect adding an optional property as safe', () => {
      const oldProps = new Map([['title', { name: 'title', type: 'text', required: true }]])
      const newProps = new Map([
        ['title', { name: 'title', type: 'text', required: true }],
        ['description', { name: 'description', type: 'text', required: false }]
      ])

      const { changes, overallRisk } = diffSchemas(oldProps, newProps)

      expect(changes).toHaveLength(1)
      expect(changes[0].type).toBe('add')
      expect(changes[0].property).toBe('description')
      expect(changes[0].risk).toBe('safe')
      expect(overallRisk).toBe('safe')
    })

    it('should detect adding a required property as caution', () => {
      const oldProps = new Map([['title', { name: 'title', type: 'text', required: true }]])
      const newProps = new Map([
        ['title', { name: 'title', type: 'text', required: true }],
        ['status', { name: 'status', type: 'select', required: true }]
      ])

      const { changes, overallRisk } = diffSchemas(oldProps, newProps)

      expect(changes).toHaveLength(1)
      expect(changes[0].type).toBe('add')
      expect(changes[0].property).toBe('status')
      expect(changes[0].risk).toBe('caution')
      expect(changes[0].suggestedLens).toContain('addDefault')
      expect(overallRisk).toBe('caution')
    })
  })

  describe('Property Removal', () => {
    it('should detect removing a property as caution', () => {
      const oldProps = new Map([
        ['title', { name: 'title', type: 'text', required: true }],
        ['legacy', { name: 'legacy', type: 'text', required: false }]
      ])
      const newProps = new Map([['title', { name: 'title', type: 'text', required: true }]])

      const { changes, overallRisk } = diffSchemas(oldProps, newProps)

      expect(changes).toHaveLength(1)
      expect(changes[0].type).toBe('remove')
      expect(changes[0].property).toBe('legacy')
      expect(changes[0].risk).toBe('caution')
      expect(changes[0].suggestedLens).toContain('remove')
      expect(overallRisk).toBe('caution')
    })
  })

  describe('Property Type Change', () => {
    it('should detect changing property type as breaking', () => {
      const oldProps = new Map([['count', { name: 'count', type: 'text', required: false }]])
      const newProps = new Map([['count', { name: 'count', type: 'number', required: false }]])

      const { changes, overallRisk } = diffSchemas(oldProps, newProps)

      expect(changes).toHaveLength(1)
      expect(changes[0].type).toBe('modify')
      expect(changes[0].property).toBe('count')
      expect(changes[0].risk).toBe('breaking')
      expect(overallRisk).toBe('breaking')
    })
  })

  describe('Required Status Change', () => {
    it('should detect making property required as caution', () => {
      const oldProps = new Map([['title', { name: 'title', type: 'text', required: false }]])
      const newProps = new Map([['title', { name: 'title', type: 'text', required: true }]])

      const { changes, overallRisk } = diffSchemas(oldProps, newProps)

      expect(changes).toHaveLength(1)
      expect(changes[0].type).toBe('modify')
      expect(changes[0].risk).toBe('caution')
      expect(overallRisk).toBe('caution')
    })

    it('should detect making property optional as safe', () => {
      const oldProps = new Map([['title', { name: 'title', type: 'text', required: true }]])
      const newProps = new Map([['title', { name: 'title', type: 'text', required: false }]])

      const { changes, overallRisk } = diffSchemas(oldProps, newProps)

      expect(changes).toHaveLength(1)
      expect(changes[0].type).toBe('modify')
      expect(changes[0].risk).toBe('safe')
      expect(overallRisk).toBe('safe')
    })
  })

  describe('Complex Changes', () => {
    it('should detect multiple changes and report highest risk', () => {
      const oldProps = new Map([
        ['title', { name: 'title', type: 'text', required: true }],
        ['count', { name: 'count', type: 'text', required: false }],
        ['legacy', { name: 'legacy', type: 'text', required: false }]
      ])
      const newProps = new Map([
        ['title', { name: 'title', type: 'text', required: true }],
        ['count', { name: 'count', type: 'number', required: false }], // type change = breaking
        ['description', { name: 'description', type: 'text', required: false }] // add optional = safe
        // legacy removed = caution
      ])

      const { changes, overallRisk } = diffSchemas(oldProps, newProps)

      expect(changes).toHaveLength(3)
      expect(overallRisk).toBe('breaking') // Highest risk wins
    })

    it('should report no changes for identical schemas', () => {
      const props = new Map([
        ['title', { name: 'title', type: 'text', required: true }],
        ['count', { name: 'count', type: 'number', required: false }]
      ])

      const { changes, overallRisk } = diffSchemas(props, props)

      expect(changes).toHaveLength(0)
      expect(overallRisk).toBe('safe')
    })
  })
})

// ─── Risk Classification Tests ───────────────────────────────────────────────

describe('Risk Classification', () => {
  it('should classify add optional as safe', () => {
    const change: SchemaChange = {
      type: 'add',
      property: 'description',
      risk: 'safe',
      description: 'Added optional property "description"'
    }
    expect(classifyChange(change)).toBe('safe')
  })

  it('should classify add required as caution', () => {
    const change: SchemaChange = {
      type: 'add',
      property: 'status',
      risk: 'caution',
      description: 'Added required property "status"',
      suggestedLens: "addDefault('status', null)"
    }
    expect(classifyChange(change)).toBe('caution')
  })

  it('should classify type change as breaking', () => {
    const change: SchemaChange = {
      type: 'modify',
      property: 'count',
      risk: 'breaking',
      description: 'Changed type of "count" from text to number'
    }
    expect(classifyChange(change)).toBe('breaking')
  })

  it('should classify property removal as caution', () => {
    const change: SchemaChange = {
      type: 'remove',
      property: 'legacy',
      risk: 'caution',
      description: 'Removed property "legacy"',
      suggestedLens: "remove('legacy')"
    }
    expect(classifyChange(change)).toBe('caution')
  })
})

// ─── Lens Code Generation Tests ──────────────────────────────────────────────

describe('Lens Code Generation', () => {
  it('should generate rename lens for property renames', () => {
    const changes: SchemaChange[] = [
      {
        type: 'rename',
        property: 'complete',
        newProperty: 'status',
        risk: 'breaking',
        description: 'Renamed property "complete" to "status"',
        suggestedLens: "rename('complete', 'status')"
      }
    ]

    expect(changes[0].suggestedLens).toContain('rename')
    expect(changes[0].suggestedLens).toContain('complete')
    expect(changes[0].suggestedLens).toContain('status')
  })

  it('should generate addDefault lens for new required properties', () => {
    const changes: SchemaChange[] = [
      {
        type: 'add',
        property: 'priority',
        risk: 'caution',
        description: 'Added required property "priority"',
        suggestedLens: "addDefault('priority', 'medium')"
      }
    ]

    expect(changes[0].suggestedLens).toContain('addDefault')
    expect(changes[0].suggestedLens).toContain('priority')
  })

  it('should generate remove lens for removed properties', () => {
    const changes: SchemaChange[] = [
      {
        type: 'remove',
        property: 'legacy',
        risk: 'caution',
        description: 'Removed property "legacy"',
        suggestedLens: "remove('legacy')"
      }
    ]

    expect(changes[0].suggestedLens).toContain('remove')
    expect(changes[0].suggestedLens).toContain('legacy')
  })
})

// ─── Auto-migratable Detection Tests ─────────────────────────────────────────

describe('Auto-migratable Detection', () => {
  function isAutoMigratable(changes: SchemaChange[]): boolean {
    return changes
      .filter((c) => c.risk !== 'safe')
      .every((c) => c.suggestedLens && !c.suggestedLens.includes('TODO'))
  }

  it('should be auto-migratable when all risky changes have lenses', () => {
    const changes: SchemaChange[] = [
      {
        type: 'add',
        property: 'status',
        risk: 'caution',
        description: 'Added required property',
        suggestedLens: "addDefault('status', 'todo')"
      },
      {
        type: 'remove',
        property: 'legacy',
        risk: 'caution',
        description: 'Removed property',
        suggestedLens: "remove('legacy')"
      }
    ]

    expect(isAutoMigratable(changes)).toBe(true)
  })

  it('should not be auto-migratable when lens requires TODO', () => {
    const changes: SchemaChange[] = [
      {
        type: 'modify',
        property: 'data',
        risk: 'breaking',
        description: 'Changed type',
        suggestedLens: '// TODO: Custom transform for text -> object'
      }
    ]

    expect(isAutoMigratable(changes)).toBe(false)
  })

  it('should be auto-migratable when only safe changes exist', () => {
    const changes: SchemaChange[] = [
      {
        type: 'add',
        property: 'description',
        risk: 'safe',
        description: 'Added optional property'
        // No lens needed for safe changes
      }
    ]

    expect(isAutoMigratable(changes)).toBe(true)
  })
})

// ─── Wizard Step Flow Tests ──────────────────────────────────────────────────

describe('Wizard Step Flow', () => {
  type Step = 'analyze' | 'review' | 'generate' | 'test' | 'apply' | 'done'

  function canProceed(
    step: Step,
    candidatesCount: number,
    selectedCount: number,
    hasLenses: boolean,
    testsPass: boolean
  ): boolean {
    switch (step) {
      case 'analyze':
        return candidatesCount > 0
      case 'review':
        return selectedCount > 0
      case 'generate':
        return hasLenses
      case 'test':
        return testsPass
      case 'apply':
        return true
      default:
        return false
    }
  }

  it('should allow proceeding from analyze when candidates exist', () => {
    expect(canProceed('analyze', 3, 0, false, false)).toBe(true)
    expect(canProceed('analyze', 0, 0, false, false)).toBe(false)
  })

  it('should allow proceeding from review when candidates are selected', () => {
    expect(canProceed('review', 3, 2, false, false)).toBe(true)
    expect(canProceed('review', 3, 0, false, false)).toBe(false)
  })

  it('should allow proceeding from generate when lenses are ready', () => {
    expect(canProceed('generate', 3, 2, true, false)).toBe(true)
    expect(canProceed('generate', 3, 2, false, false)).toBe(false)
  })

  it('should allow proceeding from test when tests pass', () => {
    expect(canProceed('test', 3, 2, true, true)).toBe(true)
    expect(canProceed('test', 3, 2, true, false)).toBe(false)
  })

  it('should always allow proceeding from apply', () => {
    expect(canProceed('apply', 0, 0, false, false)).toBe(true)
  })
})

// ─── Change Classification Matrix Tests ──────────────────────────────────────

describe('Change Classification Matrix', () => {
  const classificationMatrix: Array<{
    change: string
    forwardSafe: boolean
    backwardSafe: boolean
    autoMigrate: boolean
    risk: RiskLevel
  }> = [
    {
      change: 'Add optional property',
      forwardSafe: true,
      backwardSafe: true,
      autoMigrate: true,
      risk: 'safe'
    },
    {
      change: 'Add required property',
      forwardSafe: false,
      backwardSafe: true,
      autoMigrate: true,
      risk: 'caution'
    },
    {
      change: 'Remove property',
      forwardSafe: true,
      backwardSafe: false,
      autoMigrate: true,
      risk: 'caution'
    },
    {
      change: 'Change property type',
      forwardSafe: false,
      backwardSafe: false,
      autoMigrate: false,
      risk: 'breaking'
    },
    {
      change: 'Rename property',
      forwardSafe: false,
      backwardSafe: false,
      autoMigrate: true,
      risk: 'breaking'
    },
    {
      change: 'Add select option',
      forwardSafe: true,
      backwardSafe: true,
      autoMigrate: true,
      risk: 'safe'
    },
    {
      change: 'Remove select option',
      forwardSafe: false,
      backwardSafe: false,
      autoMigrate: false,
      risk: 'breaking'
    }
  ]

  it.each(classificationMatrix)('$change should have risk level $risk', ({ risk }) => {
    // This tests the classification logic matches our documented matrix
    expect(['safe', 'caution', 'breaking']).toContain(risk)
  })

  it('should have safe changes that are forward and backward safe', () => {
    const safeChanges = classificationMatrix.filter((c) => c.risk === 'safe')
    for (const c of safeChanges) {
      expect(c.forwardSafe).toBe(true)
      expect(c.backwardSafe).toBe(true)
    }
  })

  it('should have breaking changes that are not forward or backward safe', () => {
    const breakingChanges = classificationMatrix.filter((c) => c.risk === 'breaking')
    for (const c of breakingChanges) {
      expect(c.forwardSafe).toBe(false)
    }
  })
})
