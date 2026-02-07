/**
 * Tests for filter, sort, and group engines.
 */

import type { ColumnDefinition } from './column-types'
import type { FilterGroup, SortConfig } from './view-types'
import { describe, it, expect } from 'vitest'
import {
  filterRows,
  createEqualsFilter,
  createAnyOfFilter,
  combineFiltersAnd,
  combineFiltersOr
} from './filter-engine'
import {
  OPERATORS_BY_TYPE,
  getOperatorsForType,
  isValidOperator,
  getOperatorLabel,
  operatorRequiresValue
} from './filter-operators'
import { groupRows, toggleGroupCollapsed, expandAllGroups, collapseAllGroups } from './group-engine'
import {
  executeQuery,
  createFilterQuery,
  createSortQuery,
  createPaginatedQuery,
  flattenGroups,
  getTotalFromGroups
} from './query-pipeline'
import {
  sortRows,
  createSort,
  toggleSortDirection,
  addOrToggleSort,
  removeSort
} from './sort-engine'

// ─── Test Data ────────────────────────────────────────────────────────────────

const columns: ColumnDefinition[] = [
  { id: 'name', type: 'text', name: 'Name', config: {} },
  { id: 'age', type: 'number', name: 'Age', config: {} },
  { id: 'active', type: 'checkbox', name: 'Active', config: {} },
  {
    id: 'status',
    type: 'select',
    name: 'Status',
    config: {
      options: [
        { id: 'active', name: 'Active', color: 'green' },
        { id: 'inactive', name: 'Inactive', color: 'gray' },
        { id: 'pending', name: 'Pending', color: 'yellow' }
      ]
    }
  },
  {
    id: 'tags',
    type: 'multiSelect',
    name: 'Tags',
    config: {
      options: [
        { id: 'urgent', name: 'Urgent', color: 'red' },
        { id: 'important', name: 'Important', color: 'orange' },
        { id: 'low', name: 'Low Priority', color: 'blue' }
      ]
    }
  },
  { id: 'email', type: 'email', name: 'Email', config: {} },
  { id: 'created', type: 'date', name: 'Created', config: {} }
]

const rows = [
  {
    id: '1',
    sortKey: 'a0',
    cells: {
      name: 'Alice',
      age: 30,
      active: true,
      status: 'active',
      tags: ['urgent', 'important'],
      email: 'alice@example.com',
      created: '2024-01-15'
    }
  },
  {
    id: '2',
    sortKey: 'a1',
    cells: {
      name: 'Bob',
      age: 25,
      active: false,
      status: 'inactive',
      tags: ['low'],
      email: 'bob@example.com',
      created: '2024-01-10'
    }
  },
  {
    id: '3',
    sortKey: 'a2',
    cells: {
      name: 'Charlie',
      age: 35,
      active: true,
      status: 'active',
      tags: ['important'],
      email: 'charlie@example.com',
      created: '2024-01-20'
    }
  },
  {
    id: '4',
    sortKey: 'a3',
    cells: {
      name: 'Diana',
      age: 28,
      active: false,
      status: 'pending',
      tags: [],
      email: '',
      created: '2024-01-05'
    }
  }
]

// ─── Filter Operators Tests ───────────────────────────────────────────────────

describe('Filter Operators', () => {
  describe('OPERATORS_BY_TYPE', () => {
    it('has operators for text type', () => {
      expect(OPERATORS_BY_TYPE.text).toContain('equals')
      expect(OPERATORS_BY_TYPE.text).toContain('contains')
      expect(OPERATORS_BY_TYPE.text).toContain('startsWith')
    })

    it('has operators for number type', () => {
      expect(OPERATORS_BY_TYPE.number).toContain('greaterThan')
      expect(OPERATORS_BY_TYPE.number).toContain('lessThan')
      expect(OPERATORS_BY_TYPE.number).toContain('between')
    })

    it('has operators for multiSelect type', () => {
      expect(OPERATORS_BY_TYPE.multiSelect).toContain('hasAny')
      expect(OPERATORS_BY_TYPE.multiSelect).toContain('hasAll')
      expect(OPERATORS_BY_TYPE.multiSelect).toContain('hasNone')
    })
  })

  describe('getOperatorsForType', () => {
    it('returns operators for known type', () => {
      const ops = getOperatorsForType('text')
      expect(ops).toContain('equals')
    })

    it('returns empty array for unknown type', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ops = getOperatorsForType('unknown' as unknown as ColumnDefinition['type'])
      expect(ops).toEqual([])
    })
  })

  describe('isValidOperator', () => {
    it('returns true for valid operator', () => {
      expect(isValidOperator('text', 'contains')).toBe(true)
    })

    it('returns false for invalid operator', () => {
      expect(isValidOperator('text', 'greaterThan')).toBe(false)
    })
  })

  describe('getOperatorLabel', () => {
    it('returns human-readable label', () => {
      expect(getOperatorLabel('greaterThan')).toBe('greater than')
      expect(getOperatorLabel('hasAny')).toBe('has any of')
    })
  })

  describe('operatorRequiresValue', () => {
    it('returns false for isEmpty/isNotEmpty', () => {
      expect(operatorRequiresValue('isEmpty')).toBe(false)
      expect(operatorRequiresValue('isNotEmpty')).toBe(false)
    })

    it('returns true for other operators', () => {
      expect(operatorRequiresValue('equals')).toBe(true)
      expect(operatorRequiresValue('contains')).toBe(true)
    })
  })
})

// ─── Filter Engine Tests ──────────────────────────────────────────────────────

describe('Filter Engine', () => {
  describe('filterRows', () => {
    it('returns all rows when filter is null', () => {
      const result = filterRows(rows, columns, null)
      expect(result).toHaveLength(4)
    })

    it('returns all rows when filter has no conditions', () => {
      const filter: FilterGroup = { operator: 'and', conditions: [] }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(4)
    })
  })

  describe('text filters', () => {
    it('filters by equals', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'name', operator: 'equals', value: 'Alice' }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('1')
    })

    it('filters by notEquals', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'name', operator: 'notEquals', value: 'Alice' }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(3)
    })

    it('filters by contains (case insensitive)', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'name', operator: 'contains', value: 'li' }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(2) // Alice, Charlie
    })

    it('filters by notContains', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'name', operator: 'notContains', value: 'li' }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(2) // Bob, Diana
    })

    it('filters by startsWith', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'name', operator: 'startsWith', value: 'A' }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('1')
    })

    it('filters by endsWith', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'name', operator: 'endsWith', value: 'e' }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(2) // Alice, Charlie
    })
  })

  describe('empty filters', () => {
    it('filters by isEmpty', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'email', operator: 'isEmpty', value: null }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('4') // Diana has empty email
    })

    it('filters by isNotEmpty', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'email', operator: 'isNotEmpty', value: null }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(3)
    })

    it('isEmpty works for empty arrays', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'tags', operator: 'isEmpty', value: null }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('4') // Diana has empty tags
    })
  })

  describe('number filters', () => {
    it('filters by greaterThan', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'age', operator: 'greaterThan', value: 28 }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(2) // Alice (30), Charlie (35)
    })

    it('filters by lessThan', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'age', operator: 'lessThan', value: 28 }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(1) // Bob (25)
    })

    it('filters by greaterOrEqual', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'age', operator: 'greaterOrEqual', value: 28 }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(3) // Alice, Diana, Charlie
    })

    it('filters by lessOrEqual', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'age', operator: 'lessOrEqual', value: 28 }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(2) // Bob, Diana
    })
  })

  describe('date filters', () => {
    it('filters by before', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'created', operator: 'before', value: '2024-01-12' }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(2) // Bob (10th), Diana (5th)
    })

    it('filters by after', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'created', operator: 'after', value: '2024-01-12' }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(2) // Alice (15th), Charlie (20th)
    })

    it('filters by between', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [
          { columnId: 'created', operator: 'between', value: ['2024-01-08', '2024-01-16'] }
        ]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(2) // Bob (10th), Alice (15th)
    })
  })

  describe('multiSelect filters', () => {
    it('filters by hasAny', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'tags', operator: 'hasAny', value: ['urgent', 'low'] }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(2) // Alice (urgent), Bob (low)
    })

    it('filters by hasAll', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'tags', operator: 'hasAll', value: ['urgent', 'important'] }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(1) // Alice has both
    })

    it('filters by hasNone', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'tags', operator: 'hasNone', value: ['urgent'] }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(3) // Bob, Charlie, Diana
    })
  })

  describe('AND/OR logic', () => {
    it('applies AND logic', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [
          { columnId: 'active', operator: 'equals', value: true },
          { columnId: 'age', operator: 'greaterThan', value: 32 }
        ]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(1) // Charlie (active AND age > 32)
    })

    it('applies OR logic', () => {
      const filter: FilterGroup = {
        operator: 'or',
        conditions: [
          { columnId: 'name', operator: 'equals', value: 'Alice' },
          { columnId: 'name', operator: 'equals', value: 'Bob' }
        ]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(2)
    })

    it('handles nested groups', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [
          { columnId: 'active', operator: 'equals', value: true },
          {
            operator: 'or',
            conditions: [
              { columnId: 'age', operator: 'lessThan', value: 31 },
              { columnId: 'age', operator: 'greaterThan', value: 34 }
            ]
          }
        ]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(2) // Alice (30, active) and Charlie (35, active)
    })
  })

  describe('helper functions', () => {
    it('createEqualsFilter creates correct filter', () => {
      const filter = createEqualsFilter('name', 'Alice')
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(1)
    })

    it('createAnyOfFilter creates OR filter', () => {
      const filter = createAnyOfFilter('name', ['Alice', 'Bob'])
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(2)
    })

    it('combineFiltersAnd combines with AND', () => {
      const filter = combineFiltersAnd([
        createEqualsFilter('active', true),
        createEqualsFilter('status', 'active')
      ])
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(2) // Alice, Charlie
    })

    it('combineFiltersOr combines with OR', () => {
      const filter = combineFiltersOr([
        createEqualsFilter('name', 'Alice'),
        createEqualsFilter('name', 'Diana')
      ])
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(2)
    })
  })

  describe('edge cases', () => {
    it('skips unknown columns', () => {
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'unknown', operator: 'equals', value: 'test' }]
      }
      const result = filterRows(rows, columns, filter)
      expect(result).toHaveLength(4) // All rows pass
    })

    it('handles null cell values', () => {
      const rowsWithNull = [...rows, { id: '5', sortKey: 'a4', cells: { name: null, age: null } }]
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'name', operator: 'isEmpty', value: null }]
      }
      const result = filterRows(rowsWithNull, columns, filter)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('5')
    })
  })
})

// ─── Sort Engine Tests ────────────────────────────────────────────────────────

describe('Sort Engine', () => {
  describe('sortRows', () => {
    it('sorts by sortKey when no sorts provided', () => {
      const shuffled = [rows[2], rows[0], rows[3], rows[1]]
      const result = sortRows(shuffled, columns, [])
      expect(result.map((r) => r.id)).toEqual(['1', '2', '3', '4'])
    })

    it('sorts by single column ascending', () => {
      const result = sortRows(rows, columns, [{ columnId: 'age', direction: 'asc' }])
      expect(result[0].id).toBe('2') // Bob (25)
      expect(result[1].id).toBe('4') // Diana (28)
      expect(result[2].id).toBe('1') // Alice (30)
      expect(result[3].id).toBe('3') // Charlie (35)
    })

    it('sorts by single column descending', () => {
      const result = sortRows(rows, columns, [{ columnId: 'age', direction: 'desc' }])
      expect(result[0].id).toBe('3') // Charlie (35)
      expect(result[3].id).toBe('2') // Bob (25)
    })

    it('sorts by text column', () => {
      const result = sortRows(rows, columns, [{ columnId: 'name', direction: 'asc' }])
      expect(result[0].cells.name).toBe('Alice')
      expect(result[1].cells.name).toBe('Bob')
      expect(result[2].cells.name).toBe('Charlie')
      expect(result[3].cells.name).toBe('Diana')
    })

    it('sorts by checkbox column', () => {
      const result = sortRows(rows, columns, [{ columnId: 'active', direction: 'asc' }])
      // false (0) before true (1)
      expect(result[0].cells.active).toBe(false)
      expect(result[1].cells.active).toBe(false)
      expect(result[2].cells.active).toBe(true)
      expect(result[3].cells.active).toBe(true)
    })

    it('sorts by date column', () => {
      const result = sortRows(rows, columns, [{ columnId: 'created', direction: 'asc' }])
      expect(result[0].id).toBe('4') // Jan 5
      expect(result[1].id).toBe('2') // Jan 10
      expect(result[2].id).toBe('1') // Jan 15
      expect(result[3].id).toBe('3') // Jan 20
    })

    it('sorts by multiple columns', () => {
      const rowsWithTies = [
        ...rows,
        { id: '5', sortKey: 'a4', cells: { name: 'Eve', age: 30, active: false, status: 'active' } }
      ]
      const result = sortRows(rowsWithTies, columns, [
        { columnId: 'age', direction: 'asc' },
        { columnId: 'name', direction: 'asc' }
      ])
      // Age 30: Alice before Eve (alphabetically)
      const age30 = result.filter((r) => r.cells.age === 30)
      expect(age30[0].cells.name).toBe('Alice')
      expect(age30[1].cells.name).toBe('Eve')
    })

    it('handles null values (sorts last)', () => {
      const rowsWithNull = [...rows, { id: '5', sortKey: 'a4', cells: { name: null, age: null } }]
      const result = sortRows(rowsWithNull, columns, [{ columnId: 'age', direction: 'asc' }])
      expect(result[result.length - 1].id).toBe('5') // null sorts last
    })

    it('does not mutate original array', () => {
      const original = [...rows]
      sortRows(rows, columns, [{ columnId: 'age', direction: 'desc' }])
      expect(rows).toEqual(original)
    })
  })

  describe('helper functions', () => {
    it('createSort creates sort config', () => {
      const sort = createSort('name', 'desc')
      expect(sort).toEqual({ columnId: 'name', direction: 'desc' })
    })

    it('toggleSortDirection toggles direction', () => {
      expect(toggleSortDirection('asc')).toBe('desc')
      expect(toggleSortDirection('desc')).toBe('asc')
    })

    it('addOrToggleSort adds new sort', () => {
      const sorts: SortConfig[] = [{ columnId: 'name', direction: 'asc' }]
      const result = addOrToggleSort(sorts, 'age')
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ columnId: 'age', direction: 'asc' })
    })

    it('addOrToggleSort toggles existing sort', () => {
      const sorts: SortConfig[] = [{ columnId: 'name', direction: 'asc' }]
      const result = addOrToggleSort(sorts, 'name')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ columnId: 'name', direction: 'desc' })
    })

    it('removeSort removes sort', () => {
      const sorts: SortConfig[] = [
        { columnId: 'name', direction: 'asc' },
        { columnId: 'age', direction: 'desc' }
      ]
      const result = removeSort(sorts, 'name')
      expect(result).toHaveLength(1)
      expect(result[0].columnId).toBe('age')
    })
  })
})

// ─── Group Engine Tests ───────────────────────────────────────────────────────

describe('Group Engine', () => {
  describe('groupRows', () => {
    it('returns single group when groupBy is null', () => {
      const groups = groupRows(rows, columns, null)
      expect(groups).toHaveLength(1)
      expect(groups[0].key).toBe('_all')
      expect(groups[0].label).toBe('All Items')
      expect(groups[0].rows).toHaveLength(4)
    })

    it('groups by select column', () => {
      const groups = groupRows(rows, columns, { columnId: 'status' })
      expect(groups.length).toBeGreaterThanOrEqual(3) // active, inactive, pending (+ empty options)

      const activeGroup = groups.find((g) => g.key === 'active')
      expect(activeGroup?.rows).toHaveLength(2) // Alice, Charlie
      expect(activeGroup?.label).toBe('Active')
      expect(activeGroup?.color).toBe('green')

      const inactiveGroup = groups.find((g) => g.key === 'inactive')
      expect(inactiveGroup?.rows).toHaveLength(1) // Bob
    })

    it('groups by checkbox column', () => {
      const groups = groupRows(rows, columns, { columnId: 'active' })

      const checkedGroup = groups.find((g) => g.key === 'checked')
      expect(checkedGroup?.rows).toHaveLength(2) // Alice, Charlie
      expect(checkedGroup?.label).toBe('Checked')

      const uncheckedGroup = groups.find((g) => g.key === 'unchecked')
      expect(uncheckedGroup?.rows).toHaveLength(2) // Bob, Diana
      expect(uncheckedGroup?.label).toBe('Unchecked')
    })

    it('groups by date column (by day)', () => {
      const groups = groupRows(rows, columns, { columnId: 'created' })
      expect(groups.length).toBe(4) // 4 different dates

      const jan15Group = groups.find((g) => g.key === '2024-01-15')
      expect(jan15Group?.rows).toHaveLength(1)
      expect(jan15Group?.rows[0].id).toBe('1') // Alice
    })

    it('handles empty values', () => {
      const rowsWithEmpty = [
        ...rows,
        { id: '5', sortKey: 'a4', cells: { name: 'Eve', status: null } }
      ]
      const groups = groupRows(rowsWithEmpty, columns, { columnId: 'status' })

      const emptyGroup = groups.find((g) => g.key === '_empty')
      expect(emptyGroup?.rows).toHaveLength(1)
      expect(emptyGroup?.label).toBe('Empty')
    })

    it('sorts groups ascending', () => {
      const groups = groupRows(rows, columns, { columnId: 'status', sort: 'asc' })
      // Select columns use option order, not alphabetical
      const keys = groups.map((g) => g.key).filter((k) => k !== '_empty')
      expect(keys[0]).toBe('active')
    })

    it('sorts groups descending', () => {
      const groups = groupRows(rows, columns, { columnId: 'status', sort: 'desc' })
      const keys = groups.map((g) => g.key).filter((k) => k !== '_empty')
      expect(keys[0]).toBe('pending')
    })

    it('marks collapsed groups', () => {
      const groups = groupRows(rows, columns, {
        columnId: 'status',
        collapsedGroups: ['active']
      })

      const activeGroup = groups.find((g) => g.key === 'active')
      expect(activeGroup?.collapsed).toBe(true)

      const inactiveGroup = groups.find((g) => g.key === 'inactive')
      expect(inactiveGroup?.collapsed).toBeFalsy()
    })
  })

  describe('aggregates', () => {
    it('calculates count', () => {
      const groups = groupRows(rows, columns, { columnId: 'status' })
      const activeGroup = groups.find((g) => g.key === 'active')
      expect(activeGroup?.aggregates.count).toBe(2)
    })

    it('calculates sum for number columns', () => {
      const groups = groupRows(rows, columns, { columnId: 'status' })
      const activeGroup = groups.find((g) => g.key === 'active')
      expect(activeGroup?.aggregates.age_sum).toBe(65) // 30 + 35
    })

    it('calculates avg for number columns', () => {
      const groups = groupRows(rows, columns, { columnId: 'status' })
      const activeGroup = groups.find((g) => g.key === 'active')
      expect(activeGroup?.aggregates.age_avg).toBe(32.5)
    })

    it('calculates min/max for number columns', () => {
      const groups = groupRows(rows, columns, { columnId: 'status' })
      const activeGroup = groups.find((g) => g.key === 'active')
      expect(activeGroup?.aggregates.age_min).toBe(30)
      expect(activeGroup?.aggregates.age_max).toBe(35)
    })

    it('calculates checked/unchecked for checkbox columns', () => {
      const groups = groupRows(rows, columns, { columnId: 'status' })
      const activeGroup = groups.find((g) => g.key === 'active')
      expect(activeGroup?.aggregates.active_checked).toBe(2) // Both Alice and Charlie are active
    })
  })

  describe('helper functions', () => {
    it('toggleGroupCollapsed adds group to collapsed', () => {
      const result = toggleGroupCollapsed([], 'active')
      expect(result).toContain('active')
    })

    it('toggleGroupCollapsed removes group from collapsed', () => {
      const result = toggleGroupCollapsed(['active', 'inactive'], 'active')
      expect(result).not.toContain('active')
      expect(result).toContain('inactive')
    })

    it('expandAllGroups returns empty array', () => {
      expect(expandAllGroups()).toEqual([])
    })

    it('collapseAllGroups returns all group keys', () => {
      const groups = groupRows(rows, columns, { columnId: 'status' })
      const collapsed = collapseAllGroups(groups)
      expect(collapsed).toContain('active')
      expect(collapsed).toContain('inactive')
      expect(collapsed).toContain('pending')
    })
  })
})

// ─── Query Pipeline Tests ─────────────────────────────────────────────────────

describe('Query Pipeline', () => {
  describe('executeQuery', () => {
    it('returns all rows with no options', () => {
      const result = executeQuery(rows, columns, {})
      expect(result.total).toBe(4)
      expect(result.filtered).toBe(4)
      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].rows).toHaveLength(4)
    })

    it('applies filter', () => {
      const result = executeQuery(rows, columns, {
        filter: createEqualsFilter('active', true)
      })
      expect(result.total).toBe(4)
      expect(result.filtered).toBe(2)
      expect(result.groups[0].rows).toHaveLength(2)
    })

    it('applies sort', () => {
      const result = executeQuery(rows, columns, {
        sorts: [{ columnId: 'age', direction: 'asc' }]
      })
      const flatRows = flattenGroups(result.groups)
      expect(flatRows[0].id).toBe('2') // Bob (25)
    })

    it('applies groupBy', () => {
      const result = executeQuery(rows, columns, {
        groupBy: { columnId: 'status' }
      })
      expect(result.groups.length).toBeGreaterThan(1)
    })

    it('applies filter -> sort -> group pipeline', () => {
      const result = executeQuery(rows, columns, {
        filter: createEqualsFilter('active', true),
        sorts: [{ columnId: 'age', direction: 'desc' }],
        groupBy: { columnId: 'status' }
      })

      // Only active rows
      expect(result.filtered).toBe(2)

      // Grouped by status
      const activeGroup = result.groups.find((g) => g.key === 'active')
      expect(activeGroup?.rows).toHaveLength(2)

      // Sorted by age desc within group
      expect(activeGroup?.rows[0].id).toBe('3') // Charlie (35)
      expect(activeGroup?.rows[1].id).toBe('1') // Alice (30)
    })

    it('applies pagination', () => {
      const result = executeQuery(rows, columns, {
        sorts: [{ columnId: 'age', direction: 'asc' }],
        offset: 1,
        limit: 2
      })
      const flatRows = flattenGroups(result.groups)
      expect(flatRows).toHaveLength(2)
      expect(flatRows[0].id).toBe('4') // Diana (28) - second after Bob
      expect(flatRows[1].id).toBe('1') // Alice (30)
    })
  })

  describe('helper functions', () => {
    it('createFilterQuery creates query with filter', () => {
      const query = createFilterQuery(createEqualsFilter('name', 'Alice'))
      expect(query.filter).toBeDefined()
    })

    it('createSortQuery creates query with sorts', () => {
      const query = createSortQuery([createSort('name', 'asc')])
      expect(query.sorts).toHaveLength(1)
    })

    it('createPaginatedQuery creates paginated query', () => {
      const query = createPaginatedQuery(2, 10, { filter: createEqualsFilter('active', true) })
      expect(query.offset).toBe(20)
      expect(query.limit).toBe(10)
      expect(query.filter).toBeDefined()
    })

    it('flattenGroups flattens groups to rows', () => {
      const groups = groupRows(rows, columns, { columnId: 'status' })
      const flat = flattenGroups(groups)
      expect(flat).toHaveLength(4)
    })

    it('getTotalFromGroups counts all rows', () => {
      const groups = groupRows(rows, columns, { columnId: 'status' })
      expect(getTotalFromGroups(groups)).toBe(4)
    })
  })
})
