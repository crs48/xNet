import { describe, expect, it } from 'vitest'
import {
  formatTaskShortId,
  parseTaskShortId,
  shortIdsFromBlock,
  taskBranchName
} from './task-identifiers'

describe('task short identifiers', () => {
  it('formats and parses round-trip', () => {
    expect(formatTaskShortId('xn', 142)).toBe('XN-142')
    expect(parseTaskShortId('XN-142')).toEqual({ prefix: 'XN', number: 142 })
    expect(parseTaskShortId('  ops-7  ')).toEqual({ prefix: 'OPS', number: 7 })
    expect(parseTaskShortId('not an id')).toBeNull()
    expect(parseTaskShortId('XN-0')).toBeNull()
  })

  it('builds branch names from identifiers and titles', () => {
    expect(taskBranchName('XN-142', 'Fix the grid!', 'crs')).toBe('crs/xn-142-fix-the-grid')
    expect(taskBranchName('XN-142', '')).toBe('xn-142')
    expect(taskBranchName('XN-9', 'Ünïcode  ~~ title')).toBe('xn-9-n-code-title')
  })

  it('enumerates identifiers from an allocated block', () => {
    const ids = [...shortIdsFromBlock({ prefix: 'XN', start: 3, end: 5 })]
    expect(ids).toEqual(['XN-3', 'XN-4', 'XN-5'])
  })
})
