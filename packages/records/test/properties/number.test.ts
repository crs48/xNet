import { describe, it, expect } from 'vitest'
import { numberProperty } from '../../src/properties/number'
import type { PropertyConfig } from '../../src/types'

describe('numberProperty', () => {
  const config: PropertyConfig = {}

  describe('validate', () => {
    it('accepts numbers', () => {
      expect(numberProperty.validate(42, config).valid).toBe(true)
      expect(numberProperty.validate(3.14, config).valid).toBe(true)
      expect(numberProperty.validate(-10, config).valid).toBe(true)
    })

    it('accepts null', () => {
      expect(numberProperty.validate(null, config).valid).toBe(true)
    })

    it('rejects non-numbers', () => {
      expect(numberProperty.validate('42', config).valid).toBe(false)
      expect(numberProperty.validate(NaN, config).valid).toBe(false)
    })
  })

  describe('coerce', () => {
    it('converts strings to numbers', () => {
      expect(numberProperty.coerce('42', config)).toBe(42)
      expect(numberProperty.coerce('3.14', config)).toBeCloseTo(3.14)
    })

    it('returns null for invalid strings', () => {
      expect(numberProperty.coerce('not a number', config)).toBe(null)
    })

    it('returns null for null/undefined/empty', () => {
      expect(numberProperty.coerce(null, config)).toBe(null)
      expect(numberProperty.coerce(undefined, config)).toBe(null)
      expect(numberProperty.coerce('', config)).toBe(null)
    })
  })

  describe('format', () => {
    it('formats numbers', () => {
      expect(numberProperty.format(42, config)).toBe('42')
    })

    it('formats with precision', () => {
      expect(numberProperty.format(3.14159, { precision: 2 })).toBe('3.14')
    })

    it('formats as percent', () => {
      expect(numberProperty.format(0.5, { numberFormat: 'percent' })).toBe('50%')
    })

    it('formats as currency', () => {
      const result = numberProperty.format(99.99, {
        numberFormat: 'currency',
        currencyCode: 'USD',
        precision: 2
      })
      expect(result).toContain('99.99')
    })

    it('formats as duration', () => {
      expect(numberProperty.format(90, { numberFormat: 'duration' })).toBe('1:30')
    })

    it('returns empty string for null', () => {
      expect(numberProperty.format(null, config)).toBe('')
    })
  })

  describe('isEmpty', () => {
    it('returns true for null', () => {
      expect(numberProperty.isEmpty(null)).toBe(true)
    })

    it('returns false for 0', () => {
      expect(numberProperty.isEmpty(0)).toBe(false)
    })

    it('returns false for non-zero', () => {
      expect(numberProperty.isEmpty(42)).toBe(false)
    })
  })

  describe('applyFilter', () => {
    it('equals', () => {
      expect(numberProperty.applyFilter(42, 'equals', 42, config)).toBe(true)
      expect(numberProperty.applyFilter(42, 'equals', 43, config)).toBe(false)
    })

    it('notEquals', () => {
      expect(numberProperty.applyFilter(42, 'notEquals', 43, config)).toBe(true)
      expect(numberProperty.applyFilter(42, 'notEquals', 42, config)).toBe(false)
    })

    it('gt (greater than)', () => {
      expect(numberProperty.applyFilter(42, 'gt', 41, config)).toBe(true)
      expect(numberProperty.applyFilter(42, 'gt', 42, config)).toBe(false)
    })

    it('gte (greater than or equal)', () => {
      expect(numberProperty.applyFilter(42, 'gte', 42, config)).toBe(true)
      expect(numberProperty.applyFilter(42, 'gte', 43, config)).toBe(false)
    })

    it('lt (less than)', () => {
      expect(numberProperty.applyFilter(42, 'lt', 43, config)).toBe(true)
      expect(numberProperty.applyFilter(42, 'lt', 42, config)).toBe(false)
    })

    it('lte (less than or equal)', () => {
      expect(numberProperty.applyFilter(42, 'lte', 42, config)).toBe(true)
      expect(numberProperty.applyFilter(42, 'lte', 41, config)).toBe(false)
    })

    it('isEmpty', () => {
      expect(numberProperty.applyFilter(null, 'isEmpty', null, config)).toBe(true)
      expect(numberProperty.applyFilter(42, 'isEmpty', null, config)).toBe(false)
    })

    it('isNotEmpty', () => {
      expect(numberProperty.applyFilter(42, 'isNotEmpty', null, config)).toBe(true)
      expect(numberProperty.applyFilter(null, 'isNotEmpty', null, config)).toBe(false)
    })
  })

  describe('compare', () => {
    it('sorts numerically', () => {
      expect(numberProperty.compare(1, 10, config)).toBeLessThan(0)
      expect(numberProperty.compare(10, 1, config)).toBeGreaterThan(0)
      expect(numberProperty.compare(5, 5, config)).toBe(0)
    })

    it('handles null values (null sorts last)', () => {
      expect(numberProperty.compare(null, 5, config)).toBeGreaterThan(0)
      expect(numberProperty.compare(5, null, config)).toBeLessThan(0)
      expect(numberProperty.compare(null, null, config)).toBe(0)
    })
  })

  describe('serialize/deserialize', () => {
    it('roundtrips values', () => {
      const value = 42.5
      expect(numberProperty.deserialize(numberProperty.serialize(value))).toBe(value)
    })

    it('handles null', () => {
      expect(numberProperty.deserialize(numberProperty.serialize(null))).toBe(null)
    })
  })
})
