/**
 * Tests for built-in functions
 */

import { describe, it, expect } from 'vitest'
import { evaluateFormula } from '../index'

describe('Functions', () => {
  describe('math functions', () => {
    it('should calculate abs', () => {
      expect(evaluateFormula('abs(-5)')).toBe(5)
      expect(evaluateFormula('abs(5)')).toBe(5)
    })

    it('should calculate ceil', () => {
      expect(evaluateFormula('ceil(3.2)')).toBe(4)
      expect(evaluateFormula('ceil(3.9)')).toBe(4)
    })

    it('should calculate floor', () => {
      expect(evaluateFormula('floor(3.9)')).toBe(3)
      expect(evaluateFormula('floor(3.2)')).toBe(3)
    })

    it('should calculate round', () => {
      expect(evaluateFormula('round(3.4)')).toBe(3)
      expect(evaluateFormula('round(3.5)')).toBe(4)
      expect(evaluateFormula('round(3.14159, 2)')).toBe(3.14)
    })

    it('should calculate sqrt', () => {
      expect(evaluateFormula('sqrt(16)')).toBe(4)
      expect(evaluateFormula('sqrt(2)')).toBeCloseTo(1.414, 2)
    })

    it('should calculate pow', () => {
      expect(evaluateFormula('pow(2, 3)')).toBe(8)
      expect(evaluateFormula('pow(10, 2)')).toBe(100)
    })

    it('should calculate min', () => {
      expect(evaluateFormula('min(1, 2, 3)')).toBe(1)
      expect(evaluateFormula('min(5, 3, 7)')).toBe(3)
    })

    it('should calculate max', () => {
      expect(evaluateFormula('max(1, 2, 3)')).toBe(3)
      expect(evaluateFormula('max(5, 3, 7)')).toBe(7)
    })

    it('should calculate sum', () => {
      expect(evaluateFormula('sum(1, 2, 3)')).toBe(6)
      expect(evaluateFormula('sum(10, 20, 30)')).toBe(60)
    })

    it('should calculate average', () => {
      expect(evaluateFormula('average(1, 2, 3)')).toBe(2)
      expect(evaluateFormula('average(10, 20)')).toBe(15)
    })

    it('should calculate median', () => {
      expect(evaluateFormula('median(1, 2, 3)')).toBe(2)
      expect(evaluateFormula('median(1, 2, 3, 4)')).toBe(2.5)
    })

    it('should calculate sign', () => {
      expect(evaluateFormula('sign(5)')).toBe(1)
      expect(evaluateFormula('sign(-5)')).toBe(-1)
      expect(evaluateFormula('sign(0)')).toBe(0)
    })

    it('should calculate mod', () => {
      expect(evaluateFormula('mod(7, 3)')).toBe(1)
      expect(evaluateFormula('mod(10, 5)')).toBe(0)
    })

    it('should return constants', () => {
      expect(evaluateFormula('pi()')).toBeCloseTo(3.14159, 4)
      expect(evaluateFormula('e()')).toBeCloseTo(2.71828, 4)
    })
  })

  describe('string functions', () => {
    it('should concatenate strings', () => {
      expect(evaluateFormula('concat("a", "b", "c")')).toBe('abc')
    })

    it('should convert to lowercase', () => {
      expect(evaluateFormula('lower("HELLO")')).toBe('hello')
    })

    it('should convert to uppercase', () => {
      expect(evaluateFormula('upper("hello")')).toBe('HELLO')
    })

    it('should capitalize', () => {
      expect(evaluateFormula('capitalize("hello")')).toBe('Hello')
    })

    it('should get length', () => {
      expect(evaluateFormula('length("hello")')).toBe(5)
    })

    it('should check contains', () => {
      expect(evaluateFormula('contains("hello world", "world")')).toBe(true)
      expect(evaluateFormula('contains("hello world", "foo")')).toBe(false)
    })

    it('should check startsWith', () => {
      expect(evaluateFormula('startsWith("hello", "he")')).toBe(true)
      expect(evaluateFormula('startsWith("hello", "lo")')).toBe(false)
    })

    it('should check endsWith', () => {
      expect(evaluateFormula('endsWith("hello", "lo")')).toBe(true)
      expect(evaluateFormula('endsWith("hello", "he")')).toBe(false)
    })

    it('should replace substring', () => {
      expect(evaluateFormula('replace("hello world", "world", "there")')).toBe('hello there')
    })

    it('should replace all occurrences', () => {
      expect(evaluateFormula('replaceAll("a-b-c", "-", "_")')).toBe('a_b_c')
    })

    it('should slice string', () => {
      expect(evaluateFormula('slice("hello", 0, 2)')).toBe('he')
      expect(evaluateFormula('slice("hello", 2)')).toBe('llo')
    })

    it('should trim string', () => {
      expect(evaluateFormula('trim("  hello  ")')).toBe('hello')
    })

    it('should split string', () => {
      expect(evaluateFormula('split("a,b,c", ",")')).toEqual(['a', 'b', 'c'])
    })

    it('should join array', () => {
      expect(evaluateFormula('join(["a", "b", "c"], "-")')).toBe('a-b-c')
    })

    it('should find indexOf', () => {
      expect(evaluateFormula('indexOf("hello", "l")')).toBe(2)
      expect(evaluateFormula('indexOf("hello", "x")')).toBe(-1)
    })

    it('should test regex', () => {
      expect(evaluateFormula('test("hello123", "[0-9]+")')).toBe(true)
      expect(evaluateFormula('test("hello", "[0-9]+")')).toBe(false)
    })
  })

  describe('date functions', () => {
    it('should return now', () => {
      const before = Date.now()
      const result = evaluateFormula('now()') as number
      const after = Date.now()
      expect(result).toBeGreaterThanOrEqual(before)
      expect(result).toBeLessThanOrEqual(after)
    })

    it('should return today', () => {
      const result = evaluateFormula('today()') as number
      const expected = new Date()
      expected.setHours(0, 0, 0, 0)
      expect(result).toBe(expected.getTime())
    })

    it('should create date from components', () => {
      const result = evaluateFormula('date(2024, 6, 15)') as number
      const date = new Date(result)
      expect(date.getFullYear()).toBe(2024)
      expect(date.getMonth()).toBe(5) // 0-indexed
      expect(date.getDate()).toBe(15)
    })

    it('should add to date', () => {
      const timestamp = new Date(2024, 0, 1).getTime()
      const result = evaluateFormula(`dateAdd(${timestamp}, 7, "days")`) as number
      const date = new Date(result)
      expect(date.getDate()).toBe(8)
    })

    it('should diff dates', () => {
      const date1 = new Date(2024, 0, 15).getTime()
      const date2 = new Date(2024, 0, 10).getTime()
      const result = evaluateFormula(`dateDiff(${date1}, ${date2}, "days")`)
      expect(result).toBe(5)
    })

    it('should extract year', () => {
      const timestamp = new Date(2024, 5, 15).getTime()
      expect(evaluateFormula(`year(${timestamp})`)).toBe(2024)
    })

    it('should extract month', () => {
      const timestamp = new Date(2024, 5, 15).getTime()
      expect(evaluateFormula(`month(${timestamp})`)).toBe(6) // 1-indexed
    })

    it('should extract day', () => {
      const timestamp = new Date(2024, 5, 15).getTime()
      expect(evaluateFormula(`day(${timestamp})`)).toBe(15)
    })

    it('should extract hour', () => {
      const timestamp = new Date(2024, 5, 15, 14, 30).getTime()
      expect(evaluateFormula(`hour(${timestamp})`)).toBe(14)
    })

    it('should extract minute', () => {
      const timestamp = new Date(2024, 5, 15, 14, 30).getTime()
      expect(evaluateFormula(`minute(${timestamp})`)).toBe(30)
    })
  })

  describe('logic functions', () => {
    it('should evaluate if', () => {
      expect(evaluateFormula('if(true, "yes", "no")')).toBe('yes')
      expect(evaluateFormula('if(false, "yes", "no")')).toBe('no')
      expect(evaluateFormula('if(1 > 0, "positive", "not positive")')).toBe('positive')
    })

    it('should evaluate switch', () => {
      expect(evaluateFormula('switch(1, 1, "one", 2, "two", "other")')).toBe('one')
      expect(evaluateFormula('switch(2, 1, "one", 2, "two", "other")')).toBe('two')
      expect(evaluateFormula('switch(3, 1, "one", 2, "two", "other")')).toBe('other')
    })

    it('should evaluate and', () => {
      expect(evaluateFormula('and(true, true)')).toBe(true)
      expect(evaluateFormula('and(true, false)')).toBe(false)
    })

    it('should evaluate or', () => {
      expect(evaluateFormula('or(true, false)')).toBe(true)
      expect(evaluateFormula('or(false, false)')).toBe(false)
    })

    it('should evaluate not', () => {
      expect(evaluateFormula('not(true)')).toBe(false)
      expect(evaluateFormula('not(false)')).toBe(true)
    })

    it('should check empty', () => {
      expect(evaluateFormula('empty("")')).toBe(true)
      expect(evaluateFormula('empty(null)')).toBe(true)
      expect(evaluateFormula('empty([])')).toBe(true)
      expect(evaluateFormula('empty("hello")')).toBe(false)
    })

    it('should coalesce values', () => {
      expect(evaluateFormula('coalesce(null, "", "default")')).toBe('default')
      expect(evaluateFormula('coalesce("first", "second")')).toBe('first')
    })

    it('should check in', () => {
      expect(evaluateFormula('in(1, 1, 2, 3)')).toBe(true)
      expect(evaluateFormula('in(5, 1, 2, 3)')).toBe(false)
      expect(evaluateFormula('in("a", ["a", "b", "c"])')).toBe(true)
    })

    it('should check isNumber', () => {
      expect(evaluateFormula('isNumber(42)')).toBe(true)
      expect(evaluateFormula('isNumber("42")')).toBe(false)
    })

    it('should check isString', () => {
      expect(evaluateFormula('isString("hello")')).toBe(true)
      expect(evaluateFormula('isString(42)')).toBe(false)
    })

    it('should check isArray', () => {
      expect(evaluateFormula('isArray([1, 2, 3])')).toBe(true)
      expect(evaluateFormula('isArray("not array")')).toBe(false)
    })

    it('should check isNull', () => {
      expect(evaluateFormula('isNull(null)')).toBe(true)
      expect(evaluateFormula('isNull("")')).toBe(false)
    })
  })

  describe('array functions', () => {
    it('should get first element', () => {
      expect(evaluateFormula('first([1, 2, 3])')).toBe(1)
    })

    it('should get last element', () => {
      expect(evaluateFormula('last([1, 2, 3])')).toBe(3)
    })

    it('should get element at index', () => {
      expect(evaluateFormula('at([1, 2, 3], 1)')).toBe(2)
      expect(evaluateFormula('at([1, 2, 3], -1)')).toBe(3) // negative index
    })

    it('should reverse array', () => {
      expect(evaluateFormula('reverse([1, 2, 3])')).toEqual([3, 2, 1])
    })

    it('should sort array', () => {
      expect(evaluateFormula('sort([3, 1, 2])')).toEqual([1, 2, 3])
      expect(evaluateFormula('sort(["c", "a", "b"])')).toEqual(['a', 'b', 'c'])
    })

    it('should get unique values', () => {
      expect(evaluateFormula('unique([1, 2, 2, 3, 3, 3])')).toEqual([1, 2, 3])
    })

    it('should flatten array', () => {
      expect(evaluateFormula('flat([[1, 2], [3, 4]])')).toEqual([1, 2, 3, 4])
    })

    it('should count elements', () => {
      expect(evaluateFormula('count([1, 2, 3])')).toBe(3)
    })

    it('should check every', () => {
      expect(evaluateFormula('every([true, true, true])')).toBe(true)
      expect(evaluateFormula('every([true, false, true])')).toBe(false)
    })

    it('should check some', () => {
      expect(evaluateFormula('some([false, false, true])')).toBe(true)
      expect(evaluateFormula('some([false, false, false])')).toBe(false)
    })

    it('should check includes', () => {
      expect(evaluateFormula('includes([1, 2, 3], 2)')).toBe(true)
      expect(evaluateFormula('includes([1, 2, 3], 5)')).toBe(false)
    })

    it('should create range', () => {
      expect(evaluateFormula('range(1, 5)')).toEqual([1, 2, 3, 4, 5])
      expect(evaluateFormula('range(0, 10, 2)')).toEqual([0, 2, 4, 6, 8, 10])
    })
  })

  describe('conversion functions', () => {
    it('should convert to number', () => {
      expect(evaluateFormula('toNumber("42")')).toBe(42)
      expect(evaluateFormula('toNumber("3.14")')).toBe(3.14)
      expect(evaluateFormula('toNumber(true)')).toBe(1)
    })

    it('should convert to string', () => {
      expect(evaluateFormula('toString(42)')).toBe('42')
      expect(evaluateFormula('toString(true)')).toBe('true')
    })

    it('should convert to boolean', () => {
      expect(evaluateFormula('toBoolean(1)')).toBe(true)
      expect(evaluateFormula('toBoolean(0)')).toBe(false)
      expect(evaluateFormula('toBoolean("")')).toBe(false)
      expect(evaluateFormula('toBoolean("hello")')).toBe(true)
    })

    it('should parse JSON', () => {
      expect(evaluateFormula('parseJSON("[1,2,3]")')).toEqual([1, 2, 3])
      expect(evaluateFormula('parseJSON("{\\"a\\":1}")')).toEqual({ a: 1 })
    })

    it('should stringify to JSON', () => {
      expect(evaluateFormula('toJSON([1, 2, 3])')).toBe('[1,2,3]')
    })
  })

  describe('complex formulas', () => {
    const context = {
      props: {
        price: 100,
        quantity: 5,
        discount: 0.1,
        items: [
          { name: 'A', price: 10 },
          { name: 'B', price: 20 }
        ]
      }
    }

    it('should calculate discounted total', () => {
      const result = evaluateFormula('price * quantity * (1 - discount)', context)
      expect(result).toBe(450) // 100 * 5 * 0.9
    })

    it('should use conditional pricing', () => {
      const formula = 'if(quantity > 10, price * 0.8, price)'
      expect(evaluateFormula(formula, context)).toBe(100) // quantity is 5, no discount

      const bulkContext = { props: { price: 100, quantity: 15 } }
      expect(evaluateFormula(formula, bulkContext)).toBe(80) // quantity > 10, 20% off
    })

    it('should format currency', () => {
      const formula = 'concat("$", toString(round(price * quantity * (1 - discount), 2)))'
      expect(evaluateFormula(formula, context)).toBe('$450')
    })

    it('should calculate days until deadline', () => {
      const deadline = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days from now
      const formula = `dateDiff(${deadline}, now(), "days")`
      const result = evaluateFormula(formula) as number
      expect(result).toBeGreaterThanOrEqual(6) // Allow for time passing
      expect(result).toBeLessThanOrEqual(7)
    })
  })
})
