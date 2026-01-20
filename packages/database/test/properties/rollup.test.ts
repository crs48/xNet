import { describe, it, expect } from 'vitest'
import { rollupProperty, computeRollup } from '../../src/properties/rollup'
import type { PropertyConfig } from '../../src/types'

describe('rollupProperty', () => {
  const config: PropertyConfig = {}

  describe('validate', () => {
    it('always returns valid (computed property)', () => {
      expect(rollupProperty.validate(42, config).valid).toBe(true)
      expect(rollupProperty.validate(null, config).valid).toBe(true)
      expect(rollupProperty.validate('anything', config).valid).toBe(true)
    })
  })

  describe('format', () => {
    it('formats count aggregations', () => {
      expect(rollupProperty.format(5, { rollupFunction: 'count' })).toBe('5')
    })

    it('formats percent aggregations', () => {
      expect(rollupProperty.format(0.75, { rollupFunction: 'percentNotEmpty' })).toBe('75%')
    })

    it('formats numeric aggregations', () => {
      expect(rollupProperty.format(3.14159, { rollupFunction: 'average' })).toBe('3.14')
    })

    it('formats showOriginal as comma-separated list', () => {
      expect(rollupProperty.format(['a', 'b', 'c'], { rollupFunction: 'showOriginal' })).toBe(
        'a, b, c'
      )
    })
  })

  describe('applyFilter', () => {
    it('numeric comparisons', () => {
      expect(rollupProperty.applyFilter(10, 'gt', 5, config)).toBe(true)
      expect(rollupProperty.applyFilter(5, 'gt', 10, config)).toBe(false)
      expect(rollupProperty.applyFilter(10, 'lte', 10, config)).toBe(true)
    })

    it('isEmpty/isNotEmpty', () => {
      expect(rollupProperty.applyFilter(null, 'isEmpty', null, config)).toBe(true)
      expect(rollupProperty.applyFilter(5, 'isNotEmpty', null, config)).toBe(true)
    })
  })

  describe('compare', () => {
    it('sorts numerically', () => {
      expect(rollupProperty.compare(5, 10, config)).toBeLessThan(0)
      expect(rollupProperty.compare(10, 5, config)).toBeGreaterThan(0)
    })

    it('handles null', () => {
      expect(rollupProperty.compare(null, 5, config)).toBeGreaterThan(0)
      expect(rollupProperty.compare(5, null, config)).toBeLessThan(0)
    })
  })
})

describe('computeRollup', () => {
  describe('count operations', () => {
    it('count returns total count', () => {
      expect(computeRollup([1, 2, null, 3], 'count')).toBe(4)
    })

    it('countValues excludes null/undefined', () => {
      expect(computeRollup([1, 2, null, undefined, 3], 'countValues')).toBe(3)
    })

    it('countUniqueValues counts unique non-null values', () => {
      expect(computeRollup([1, 2, 2, 3, 3, 3, null], 'countUniqueValues')).toBe(3)
    })

    it('countEmpty counts null/undefined/empty', () => {
      expect(computeRollup([1, null, '', undefined, 2], 'countEmpty')).toBe(3)
    })

    it('countNotEmpty counts non-empty values', () => {
      expect(computeRollup([1, null, '', undefined, 2], 'countNotEmpty')).toBe(2)
    })
  })

  describe('percent operations', () => {
    it('percentEmpty returns ratio of empty values', () => {
      expect(computeRollup([1, null, 2, null], 'percentEmpty')).toBe(0.5)
    })

    it('percentNotEmpty returns ratio of non-empty values', () => {
      expect(computeRollup([1, null, 2, null], 'percentNotEmpty')).toBe(0.5)
    })

    it('returns 0 for empty array', () => {
      expect(computeRollup([], 'percentEmpty')).toBe(0)
    })
  })

  describe('numeric aggregations', () => {
    it('sum adds all numbers', () => {
      expect(computeRollup([1, 2, 3, 4, 5], 'sum')).toBe(15)
    })

    it('sum ignores non-numbers', () => {
      expect(computeRollup([1, 'a', 2, null, 3], 'sum')).toBe(6)
    })

    it('average calculates mean', () => {
      expect(computeRollup([1, 2, 3, 4, 5], 'average')).toBe(3)
    })

    it('average returns null for empty', () => {
      expect(computeRollup([], 'average')).toBe(null)
    })

    it('median calculates middle value (odd count)', () => {
      expect(computeRollup([1, 2, 3, 4, 5], 'median')).toBe(3)
    })

    it('median calculates middle value (even count)', () => {
      expect(computeRollup([1, 2, 3, 4], 'median')).toBe(2.5)
    })

    it('min returns smallest number', () => {
      expect(computeRollup([5, 2, 8, 1, 9], 'min')).toBe(1)
    })

    it('max returns largest number', () => {
      expect(computeRollup([5, 2, 8, 1, 9], 'max')).toBe(9)
    })

    it('range returns max - min', () => {
      expect(computeRollup([1, 5, 10], 'range')).toBe(9)
    })
  })

  describe('show operations', () => {
    it('showOriginal returns all values as strings', () => {
      expect(computeRollup([1, 'hello', true], 'showOriginal')).toEqual(['1', 'hello', 'true'])
    })

    it('showUnique returns unique values as strings', () => {
      expect(computeRollup([1, 2, 2, 1, 3], 'showUnique')).toEqual(['1', '2', '3'])
    })
  })
})
