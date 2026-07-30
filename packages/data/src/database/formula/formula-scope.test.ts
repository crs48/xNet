import { describe, expect, it } from 'vitest'
import { FormulaService } from '../formula-service'
import type { ColumnDefinition } from '../column-types'

const columns: ColumnDefinition[] = [
  { id: 'price', name: 'Price', type: 'number', config: {} },
  {
    id: 'relatedSum',
    name: 'Related sum',
    type: 'formula',
    config: { expression: 'SUM(RELATED("leadTask", "estimate"))', resultType: 'number' }
  },
  {
    id: 'homeLat',
    name: 'Home lat',
    type: 'formula',
    config: { expression: 'NODE("profile-1", "lat")', resultType: 'number' }
  }
]

const row = { id: 'r1', databaseId: 'db1', cells: { price: 10 } }

describe('cross-node formula scope (0346)', () => {
  it('RELATED() aggregates values resolved by the host scope', () => {
    const service = new FormulaService()
    const value = service.compute(row, columns[1], columns, {
      getRelatedValues: (relationColumnId, targetColumnId) => {
        expect(relationColumnId).toBe('leadTask')
        expect(targetColumnId).toBe('estimate')
        return [3, 4, 5]
      }
    })
    expect(value).toBe(12)
  })

  it('RELATED() degrades to [] without a scope (SUM → 0)', () => {
    const service = new FormulaService()
    expect(service.compute(row, columns[1], columns)).toBe(0)
  })

  it('NODE() reads a named node property through the scope', () => {
    const service = new FormulaService()
    const value = service.compute(row, columns[2], columns, {
      getNodeProperty: (nodeId, property) => {
        expect(nodeId).toBe('profile-1')
        expect(property).toBe('lat')
        return 48.85
      }
    })
    expect(value).toBe(48.85)
  })

  it('NODE() degrades to null without a scope (number coercion → 0)', () => {
    const service = new FormulaService()
    // The 3-layer coercion (parse → evaluate → coerce) turns the null
    // into the result type's empty value.
    expect(service.compute(row, columns[2], columns)).toBe(0)
  })

  it('scope formulas bypass the value cache (fresh scope reads win)', () => {
    const service = new FormulaService()
    let latest = 1
    const scope = { getRelatedValues: () => [latest] }
    expect(service.compute(row, columns[1], columns, scope)).toBe(1)
    latest = 2
    expect(service.compute(row, columns[1], columns, scope)).toBe(2)
  })
})
