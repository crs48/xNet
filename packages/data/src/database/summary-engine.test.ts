/**
 * Tests for the column summary engine and row-height tiers.
 */

import { describe, it, expect } from 'vitest'
import {
  ROW_HEIGHT_PX,
  ROW_HEIGHTS,
  rowHeightLabel,
  resolveRowHeightPx,
  asRowHeight,
  DEFAULT_ROW_HEIGHT
} from './row-height'
import {
  SUMMARY_FUNCTIONS_BY_TYPE,
  summaryFunctionLabel,
  isFilledValue,
  computeColumnSummary,
  type SummaryRow,
  type SummaryColumnLike,
  type SummaryFunction
} from './summary-engine'

const rows = (...values: unknown[]): SummaryRow[] => values.map((v) => ({ cells: { c: v } }))
const numCol: SummaryColumnLike = { id: 'c', type: 'number' }
const textCol: SummaryColumnLike = { id: 'c', type: 'text' }
const checkCol: SummaryColumnLike = { id: 'c', type: 'checkbox' }
const dateCol: SummaryColumnLike = { id: 'c', type: 'date' }

const compute = (rs: SummaryRow[], col: SummaryColumnLike, fn: SummaryFunction) =>
  computeColumnSummary(rs, col, fn)

describe('SUMMARY_FUNCTIONS_BY_TYPE', () => {
  it('always offers none + the count family', () => {
    for (const fns of Object.values(SUMMARY_FUNCTIONS_BY_TYPE)) {
      expect(fns[0]).toBe('none')
      expect(fns).toContain('filled')
      expect(fns).toContain('unique')
    }
  })

  it('adds numeric functions only for number columns', () => {
    expect(SUMMARY_FUNCTIONS_BY_TYPE.number).toContain('sum')
    expect(SUMMARY_FUNCTIONS_BY_TYPE.number).toContain('median')
    expect(SUMMARY_FUNCTIONS_BY_TYPE.text).not.toContain('sum')
  })

  it('adds checkbox functions only for checkbox columns', () => {
    expect(SUMMARY_FUNCTIONS_BY_TYPE.checkbox).toContain('checked')
    expect(SUMMARY_FUNCTIONS_BY_TYPE.text).not.toContain('checked')
  })

  it('adds date functions only for date columns', () => {
    expect(SUMMARY_FUNCTIONS_BY_TYPE.date).toContain('earliest')
    expect(SUMMARY_FUNCTIONS_BY_TYPE.dateRange).toContain('latest')
    expect(SUMMARY_FUNCTIONS_BY_TYPE.number).not.toContain('earliest')
  })

  it('covers every column type', () => {
    // formula/rollup/auto types still resolve to the base set
    expect(SUMMARY_FUNCTIONS_BY_TYPE.formula).toEqual([
      'none',
      'filled',
      'empty',
      'percentFilled',
      'percentEmpty',
      'unique'
    ])
    expect(SUMMARY_FUNCTIONS_BY_TYPE.createdBy.length).toBeGreaterThan(0)
  })
})

describe('summaryFunctionLabel', () => {
  it('labels each function', () => {
    expect(summaryFunctionLabel('sum')).toBe('Sum')
    expect(summaryFunctionLabel('percentFilled')).toBe('Percent filled')
    expect(summaryFunctionLabel('none')).toBe('None')
  })
})

describe('isFilledValue', () => {
  it('treats null/undefined/blank/empty-array as empty', () => {
    expect(isFilledValue(null)).toBe(false)
    expect(isFilledValue(undefined)).toBe(false)
    expect(isFilledValue('')).toBe(false)
    expect(isFilledValue('  ')).toBe(false)
    expect(isFilledValue([])).toBe(false)
  })

  it('treats values, zero, false and non-empty arrays as filled', () => {
    expect(isFilledValue('x')).toBe(true)
    expect(isFilledValue(0)).toBe(true)
    expect(isFilledValue(false)).toBe(true)
    expect(isFilledValue(['a'])).toBe(true)
  })
})

describe('computeColumnSummary — count family', () => {
  it('counts filled and empty', () => {
    const rs = rows('a', '', 'b', null)
    expect(compute(rs, textCol, 'filled')).toMatchObject({ value: 2, display: '2' })
    expect(compute(rs, textCol, 'empty')).toMatchObject({ value: 2, display: '2' })
  })

  it('computes percentages rounded with a % suffix', () => {
    const rs = rows('a', '', 'b', '')
    expect(compute(rs, textCol, 'percentFilled')).toMatchObject({ value: 50, display: '50%' })
    expect(compute(rs, textCol, 'percentEmpty')).toMatchObject({ value: 50, display: '50%' })
  })

  it('counts unique filled values', () => {
    const rs = rows('a', 'a', 'b', null)
    expect(compute(rs, textCol, 'unique').value).toBe(2)
  })

  it('returns null percentages (—) for an empty row set', () => {
    expect(compute([], textCol, 'percentFilled')).toMatchObject({ value: null, display: '—' })
  })
})

describe('computeColumnSummary — numeric family', () => {
  const rs = rows(1, 2, 3, 4)

  it('sums, averages, min, max, range, median', () => {
    expect(compute(rs, numCol, 'sum').value).toBe(10)
    expect(compute(rs, numCol, 'average').value).toBe(2.5)
    expect(compute(rs, numCol, 'min').value).toBe(1)
    expect(compute(rs, numCol, 'max').value).toBe(4)
    expect(compute(rs, numCol, 'range').value).toBe(3)
    expect(compute(rs, numCol, 'median').value).toBe(2.5)
  })

  it('medians an odd-length set', () => {
    expect(compute(rows(3, 1, 2), numCol, 'median').value).toBe(2)
  })

  it('coerces numeric strings and ignores non-numbers', () => {
    expect(compute(rows('10', 'x', 5), numCol, 'sum').value).toBe(15)
  })

  it('returns null for numeric aggregates over no numbers', () => {
    expect(compute(rows('x', null), numCol, 'average')).toMatchObject({ value: null, display: '—' })
    expect(compute([], numCol, 'sum').value).toBe(0)
  })

  it('formats large numbers with grouping separators', () => {
    expect(compute(rows(1234567), numCol, 'sum').display).toBe('1,234,567')
  })
})

describe('computeColumnSummary — checkbox family', () => {
  const rs = rows(true, false, true, null)

  it('counts checked / unchecked', () => {
    expect(compute(rs, checkCol, 'checked').value).toBe(2)
    expect(compute(rs, checkCol, 'unchecked').value).toBe(2)
  })

  it('percentages checked / unchecked', () => {
    expect(compute(rs, checkCol, 'percentChecked').display).toBe('50%')
    expect(compute(rs, checkCol, 'percentUnchecked').display).toBe('50%')
  })
})

describe('computeColumnSummary — date family', () => {
  const rs = rows('2024-01-10', '2024-03-01', '2023-12-31')

  it('finds earliest and latest as ISO dates', () => {
    expect(compute(rs, dateCol, 'earliest').display).toBe('2023-12-31')
    expect(compute(rs, dateCol, 'latest').display).toBe('2024-03-01')
  })

  it('returns — when no parseable dates', () => {
    expect(compute(rows('nope', null), dateCol, 'earliest')).toMatchObject({
      value: null,
      display: '—'
    })
  })
})

describe('computeColumnSummary — none', () => {
  it('produces an empty display', () => {
    expect(compute(rows(1, 2), numCol, 'none')).toMatchObject({ value: null, display: '' })
  })
})

describe('row-height tiers', () => {
  it('maps every tier to a pixel height, densest first', () => {
    expect(ROW_HEIGHTS).toEqual(['short', 'medium', 'tall', 'extraTall'])
    expect(ROW_HEIGHT_PX.short).toBeLessThan(ROW_HEIGHT_PX.medium)
    expect(ROW_HEIGHT_PX.medium).toBeLessThan(ROW_HEIGHT_PX.tall)
    expect(ROW_HEIGHT_PX.tall).toBeLessThan(ROW_HEIGHT_PX.extraTall)
  })

  it('labels each tier', () => {
    expect(rowHeightLabel('short')).toBe('Short')
    expect(rowHeightLabel('extraTall')).toBe('Extra tall')
  })

  it('resolves persisted values and falls back to the default', () => {
    expect(resolveRowHeightPx('tall')).toBe(ROW_HEIGHT_PX.tall)
    expect(resolveRowHeightPx(undefined)).toBe(ROW_HEIGHT_PX[DEFAULT_ROW_HEIGHT])
    expect(resolveRowHeightPx('bogus')).toBe(ROW_HEIGHT_PX[DEFAULT_ROW_HEIGHT])
  })

  it('narrows arbitrary strings to a RowHeight', () => {
    expect(asRowHeight('medium')).toBe('medium')
    expect(asRowHeight('bogus')).toBe(DEFAULT_ROW_HEIGHT)
    expect(asRowHeight(null)).toBe(DEFAULT_ROW_HEIGHT)
  })
})
