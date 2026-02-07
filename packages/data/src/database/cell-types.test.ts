/**
 * Tests for cell types and utilities.
 */

import { describe, it, expect } from 'vitest'
import {
  cellKey,
  isCellKey,
  columnIdFromKey,
  toCellProperties,
  fromCellProperties,
  isDateRange,
  isFileRef,
  isCellValue,
  CELL_PREFIX
} from './cell-types'

describe('Cell Key Utilities', () => {
  describe('cellKey', () => {
    it('should prefix column ID with cell_', () => {
      expect(cellKey('name')).toBe('cell_name')
      expect(cellKey('status')).toBe('cell_status')
      expect(cellKey('priority')).toBe('cell_priority')
    })

    it('should handle empty string', () => {
      expect(cellKey('')).toBe('cell_')
    })
  })

  describe('isCellKey', () => {
    it('should return true for cell keys', () => {
      expect(isCellKey('cell_name')).toBe(true)
      expect(isCellKey('cell_status')).toBe(true)
      expect(isCellKey('cell_')).toBe(true)
    })

    it('should return false for non-cell keys', () => {
      expect(isCellKey('name')).toBe(false)
      expect(isCellKey('database')).toBe(false)
      expect(isCellKey('sortKey')).toBe(false)
      expect(isCellKey('')).toBe(false)
    })
  })

  describe('columnIdFromKey', () => {
    it('should extract column ID from cell key', () => {
      expect(columnIdFromKey('cell_name')).toBe('name')
      expect(columnIdFromKey('cell_status')).toBe('status')
      expect(columnIdFromKey('cell_')).toBe('')
    })

    it('should throw for non-cell keys', () => {
      expect(() => columnIdFromKey('name')).toThrow('Not a cell key')
      expect(() => columnIdFromKey('database')).toThrow('Not a cell key')
    })
  })

  describe('toCellProperties', () => {
    it('should convert column IDs to cell keys', () => {
      const cells = {
        name: 'John Doe',
        age: 30,
        active: true
      }

      const result = toCellProperties(cells)

      expect(result).toEqual({
        cell_name: 'John Doe',
        cell_age: 30,
        cell_active: true
      })
    })

    it('should handle empty object', () => {
      expect(toCellProperties({})).toEqual({})
    })

    it('should handle null values', () => {
      const cells = { name: null, status: 'active' }
      const result = toCellProperties(cells)

      expect(result).toEqual({
        cell_name: null,
        cell_status: 'active'
      })
    })
  })

  describe('fromCellProperties', () => {
    it('should extract cell values from properties', () => {
      const properties = {
        cell_name: 'John Doe',
        cell_age: 30,
        database: 'db_123',
        sortKey: 'a0'
      }

      const result = fromCellProperties(properties)

      expect(result).toEqual({
        name: 'John Doe',
        age: 30
      })
    })

    it('should handle empty object', () => {
      expect(fromCellProperties({})).toEqual({})
    })

    it('should handle properties with no cell values', () => {
      const properties = {
        database: 'db_123',
        sortKey: 'a0'
      }

      expect(fromCellProperties(properties)).toEqual({})
    })
  })
})

describe('Type Guards', () => {
  describe('isDateRange', () => {
    it('should return true for valid date ranges', () => {
      expect(isDateRange({ start: '2024-01-01', end: '2024-01-31' })).toBe(true)
      expect(isDateRange({ start: '', end: '' })).toBe(true)
    })

    it('should return false for invalid date ranges', () => {
      expect(isDateRange(null)).toBe(false)
      expect(isDateRange(undefined)).toBe(false)
      expect(isDateRange({})).toBe(false)
      expect(isDateRange({ start: '2024-01-01' })).toBe(false)
      expect(isDateRange({ end: '2024-01-31' })).toBe(false)
      expect(isDateRange({ start: 123, end: '2024-01-31' })).toBe(false)
      expect(isDateRange('2024-01-01')).toBe(false)
    })
  })

  describe('isFileRef', () => {
    it('should return true for valid file refs', () => {
      expect(
        isFileRef({
          id: 'file_123',
          name: 'document.pdf',
          size: 1024,
          type: 'application/pdf',
          url: 'https://example.com/file.pdf'
        })
      ).toBe(true)
    })

    it('should return false for invalid file refs', () => {
      expect(isFileRef(null)).toBe(false)
      expect(isFileRef(undefined)).toBe(false)
      expect(isFileRef({})).toBe(false)
      expect(isFileRef({ id: 'file_123' })).toBe(false)
      expect(
        isFileRef({
          id: 'file_123',
          name: 'document.pdf',
          size: '1024', // wrong type
          type: 'application/pdf',
          url: 'https://example.com/file.pdf'
        })
      ).toBe(false)
    })
  })

  describe('isCellValue', () => {
    it('should return true for valid cell values', () => {
      // Primitives
      expect(isCellValue(null)).toBe(true)
      expect(isCellValue('text')).toBe(true)
      expect(isCellValue(123)).toBe(true)
      expect(isCellValue(true)).toBe(true)
      expect(isCellValue(false)).toBe(true)

      // Arrays of strings
      expect(isCellValue([])).toBe(true)
      expect(isCellValue(['a', 'b', 'c'])).toBe(true)

      // DateRange
      expect(isCellValue({ start: '2024-01-01', end: '2024-01-31' })).toBe(true)

      // FileRef
      expect(
        isCellValue({
          id: 'file_123',
          name: 'doc.pdf',
          size: 1024,
          type: 'application/pdf',
          url: 'https://example.com/file.pdf'
        })
      ).toBe(true)
    })

    it('should return false for invalid cell values', () => {
      expect(isCellValue(undefined)).toBe(false)
      expect(isCellValue([1, 2, 3])).toBe(false) // array of numbers
      expect(isCellValue({ foo: 'bar' })).toBe(false) // random object
      expect(isCellValue(() => {})).toBe(false) // function
      expect(isCellValue(Symbol('test'))).toBe(false) // symbol
    })
  })
})

describe('CELL_PREFIX', () => {
  it('should be cell_', () => {
    expect(CELL_PREFIX).toBe('cell_')
  })
})
