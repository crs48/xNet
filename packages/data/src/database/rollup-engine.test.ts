/**
 * @xnet/data - Rollup engine tests.
 */

import type { CellValue } from './cell-types'
import type { ColumnDefinition, RollupColumnConfig } from './column-types'
import type { RollupRow, RollupContext } from './rollup-engine'
import { describe, it, expect } from 'vitest'
import {
  aggregate,
  getEmptyValue,
  computeRollup,
  batchComputeRollups,
  validateRollupConfig,
  isNumericAggregation,
  getAggregationResultType
} from './rollup-engine'

// ─── Test Helpers ────────────────────────────────────────────────────────────

const createRow = (
  id: string,
  databaseId: string,
  cells: Record<string, CellValue>
): RollupRow => ({
  id,
  databaseId,
  cells
})

const createRollupColumn = (
  id: string,
  relationColumn: string,
  targetColumn: string,
  aggregation: RollupColumnConfig['aggregation']
): ColumnDefinition => ({
  id,
  name: 'Rollup',
  type: 'rollup',
  config: {
    relationColumn,
    targetColumn,
    aggregation
  }
})

const createMockContext = (
  relatedRows: RollupRow[],
  columns: ColumnDefinition[] = []
): RollupContext => ({
  getRelatedRows: async () => relatedRows,
  getColumns: async () => columns,
  getColumn: async (_dbId, colId) => columns.find((c) => c.id === colId)
})

// ─── Aggregate Function Tests ────────────────────────────────────────────────

describe('aggregate', () => {
  describe('count', () => {
    it('counts all values', () => {
      expect(aggregate([1, 2, 3, 4, 5], 'count')).toBe(5)
    })

    it('counts empty array as 0', () => {
      expect(aggregate([], 'count')).toBe(0)
    })

    it('counts null values', () => {
      expect(aggregate([1, null, 2, null], 'count')).toBe(4)
    })
  })

  describe('sum', () => {
    it('sums numbers', () => {
      expect(aggregate([10, 20, 30], 'sum')).toBe(60)
    })

    it('handles empty array', () => {
      expect(aggregate([], 'sum')).toBe(0)
    })

    it('treats non-numbers as 0', () => {
      expect(aggregate([10, 'abc', 20, null], 'sum')).toBe(30)
    })

    it('handles string numbers', () => {
      expect(aggregate(['10', '20', '30'], 'sum')).toBe(60)
    })
  })

  describe('avg', () => {
    it('averages numbers', () => {
      expect(aggregate([10, 20, 30], 'avg')).toBe(20)
    })

    it('returns null for empty array', () => {
      expect(aggregate([], 'avg')).toBeNull()
    })

    it('ignores non-numbers', () => {
      expect(aggregate([10, 'abc', 30], 'avg')).toBe(20)
    })

    it('handles decimals', () => {
      expect(aggregate([1, 2, 3, 4], 'avg')).toBe(2.5)
    })
  })

  describe('min', () => {
    it('finds minimum', () => {
      expect(aggregate([30, 10, 20], 'min')).toBe(10)
    })

    it('returns null for empty array', () => {
      expect(aggregate([], 'min')).toBeNull()
    })

    it('handles negative numbers', () => {
      expect(aggregate([-5, 0, 5], 'min')).toBe(-5)
    })

    it('ignores non-numbers', () => {
      expect(aggregate([30, 'abc', 10], 'min')).toBe(10)
    })
  })

  describe('max', () => {
    it('finds maximum', () => {
      expect(aggregate([30, 10, 20], 'max')).toBe(30)
    })

    it('returns null for empty array', () => {
      expect(aggregate([], 'max')).toBeNull()
    })

    it('handles negative numbers', () => {
      expect(aggregate([-5, 0, 5], 'max')).toBe(5)
    })
  })

  describe('concat', () => {
    it('concatenates strings', () => {
      expect(aggregate(['a', 'b', 'c'], 'concat')).toBe('a, b, c')
    })

    it('handles empty array', () => {
      expect(aggregate([], 'concat')).toBe('')
    })

    it('filters out null/undefined', () => {
      expect(aggregate(['a', null, 'b', undefined], 'concat')).toBe('a, b')
    })

    it('converts numbers to strings', () => {
      expect(aggregate([1, 2, 3], 'concat')).toBe('1, 2, 3')
    })
  })

  describe('unique', () => {
    it('counts unique values', () => {
      expect(aggregate(['a', 'b', 'a', 'c', 'b'], 'unique')).toBe(3)
    })

    it('handles empty array', () => {
      expect(aggregate([], 'unique')).toBe(0)
    })

    it('filters out null/undefined', () => {
      expect(aggregate(['a', null, 'a', undefined], 'unique')).toBe(1)
    })
  })

  describe('empty', () => {
    it('counts empty values', () => {
      expect(aggregate([1, null, '', undefined, 2], 'empty')).toBe(3)
    })

    it('returns 0 for no empty values', () => {
      expect(aggregate([1, 2, 3], 'empty')).toBe(0)
    })
  })

  describe('notEmpty', () => {
    it('counts non-empty values', () => {
      expect(aggregate([1, null, '', undefined, 2], 'notEmpty')).toBe(2)
    })

    it('returns 0 for all empty values', () => {
      expect(aggregate([null, '', undefined], 'notEmpty')).toBe(0)
    })
  })

  describe('percentEmpty', () => {
    it('calculates percentage of empty values', () => {
      expect(aggregate([1, null, '', 2], 'percentEmpty')).toBe(50)
    })

    it('returns 0 for empty array', () => {
      expect(aggregate([], 'percentEmpty')).toBe(0)
    })

    it('returns 100 for all empty', () => {
      expect(aggregate([null, '', undefined], 'percentEmpty')).toBe(100)
    })
  })

  describe('percentNotEmpty', () => {
    it('calculates percentage of non-empty values', () => {
      expect(aggregate([1, null, '', 2], 'percentNotEmpty')).toBe(50)
    })

    it('returns 0 for empty array', () => {
      expect(aggregate([], 'percentNotEmpty')).toBe(0)
    })

    it('returns 0 for all empty', () => {
      expect(aggregate([null, '', undefined], 'percentNotEmpty')).toBe(0)
    })
  })
})

// ─── getEmptyValue Tests ─────────────────────────────────────────────────────

describe('getEmptyValue', () => {
  it('returns 0 for count', () => {
    expect(getEmptyValue('count')).toBe(0)
  })

  it('returns 0 for sum', () => {
    expect(getEmptyValue('sum')).toBe(0)
  })

  it('returns null for avg', () => {
    expect(getEmptyValue('avg')).toBeNull()
  })

  it('returns null for min', () => {
    expect(getEmptyValue('min')).toBeNull()
  })

  it('returns null for max', () => {
    expect(getEmptyValue('max')).toBeNull()
  })

  it('returns empty string for concat', () => {
    expect(getEmptyValue('concat')).toBe('')
  })

  it('returns 0 for unique', () => {
    expect(getEmptyValue('unique')).toBe(0)
  })

  it('returns 0 for percentEmpty', () => {
    expect(getEmptyValue('percentEmpty')).toBe(0)
  })
})

// ─── computeRollup Tests ─────────────────────────────────────────────────────

describe('computeRollup', () => {
  it('computes sum of related rows', async () => {
    const row = createRow('row-1', 'db-1', { tasks: ['task-1', 'task-2'] })
    const relatedRows = [
      createRow('task-1', 'db-2', { hours: 5 }),
      createRow('task-2', 'db-2', { hours: 3 })
    ]
    const columns: ColumnDefinition[] = [
      { id: 'tasks', name: 'Tasks', type: 'relation', config: { targetDatabase: 'db-2' } }
    ]
    const rollupColumn = createRollupColumn('totalHours', 'tasks', 'hours', 'sum')
    const context = createMockContext(relatedRows, columns)

    const result = await computeRollup(row, rollupColumn, context)

    expect(result).toBe(8)
  })

  it('computes count of related rows', async () => {
    const row = createRow('row-1', 'db-1', { tasks: ['task-1', 'task-2', 'task-3'] })
    const relatedRows = [
      createRow('task-1', 'db-2', { name: 'Task 1' }),
      createRow('task-2', 'db-2', { name: 'Task 2' }),
      createRow('task-3', 'db-2', { name: 'Task 3' })
    ]
    const columns: ColumnDefinition[] = [
      { id: 'tasks', name: 'Tasks', type: 'relation', config: { targetDatabase: 'db-2' } }
    ]
    const rollupColumn = createRollupColumn('taskCount', 'tasks', 'name', 'count')
    const context = createMockContext(relatedRows, columns)

    const result = await computeRollup(row, rollupColumn, context)

    expect(result).toBe(3)
  })

  it('computes avg of related rows', async () => {
    const row = createRow('row-1', 'db-1', { tasks: ['task-1', 'task-2'] })
    const relatedRows = [
      createRow('task-1', 'db-2', { score: 80 }),
      createRow('task-2', 'db-2', { score: 100 })
    ]
    const columns: ColumnDefinition[] = [
      { id: 'tasks', name: 'Tasks', type: 'relation', config: { targetDatabase: 'db-2' } }
    ]
    const rollupColumn = createRollupColumn('avgScore', 'tasks', 'score', 'avg')
    const context = createMockContext(relatedRows, columns)

    const result = await computeRollup(row, rollupColumn, context)

    expect(result).toBe(90)
  })

  it('returns empty value when no related rows', async () => {
    const row = createRow('row-1', 'db-1', { tasks: [] })
    const columns: ColumnDefinition[] = [
      { id: 'tasks', name: 'Tasks', type: 'relation', config: { targetDatabase: 'db-2' } }
    ]
    const rollupColumn = createRollupColumn('totalHours', 'tasks', 'hours', 'sum')
    const context = createMockContext([], columns)

    const result = await computeRollup(row, rollupColumn, context)

    expect(result).toBe(0)
  })

  it('returns empty value when relation column not found', async () => {
    const row = createRow('row-1', 'db-1', {})
    const rollupColumn = createRollupColumn('total', 'nonexistent', 'value', 'sum')
    const context = createMockContext([], [])

    const result = await computeRollup(row, rollupColumn, context)

    expect(result).toBe(0)
  })

  it('throws error for non-rollup column', async () => {
    const row = createRow('row-1', 'db-1', {})
    const textColumn: ColumnDefinition = {
      id: 'name',
      name: 'Name',
      type: 'text',
      config: {}
    }
    const context = createMockContext([], [])

    await expect(computeRollup(row, textColumn, context)).rejects.toThrow('not a rollup column')
  })

  it('handles concat aggregation', async () => {
    const row = createRow('row-1', 'db-1', { tasks: ['task-1', 'task-2'] })
    const relatedRows = [
      createRow('task-1', 'db-2', { name: 'Task A' }),
      createRow('task-2', 'db-2', { name: 'Task B' })
    ]
    const columns: ColumnDefinition[] = [
      { id: 'tasks', name: 'Tasks', type: 'relation', config: { targetDatabase: 'db-2' } }
    ]
    const rollupColumn = createRollupColumn('allNames', 'tasks', 'name', 'concat')
    const context = createMockContext(relatedRows, columns)

    const result = await computeRollup(row, rollupColumn, context)

    expect(result).toBe('Task A, Task B')
  })
})

// ─── batchComputeRollups Tests ───────────────────────────────────────────────

describe('batchComputeRollups', () => {
  it('computes rollups for multiple rows', async () => {
    const rows = [
      createRow('row-1', 'db-1', { tasks: ['task-1'] }),
      createRow('row-2', 'db-1', { tasks: ['task-2', 'task-3'] })
    ]
    const columns: ColumnDefinition[] = [
      { id: 'tasks', name: 'Tasks', type: 'relation', config: { targetDatabase: 'db-2' } }
    ]
    const rollupColumn = createRollupColumn('taskCount', 'tasks', 'name', 'count')

    // Mock context that returns different related rows per row
    const context: RollupContext = {
      getRelatedRows: async (rowId) => {
        if (rowId === 'row-1') {
          return [createRow('task-1', 'db-2', { name: 'Task 1' })]
        }
        return [
          createRow('task-2', 'db-2', { name: 'Task 2' }),
          createRow('task-3', 'db-2', { name: 'Task 3' })
        ]
      },
      getColumns: async () => columns,
      getColumn: async (_dbId, colId) => columns.find((c) => c.id === colId)
    }

    const results = await batchComputeRollups(rows, rollupColumn, context)

    expect(results.get('row-1')).toBe(1)
    expect(results.get('row-2')).toBe(2)
  })
})

// ─── validateRollupConfig Tests ──────────────────────────────────────────────

describe('validateRollupConfig', () => {
  it('validates correct config', () => {
    const config: RollupColumnConfig = {
      relationColumn: 'tasks',
      targetColumn: 'hours',
      aggregation: 'sum'
    }
    const columns: ColumnDefinition[] = [
      { id: 'tasks', name: 'Tasks', type: 'relation', config: { targetDatabase: 'db-2' } }
    ]

    const result = validateRollupConfig(config, columns)

    expect(result.valid).toBe(true)
  })

  it('fails when relation column not found', () => {
    const config: RollupColumnConfig = {
      relationColumn: 'nonexistent',
      targetColumn: 'hours',
      aggregation: 'sum'
    }

    const result = validateRollupConfig(config, [])

    expect(result.valid).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('fails when column is not a relation', () => {
    const config: RollupColumnConfig = {
      relationColumn: 'name',
      targetColumn: 'hours',
      aggregation: 'sum'
    }
    const columns: ColumnDefinition[] = [{ id: 'name', name: 'Name', type: 'text', config: {} }]

    const result = validateRollupConfig(config, columns)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('not a relation column')
  })
})

// ─── Utility Function Tests ──────────────────────────────────────────────────

describe('isNumericAggregation', () => {
  it('returns true for numeric aggregations', () => {
    expect(isNumericAggregation('sum')).toBe(true)
    expect(isNumericAggregation('avg')).toBe(true)
    expect(isNumericAggregation('min')).toBe(true)
    expect(isNumericAggregation('max')).toBe(true)
  })

  it('returns false for non-numeric aggregations', () => {
    expect(isNumericAggregation('count')).toBe(false)
    expect(isNumericAggregation('concat')).toBe(false)
    expect(isNumericAggregation('unique')).toBe(false)
  })
})

describe('getAggregationResultType', () => {
  it('returns number for numeric aggregations', () => {
    expect(getAggregationResultType('sum')).toBe('number')
    expect(getAggregationResultType('avg')).toBe('number')
    expect(getAggregationResultType('count')).toBe('number')
  })

  it('returns text for concat', () => {
    expect(getAggregationResultType('concat')).toBe('text')
  })
})
