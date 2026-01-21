/**
 * Tests for property handlers
 */

import { describe, it, expect } from 'vitest'
import { getPropertyHandler } from '../properties'

describe('Property Handlers', () => {
  describe('text handler', () => {
    const handler = getPropertyHandler('text')

    it('should compare text values', () => {
      expect(handler.compare('apple', 'banana')).toBeLessThan(0)
      expect(handler.compare('banana', 'apple')).toBeGreaterThan(0)
      expect(handler.compare('apple', 'apple')).toBe(0)
      expect(handler.compare(null, 'apple')).toBeLessThan(0)
      expect(handler.compare('apple', null)).toBeGreaterThan(0)
    })

    it('should filter text values', () => {
      expect(handler.applyFilter('Hello World', 'equals', 'hello world')).toBe(true)
      expect(handler.applyFilter('Hello World', 'equals', 'hello')).toBe(false)
      expect(handler.applyFilter('Hello World', 'contains', 'world')).toBe(true)
      expect(handler.applyFilter('Hello World', 'startsWith', 'hello')).toBe(true)
      expect(handler.applyFilter('Hello World', 'endsWith', 'world')).toBe(true)
      expect(handler.applyFilter('', 'isEmpty', null)).toBe(true)
      expect(handler.applyFilter('text', 'isNotEmpty', null)).toBe(true)
    })
  })

  describe('number handler', () => {
    const handler = getPropertyHandler('number')

    it('should compare number values', () => {
      expect(handler.compare(1, 2)).toBeLessThan(0)
      expect(handler.compare(2, 1)).toBeGreaterThan(0)
      expect(handler.compare(5, 5)).toBe(0)
      expect(handler.compare(null, 5)).toBeLessThan(0)
    })

    it('should filter number values', () => {
      expect(handler.applyFilter(10, 'equals', 10)).toBe(true)
      expect(handler.applyFilter(10, 'greaterThan', 5)).toBe(true)
      expect(handler.applyFilter(10, 'lessThan', 15)).toBe(true)
      expect(handler.applyFilter(10, 'greaterOrEqual', 10)).toBe(true)
      expect(handler.applyFilter(10, 'lessOrEqual', 10)).toBe(true)
    })
  })

  describe('checkbox handler', () => {
    const handler = getPropertyHandler('checkbox')

    it('should compare checkbox values', () => {
      expect(handler.compare(true, false)).toBeGreaterThan(0)
      expect(handler.compare(false, true)).toBeLessThan(0)
      expect(handler.compare(true, true)).toBe(0)
    })

    it('should filter checkbox values', () => {
      expect(handler.applyFilter(true, 'equals', true)).toBe(true)
      expect(handler.applyFilter(false, 'equals', false)).toBe(true)
      expect(handler.applyFilter(true, 'equals', false)).toBe(false)
    })
  })

  describe('date handler', () => {
    const handler = getPropertyHandler('date')
    const date1 = Date.now()
    const date2 = date1 + 86400000 // +1 day

    it('should compare date values', () => {
      expect(handler.compare(date1, date2)).toBeLessThan(0)
      expect(handler.compare(date2, date1)).toBeGreaterThan(0)
      expect(handler.compare(date1, date1)).toBe(0)
    })

    it('should filter date values', () => {
      expect(handler.applyFilter(date2, 'after', date1)).toBe(true)
      expect(handler.applyFilter(date1, 'before', date2)).toBe(true)
      expect(handler.applyFilter(date1, 'equals', date1)).toBe(true)
    })
  })

  describe('select handler', () => {
    const handler = getPropertyHandler('select')
    const config = {
      options: [
        { id: 'a', name: 'Apple', color: '#ff0000' },
        { id: 'b', name: 'Banana', color: '#ffff00' }
      ]
    }

    it('should compare select values by option name', () => {
      expect(handler.compare('a', 'b', config)).toBeLessThan(0) // Apple < Banana
      expect(handler.compare(null, 'a', config)).toBeLessThan(0) // '' < 'Apple'
    })

    it('should filter select values', () => {
      expect(handler.applyFilter('option1', 'equals', 'option1')).toBe(true)
      expect(handler.applyFilter('option1', 'notEquals', 'option2')).toBe(true)
    })
  })

  describe('multiSelect handler', () => {
    const handler = getPropertyHandler('multiSelect')

    it('should compare multiSelect values by length', () => {
      expect(handler.compare(['a'], ['a', 'b'])).toBeLessThan(0)
      expect(handler.compare(['a', 'b'], ['a'])).toBeGreaterThan(0)
    })

    it('should filter multiSelect values', () => {
      expect(handler.applyFilter(['a', 'b', 'c'], 'contains', 'b')).toBe(true)
      expect(handler.applyFilter(['a', 'b', 'c'], 'notContains', 'd')).toBe(true)
      expect(handler.applyFilter([], 'isEmpty', null)).toBe(true)
    })
  })

  describe('url handler', () => {
    const handler = getPropertyHandler('url')

    it('should filter url values', () => {
      expect(handler.applyFilter('https://example.com', 'contains', 'example')).toBe(true)
      expect(handler.applyFilter('', 'isEmpty', null)).toBe(true)
    })
  })

  describe('email handler', () => {
    const handler = getPropertyHandler('email')

    it('should filter email values', () => {
      expect(handler.applyFilter('test@example.com', 'contains', 'example')).toBe(true)
      expect(handler.applyFilter('test@example.com', 'endsWith', '.com')).toBe(true)
    })
  })

  describe('phone handler', () => {
    const handler = getPropertyHandler('phone')

    it('should filter phone values', () => {
      expect(handler.applyFilter('+1-555-123-4567', 'contains', '555')).toBe(true)
      expect(handler.applyFilter('+1-555-123-4567', 'startsWith', '+1')).toBe(true)
    })
  })

  describe('getPropertyHandler', () => {
    it('should return text handler for unknown types', () => {
      const handler = getPropertyHandler('unknown' as never)
      expect(handler.type).toBe('text')
    })

    it('should return correct handler for each type', () => {
      expect(getPropertyHandler('text').type).toBe('text')
      expect(getPropertyHandler('number').type).toBe('number')
      expect(getPropertyHandler('checkbox').type).toBe('checkbox')
      expect(getPropertyHandler('date').type).toBe('date')
      expect(getPropertyHandler('select').type).toBe('select')
      expect(getPropertyHandler('multiSelect').type).toBe('multiSelect')
      expect(getPropertyHandler('url').type).toBe('url')
      expect(getPropertyHandler('email').type).toBe('email')
      expect(getPropertyHandler('phone').type).toBe('phone')
    })
  })
})
