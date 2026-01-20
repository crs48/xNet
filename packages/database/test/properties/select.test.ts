import { describe, it, expect } from 'vitest'
import { selectProperty, getSelectOptionColor } from '../../src/properties/select'
import type { PropertyConfig, SelectOption } from '../../src/types'

describe('selectProperty', () => {
  const options: SelectOption[] = [
    { id: 'opt1', name: 'Option 1', color: '#ff0000' },
    { id: 'opt2', name: 'Option 2', color: '#00ff00' },
    { id: 'opt3', name: 'Option 3', color: '#0000ff' }
  ]
  const config: PropertyConfig = { options }

  describe('validate', () => {
    it('accepts valid option IDs', () => {
      expect(selectProperty.validate('opt1', config).valid).toBe(true)
    })

    it('accepts null', () => {
      expect(selectProperty.validate(null, config).valid).toBe(true)
    })

    it('accepts empty string', () => {
      expect(selectProperty.validate('', config).valid).toBe(true)
    })

    it('rejects invalid option IDs', () => {
      expect(selectProperty.validate('invalid', config).valid).toBe(false)
    })

    it('rejects non-strings', () => {
      expect(selectProperty.validate(123, config).valid).toBe(false)
    })
  })

  describe('coerce', () => {
    it('passes through valid strings', () => {
      expect(selectProperty.coerce('opt1', config)).toBe('opt1')
    })

    it('returns null for null/undefined/empty', () => {
      expect(selectProperty.coerce(null, config)).toBe(null)
      expect(selectProperty.coerce(undefined, config)).toBe(null)
      expect(selectProperty.coerce('', config)).toBe(null)
    })

    it('converts numbers to strings', () => {
      expect(selectProperty.coerce(123, config)).toBe('123')
    })
  })

  describe('format', () => {
    it('returns option name', () => {
      expect(selectProperty.format('opt1', config)).toBe('Option 1')
    })

    it('returns empty string for null', () => {
      expect(selectProperty.format(null, config)).toBe('')
    })

    it('returns raw value if option not found', () => {
      expect(selectProperty.format('unknown', config)).toBe('unknown')
    })
  })

  describe('isEmpty', () => {
    it('returns true for null', () => {
      expect(selectProperty.isEmpty(null)).toBe(true)
    })

    it('returns true for empty string', () => {
      expect(selectProperty.isEmpty('')).toBe(true)
    })

    it('returns false for valid value', () => {
      expect(selectProperty.isEmpty('opt1')).toBe(false)
    })
  })

  describe('applyFilter', () => {
    it('equals', () => {
      expect(selectProperty.applyFilter('opt1', 'equals', 'opt1', config)).toBe(true)
      expect(selectProperty.applyFilter('opt1', 'equals', 'opt2', config)).toBe(false)
    })

    it('notEquals', () => {
      expect(selectProperty.applyFilter('opt1', 'notEquals', 'opt2', config)).toBe(true)
      expect(selectProperty.applyFilter('opt1', 'notEquals', 'opt1', config)).toBe(false)
    })

    it('isAny', () => {
      expect(selectProperty.applyFilter('opt1', 'isAny', ['opt1', 'opt2'], config)).toBe(true)
      expect(selectProperty.applyFilter('opt3', 'isAny', ['opt1', 'opt2'], config)).toBe(false)
    })

    it('isNone', () => {
      expect(selectProperty.applyFilter('opt3', 'isNone', ['opt1', 'opt2'], config)).toBe(true)
      expect(selectProperty.applyFilter('opt1', 'isNone', ['opt1', 'opt2'], config)).toBe(false)
    })

    it('isEmpty', () => {
      expect(selectProperty.applyFilter(null, 'isEmpty', null, config)).toBe(true)
      expect(selectProperty.applyFilter('opt1', 'isEmpty', null, config)).toBe(false)
    })
  })

  describe('compare', () => {
    it('sorts by option order', () => {
      expect(selectProperty.compare('opt1', 'opt2', config)).toBeLessThan(0)
      expect(selectProperty.compare('opt2', 'opt1', config)).toBeGreaterThan(0)
      expect(selectProperty.compare('opt1', 'opt1', config)).toBe(0)
    })

    it('handles null values (null sorts last)', () => {
      expect(selectProperty.compare(null, 'opt1', config)).toBeGreaterThan(0)
      expect(selectProperty.compare('opt1', null, config)).toBeLessThan(0)
    })

    it('unknown options sort to end', () => {
      expect(selectProperty.compare('opt1', 'unknown', config)).toBeLessThan(0)
    })
  })

  describe('serialize/deserialize', () => {
    it('roundtrips values', () => {
      const value = 'opt1'
      expect(selectProperty.deserialize(selectProperty.serialize(value))).toBe(value)
    })

    it('handles null', () => {
      expect(selectProperty.deserialize(selectProperty.serialize(null))).toBe(null)
    })
  })

  describe('getSelectOptionColor', () => {
    it('returns option color', () => {
      expect(getSelectOptionColor('opt1', config)).toBe('#ff0000')
    })

    it('returns null for null value', () => {
      expect(getSelectOptionColor(null, config)).toBe(null)
    })

    it('returns null for unknown option', () => {
      expect(getSelectOptionColor('unknown', config)).toBe(null)
    })
  })
})
