import { describe, it, expect } from 'vitest'
import { textProperty } from '../../src/properties/text'

describe('textProperty', () => {
  const config = {}

  describe('validate', () => {
    it('accepts strings', () => {
      expect(textProperty.validate('hello', config).valid).toBe(true)
    })

    it('accepts null', () => {
      expect(textProperty.validate(null, config).valid).toBe(true)
    })

    it('accepts undefined', () => {
      expect(textProperty.validate(undefined, config).valid).toBe(true)
    })

    it('rejects non-strings', () => {
      expect(textProperty.validate(123, config).valid).toBe(false)
      expect(textProperty.validate({}, config).valid).toBe(false)
    })
  })

  describe('coerce', () => {
    it('converts numbers to strings', () => {
      expect(textProperty.coerce(123, config)).toBe('123')
    })

    it('returns null for null/undefined/empty', () => {
      expect(textProperty.coerce(null, config)).toBe(null)
      expect(textProperty.coerce(undefined, config)).toBe(null)
      expect(textProperty.coerce('', config)).toBe(null)
    })
  })

  describe('format', () => {
    it('returns the string value', () => {
      expect(textProperty.format('hello', config)).toBe('hello')
    })

    it('returns empty string for null', () => {
      expect(textProperty.format(null, config)).toBe('')
    })
  })

  describe('isEmpty', () => {
    it('returns true for null', () => {
      expect(textProperty.isEmpty(null)).toBe(true)
    })

    it('returns true for empty string', () => {
      expect(textProperty.isEmpty('')).toBe(true)
    })

    it('returns false for non-empty string', () => {
      expect(textProperty.isEmpty('hello')).toBe(false)
    })
  })

  describe('applyFilter', () => {
    it('equals (case-insensitive)', () => {
      expect(textProperty.applyFilter('hello', 'equals', 'hello', config)).toBe(true)
      expect(textProperty.applyFilter('Hello', 'equals', 'hello', config)).toBe(true)
      expect(textProperty.applyFilter('hello', 'equals', 'world', config)).toBe(false)
    })

    it('notEquals', () => {
      expect(textProperty.applyFilter('hello', 'notEquals', 'world', config)).toBe(true)
      expect(textProperty.applyFilter('hello', 'notEquals', 'hello', config)).toBe(false)
    })

    it('contains', () => {
      expect(textProperty.applyFilter('hello world', 'contains', 'world', config)).toBe(true)
      expect(textProperty.applyFilter('hello', 'contains', 'world', config)).toBe(false)
    })

    it('notContains', () => {
      expect(textProperty.applyFilter('hello', 'notContains', 'world', config)).toBe(true)
      expect(textProperty.applyFilter('hello world', 'notContains', 'world', config)).toBe(false)
    })

    it('startsWith', () => {
      expect(textProperty.applyFilter('hello world', 'startsWith', 'hello', config)).toBe(true)
      expect(textProperty.applyFilter('hello world', 'startsWith', 'world', config)).toBe(false)
    })

    it('endsWith', () => {
      expect(textProperty.applyFilter('hello world', 'endsWith', 'world', config)).toBe(true)
      expect(textProperty.applyFilter('hello world', 'endsWith', 'hello', config)).toBe(false)
    })

    it('isEmpty', () => {
      expect(textProperty.applyFilter(null, 'isEmpty', null, config)).toBe(true)
      expect(textProperty.applyFilter('', 'isEmpty', null, config)).toBe(true)
      expect(textProperty.applyFilter('hello', 'isEmpty', null, config)).toBe(false)
    })

    it('isNotEmpty', () => {
      expect(textProperty.applyFilter('hello', 'isNotEmpty', null, config)).toBe(true)
      expect(textProperty.applyFilter(null, 'isNotEmpty', null, config)).toBe(false)
    })
  })

  describe('compare', () => {
    it('sorts alphabetically', () => {
      expect(textProperty.compare('apple', 'banana', config)).toBeLessThan(0)
      expect(textProperty.compare('banana', 'apple', config)).toBeGreaterThan(0)
      expect(textProperty.compare('apple', 'apple', config)).toBe(0)
    })

    it('handles null values', () => {
      expect(textProperty.compare(null, 'apple', config)).toBeLessThan(0)
      expect(textProperty.compare('apple', null, config)).toBeGreaterThan(0)
      expect(textProperty.compare(null, null, config)).toBe(0)
    })
  })

  describe('serialize/deserialize', () => {
    it('roundtrips values', () => {
      const value = 'hello world'
      expect(textProperty.deserialize(textProperty.serialize(value))).toBe(value)
    })

    it('handles null', () => {
      expect(textProperty.deserialize(textProperty.serialize(null))).toBe(null)
    })
  })
})
