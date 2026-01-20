import { describe, it, expect } from 'vitest'
import {
  getPropertyHandler,
  hasPropertyHandler,
  getPropertyTypes,
  propertyCategories,
  getPropertyCategory,
  isComputedProperty,
  isMultiValueProperty
} from '../../src/properties/registry'

describe('Property Registry', () => {
  describe('getPropertyHandler', () => {
    it('returns handler for text', () => {
      const handler = getPropertyHandler('text')
      expect(handler.type).toBe('text')
    })

    it('returns handler for all basic types', () => {
      expect(getPropertyHandler('number').type).toBe('number')
      expect(getPropertyHandler('checkbox').type).toBe('checkbox')
    })

    it('returns handler for temporal types', () => {
      expect(getPropertyHandler('date').type).toBe('date')
      expect(getPropertyHandler('dateRange').type).toBe('dateRange')
    })

    it('returns handler for selection types', () => {
      expect(getPropertyHandler('select').type).toBe('select')
      expect(getPropertyHandler('multiSelect').type).toBe('multiSelect')
    })

    it('returns handler for reference types', () => {
      expect(getPropertyHandler('person').type).toBe('person')
      expect(getPropertyHandler('relation').type).toBe('relation')
      expect(getPropertyHandler('rollup').type).toBe('rollup')
    })

    it('returns handler for computed types', () => {
      expect(getPropertyHandler('formula').type).toBe('formula')
    })

    it('returns handler for rich types', () => {
      expect(getPropertyHandler('url').type).toBe('url')
      expect(getPropertyHandler('email').type).toBe('email')
      expect(getPropertyHandler('phone').type).toBe('phone')
      expect(getPropertyHandler('file').type).toBe('file')
    })

    it('returns handler for auto types', () => {
      expect(getPropertyHandler('created').type).toBe('created')
      expect(getPropertyHandler('updated').type).toBe('updated')
      expect(getPropertyHandler('createdBy').type).toBe('createdBy')
    })

    it('throws for unknown types', () => {
      expect(() => getPropertyHandler('unknown' as any)).toThrow('Unknown property type')
    })
  })

  describe('hasPropertyHandler', () => {
    it('returns true for valid types', () => {
      expect(hasPropertyHandler('text')).toBe(true)
      expect(hasPropertyHandler('number')).toBe(true)
    })

    it('returns false for invalid types', () => {
      expect(hasPropertyHandler('invalid')).toBe(false)
    })
  })

  describe('getPropertyTypes', () => {
    it('returns all 18 property types', () => {
      const types = getPropertyTypes()
      expect(types).toHaveLength(18)
      expect(types).toContain('text')
      expect(types).toContain('formula')
      expect(types).toContain('createdBy')
    })
  })

  describe('propertyCategories', () => {
    it('has all categories', () => {
      expect(propertyCategories.basic).toContain('text')
      expect(propertyCategories.temporal).toContain('date')
      expect(propertyCategories.selection).toContain('select')
      expect(propertyCategories.reference).toContain('relation')
      expect(propertyCategories.computed).toContain('formula')
      expect(propertyCategories.rich).toContain('url')
      expect(propertyCategories.auto).toContain('created')
    })
  })

  describe('getPropertyCategory', () => {
    it('returns correct category', () => {
      expect(getPropertyCategory('text')).toBe('basic')
      expect(getPropertyCategory('date')).toBe('temporal')
      expect(getPropertyCategory('select')).toBe('selection')
      expect(getPropertyCategory('relation')).toBe('reference')
      expect(getPropertyCategory('formula')).toBe('computed')
      expect(getPropertyCategory('email')).toBe('rich')
      expect(getPropertyCategory('created')).toBe('auto')
    })
  })

  describe('isComputedProperty', () => {
    it('returns true for computed types', () => {
      expect(isComputedProperty('formula')).toBe(true)
      expect(isComputedProperty('rollup')).toBe(true)
      expect(isComputedProperty('created')).toBe(true)
      expect(isComputedProperty('updated')).toBe(true)
      expect(isComputedProperty('createdBy')).toBe(true)
    })

    it('returns false for editable types', () => {
      expect(isComputedProperty('text')).toBe(false)
      expect(isComputedProperty('number')).toBe(false)
      expect(isComputedProperty('select')).toBe(false)
    })
  })

  describe('isMultiValueProperty', () => {
    it('returns true for multi-value types', () => {
      expect(isMultiValueProperty('multiSelect')).toBe(true)
      expect(isMultiValueProperty('person')).toBe(true)
      expect(isMultiValueProperty('relation')).toBe(true)
      expect(isMultiValueProperty('file')).toBe(true)
    })

    it('returns false for single-value types', () => {
      expect(isMultiValueProperty('text')).toBe(false)
      expect(isMultiValueProperty('number')).toBe(false)
      expect(isMultiValueProperty('select')).toBe(false)
    })
  })
})
