/**
 * Tests for useDatabaseComments hook utilities.
 *
 * Note: Testing the hook itself requires mocking useComments,
 * so we focus on the utility functions here.
 */
import { encodeAnchor, type CellAnchor, type RowAnchor, type ColumnAnchor } from '@xnet/data'
import { describe, it, expect } from 'vitest'
import { isDatabaseAnchorOrphaned, createCellKey, parseCellKey } from './useDatabaseComments'

describe('useDatabaseComments utilities', () => {
  describe('createCellKey', () => {
    it('creates a key from rowId and propertyKey', () => {
      expect(createCellKey('row-123', 'status')).toBe('row-123:status')
      expect(createCellKey('abc', 'def')).toBe('abc:def')
    })

    it('handles special characters', () => {
      expect(createCellKey('row:with:colons', 'prop')).toBe('row:with:colons:prop')
    })
  })

  describe('parseCellKey', () => {
    it('parses a cell key back to rowId and propertyKey', () => {
      expect(parseCellKey('row-123:status')).toEqual({
        rowId: 'row-123',
        propertyKey: 'status'
      })
    })

    it('returns null for invalid keys', () => {
      expect(parseCellKey('no-colon')).toBeNull()
      expect(parseCellKey('')).toBeNull()
    })

    it('handles keys with multiple colons', () => {
      // First colon is the separator
      const result = parseCellKey('row:with:colons:prop')
      expect(result).toEqual({
        rowId: 'row',
        propertyKey: 'with:colons:prop'
      })
    })
  })

  describe('isDatabaseAnchorOrphaned', () => {
    const existingRowIds = new Set(['row-1', 'row-2', 'row-3'])
    const existingPropertyKeys = new Set(['title', 'status', 'priority'])

    describe('cell anchors', () => {
      it('returns false when row and property exist', () => {
        const anchor: CellAnchor = { rowId: 'row-1', propertyKey: 'status' }
        expect(
          isDatabaseAnchorOrphaned(
            'cell',
            encodeAnchor(anchor),
            existingRowIds,
            existingPropertyKeys
          )
        ).toBe(false)
      })

      it('returns true when row does not exist', () => {
        const anchor: CellAnchor = { rowId: 'deleted-row', propertyKey: 'status' }
        expect(
          isDatabaseAnchorOrphaned(
            'cell',
            encodeAnchor(anchor),
            existingRowIds,
            existingPropertyKeys
          )
        ).toBe(true)
      })

      it('returns true when property does not exist', () => {
        const anchor: CellAnchor = { rowId: 'row-1', propertyKey: 'deleted-prop' }
        expect(
          isDatabaseAnchorOrphaned(
            'cell',
            encodeAnchor(anchor),
            existingRowIds,
            existingPropertyKeys
          )
        ).toBe(true)
      })

      it('returns true when both row and property do not exist', () => {
        const anchor: CellAnchor = { rowId: 'deleted-row', propertyKey: 'deleted-prop' }
        expect(
          isDatabaseAnchorOrphaned(
            'cell',
            encodeAnchor(anchor),
            existingRowIds,
            existingPropertyKeys
          )
        ).toBe(true)
      })
    })

    describe('row anchors', () => {
      it('returns false when row exists', () => {
        const anchor: RowAnchor = { rowId: 'row-2' }
        expect(
          isDatabaseAnchorOrphaned(
            'row',
            encodeAnchor(anchor),
            existingRowIds,
            existingPropertyKeys
          )
        ).toBe(false)
      })

      it('returns true when row does not exist', () => {
        const anchor: RowAnchor = { rowId: 'deleted-row' }
        expect(
          isDatabaseAnchorOrphaned(
            'row',
            encodeAnchor(anchor),
            existingRowIds,
            existingPropertyKeys
          )
        ).toBe(true)
      })
    })

    describe('column anchors', () => {
      it('returns false when property exists', () => {
        const anchor: ColumnAnchor = { propertyKey: 'title' }
        expect(
          isDatabaseAnchorOrphaned(
            'column',
            encodeAnchor(anchor),
            existingRowIds,
            existingPropertyKeys
          )
        ).toBe(false)
      })

      it('returns true when property does not exist', () => {
        const anchor: ColumnAnchor = { propertyKey: 'deleted-column' }
        expect(
          isDatabaseAnchorOrphaned(
            'column',
            encodeAnchor(anchor),
            existingRowIds,
            existingPropertyKeys
          )
        ).toBe(true)
      })
    })

    describe('invalid anchor data', () => {
      it('returns true for invalid JSON', () => {
        expect(
          isDatabaseAnchorOrphaned('cell', 'not-valid-json', existingRowIds, existingPropertyKeys)
        ).toBe(true)
      })

      it('returns true for empty string', () => {
        expect(isDatabaseAnchorOrphaned('row', '', existingRowIds, existingPropertyKeys)).toBe(true)
      })
    })
  })
})
