/**
 * Tests for Evaluator
 */

import { describe, it, expect } from 'vitest'
import {
  evaluateFormula,
  validateFormula,
  compileFormula,
  extractPropertyReferences
} from '../index'

describe('Evaluator', () => {
  const context = {
    props: {
      price: 100,
      quantity: 5,
      name: 'Test',
      active: true,
      tags: ['a', 'b', 'c'],
      nested: { x: 1, y: 2 }
    }
  }

  describe('arithmetic', () => {
    it('should evaluate addition', () => {
      expect(evaluateFormula('1 + 2')).toBe(3)
    })

    it('should evaluate subtraction', () => {
      expect(evaluateFormula('10 - 3')).toBe(7)
    })

    it('should evaluate multiplication', () => {
      expect(evaluateFormula('4 * 5')).toBe(20)
    })

    it('should evaluate division', () => {
      expect(evaluateFormula('20 / 4')).toBe(5)
    })

    it('should handle division by zero', () => {
      expect(evaluateFormula('1 / 0')).toBe(Infinity)
    })

    it('should evaluate modulo', () => {
      expect(evaluateFormula('7 % 3')).toBe(1)
    })

    it('should evaluate power', () => {
      expect(evaluateFormula('2 ** 3')).toBe(8)
    })

    it('should respect operator precedence', () => {
      expect(evaluateFormula('1 + 2 * 3')).toBe(7)
      expect(evaluateFormula('(1 + 2) * 3')).toBe(9)
    })

    it('should handle negation', () => {
      expect(evaluateFormula('-5')).toBe(-5)
      expect(evaluateFormula('--5')).toBe(5)
    })
  })

  describe('comparison', () => {
    it('should evaluate equality', () => {
      expect(evaluateFormula('1 == 1')).toBe(true)
      expect(evaluateFormula('1 == 2')).toBe(false)
      expect(evaluateFormula('"a" == "a"')).toBe(true)
    })

    it('should evaluate inequality', () => {
      expect(evaluateFormula('1 != 2')).toBe(true)
      expect(evaluateFormula('1 != 1')).toBe(false)
    })

    it('should evaluate less than', () => {
      expect(evaluateFormula('1 < 2')).toBe(true)
      expect(evaluateFormula('2 < 1')).toBe(false)
    })

    it('should evaluate greater than', () => {
      expect(evaluateFormula('2 > 1')).toBe(true)
      expect(evaluateFormula('1 > 2')).toBe(false)
    })

    it('should evaluate less than or equal', () => {
      expect(evaluateFormula('1 <= 2')).toBe(true)
      expect(evaluateFormula('2 <= 2')).toBe(true)
      expect(evaluateFormula('3 <= 2')).toBe(false)
    })

    it('should evaluate greater than or equal', () => {
      expect(evaluateFormula('2 >= 1')).toBe(true)
      expect(evaluateFormula('2 >= 2')).toBe(true)
      expect(evaluateFormula('1 >= 2')).toBe(false)
    })
  })

  describe('logical', () => {
    it('should evaluate AND', () => {
      expect(evaluateFormula('true && true')).toBe(true)
      expect(evaluateFormula('true && false')).toBe(false)
    })

    it('should evaluate OR', () => {
      expect(evaluateFormula('true || false')).toBe(true)
      expect(evaluateFormula('false || false')).toBe(false)
    })

    it('should evaluate NOT', () => {
      expect(evaluateFormula('!true')).toBe(false)
      expect(evaluateFormula('!false')).toBe(true)
    })

    it('should short-circuit AND', () => {
      expect(evaluateFormula('false && unknownVar', context)).toBe(false)
    })

    it('should short-circuit OR', () => {
      expect(evaluateFormula('true || unknownVar', context)).toBe(true)
    })
  })

  describe('string operations', () => {
    it('should concatenate strings with +', () => {
      expect(evaluateFormula('"hello" + " " + "world"')).toBe('hello world')
    })

    it('should coerce numbers to strings', () => {
      expect(evaluateFormula('"value: " + 42')).toBe('value: 42')
    })
  })

  describe('property access', () => {
    it('should access properties via prop()', () => {
      expect(evaluateFormula('prop("price")', context)).toBe(100)
    })

    it('should access properties via identifier', () => {
      expect(evaluateFormula('price', context)).toBe(100)
    })

    it('should multiply properties', () => {
      expect(evaluateFormula('prop("price") * prop("quantity")', context)).toBe(500)
      expect(evaluateFormula('price * quantity', context)).toBe(500)
    })

    it('should return undefined for unknown properties', () => {
      expect(evaluateFormula('prop("unknown")', context)).toBeUndefined()
    })
  })

  describe('arrays', () => {
    it('should create arrays', () => {
      expect(evaluateFormula('[1, 2, 3]')).toEqual([1, 2, 3])
    })

    it('should access array elements', () => {
      expect(evaluateFormula('tags[0]', context)).toBe('a')
      expect(evaluateFormula('tags[1]', context)).toBe('b')
    })

    it('should access nested properties', () => {
      expect(evaluateFormula('nested.x', context)).toBe(1)
    })
  })

  describe('validation', () => {
    it('should validate correct formulas', () => {
      expect(validateFormula('1 + 2').valid).toBe(true)
      expect(validateFormula('prop("name")').valid).toBe(true)
      expect(validateFormula('if(a > b, "yes", "no")').valid).toBe(true)
    })

    it('should reject invalid formulas', () => {
      expect(validateFormula('1 +').valid).toBe(false)
      expect(validateFormula('((1)').valid).toBe(false)
      expect(validateFormula('foo(').valid).toBe(false)
    })

    it('should include error message', () => {
      const result = validateFormula('1 +')
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('compileFormula', () => {
    it('should compile and evaluate', () => {
      const formula = compileFormula('price * quantity')
      expect(formula.evaluate(context)).toBe(500)
    })

    it('should reuse compiled formula', () => {
      const formula = compileFormula('price * quantity')
      expect(formula.evaluate({ props: { price: 10, quantity: 3 } })).toBe(30)
      expect(formula.evaluate({ props: { price: 20, quantity: 2 } })).toBe(40)
    })
  })

  describe('extractPropertyReferences', () => {
    it('should extract prop() references', () => {
      const props = extractPropertyReferences('prop("price") * prop("quantity")')
      expect(props).toContain('price')
      expect(props).toContain('quantity')
    })

    it('should extract identifier references', () => {
      const props = extractPropertyReferences('price + tax')
      expect(props).toContain('price')
      expect(props).toContain('tax')
    })

    it('should handle complex expressions', () => {
      const props = extractPropertyReferences('if(prop("active"), prop("price") * quantity, 0)')
      expect(props).toContain('active')
      expect(props).toContain('price')
      expect(props).toContain('quantity')
    })
  })
})
