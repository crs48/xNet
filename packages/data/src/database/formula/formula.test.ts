/**
 * @xnet/data - Formula parser, evaluator, and dependency tests.
 */

import type { ColumnDefinition } from '../column-types'
import { describe, it, expect } from 'vitest'
import {
  extractDependencies,
  detectCircularDependencies,
  wouldCreateCircular,
  buildDependencyGraph,
  getAffectedColumns,
  getEvaluationOrder
} from './dependency'
import { evaluate, safeEvaluate } from './evaluator'
import { FUNCTIONS, isValidFunction, getFunctionNames } from './functions'
import { FormulaParser } from './parser'

// ─── Parser Tests ────────────────────────────────────────────────────────────

describe('FormulaParser', () => {
  const parser = new FormulaParser()

  describe('literals', () => {
    it('parses numbers', () => {
      const ast = parser.parse('42')
      expect(ast).toEqual({ type: 'literal', value: 42 })
    })

    it('parses decimals', () => {
      const ast = parser.parse('3.14')
      expect(ast).toEqual({ type: 'literal', value: 3.14 })
    })

    it('parses strings with double quotes', () => {
      const ast = parser.parse('"hello"')
      expect(ast).toEqual({ type: 'literal', value: 'hello' })
    })

    it('parses strings with single quotes', () => {
      const ast = parser.parse("'world'")
      expect(ast).toEqual({ type: 'literal', value: 'world' })
    })

    it('parses boolean true', () => {
      const ast = parser.parse('true')
      expect(ast).toEqual({ type: 'literal', value: true })
    })

    it('parses boolean false', () => {
      const ast = parser.parse('false')
      expect(ast).toEqual({ type: 'literal', value: false })
    })

    it('parses null', () => {
      const ast = parser.parse('null')
      expect(ast).toEqual({ type: 'literal', value: null })
    })
  })

  describe('column references', () => {
    it('parses simple reference', () => {
      const ast = parser.parse('{{price}}')
      expect(ast).toEqual({ type: 'reference', columnId: 'price', property: undefined })
    })

    it('parses reference with property', () => {
      const ast = parser.parse('{{date.year}}')
      expect(ast).toEqual({ type: 'reference', columnId: 'date', property: 'year' })
    })
  })

  describe('arithmetic', () => {
    it('parses addition', () => {
      const ast = parser.parse('1 + 2')
      expect(ast.type).toBe('binary')
      expect((ast as any).operator).toBe('+')
    })

    it('parses multiplication with higher precedence', () => {
      const ast = parser.parse('1 + 2 * 3')
      expect(ast.type).toBe('binary')
      expect((ast as any).operator).toBe('+')
      expect((ast as any).right.operator).toBe('*')
    })

    it('parses parentheses', () => {
      const ast = parser.parse('(1 + 2) * 3')
      expect(ast.type).toBe('binary')
      expect((ast as any).operator).toBe('*')
    })

    it('parses unary minus', () => {
      const ast = parser.parse('-5')
      expect(ast.type).toBe('unary')
      expect((ast as any).operator).toBe('-')
    })
  })

  describe('comparison', () => {
    it('parses equality', () => {
      const ast = parser.parse('1 == 1')
      expect(ast.type).toBe('binary')
      expect((ast as any).operator).toBe('==')
    })

    it('parses inequality', () => {
      const ast = parser.parse('1 != 2')
      expect(ast.type).toBe('binary')
      expect((ast as any).operator).toBe('!=')
    })

    it('parses less than', () => {
      const ast = parser.parse('1 < 2')
      expect(ast.type).toBe('binary')
      expect((ast as any).operator).toBe('<')
    })

    it('parses less than or equal', () => {
      const ast = parser.parse('1 <= 2')
      expect(ast.type).toBe('binary')
      expect((ast as any).operator).toBe('<=')
    })
  })

  describe('logical', () => {
    it('parses AND', () => {
      const ast = parser.parse('true && false')
      expect(ast.type).toBe('binary')
      expect((ast as any).operator).toBe('&&')
    })

    it('parses OR', () => {
      const ast = parser.parse('true || false')
      expect(ast.type).toBe('binary')
      expect((ast as any).operator).toBe('||')
    })

    it('parses NOT', () => {
      const ast = parser.parse('!true')
      expect(ast.type).toBe('unary')
      expect((ast as any).operator).toBe('!')
    })
  })

  describe('function calls', () => {
    it('parses function with no args', () => {
      const ast = parser.parse('NOW()')
      expect(ast.type).toBe('call')
      expect((ast as any).name).toBe('NOW')
      expect((ast as any).args).toHaveLength(0)
    })

    it('parses function with one arg', () => {
      const ast = parser.parse('ABS(-5)')
      expect(ast.type).toBe('call')
      expect((ast as any).name).toBe('ABS')
      expect((ast as any).args).toHaveLength(1)
    })

    it('parses function with multiple args', () => {
      const ast = parser.parse('IF(true, 1, 2)')
      expect(ast.type).toBe('call')
      expect((ast as any).name).toBe('IF')
      expect((ast as any).args).toHaveLength(3)
    })

    it('parses nested function calls', () => {
      const ast = parser.parse('UPPER(CONCAT("a", "b"))')
      expect(ast.type).toBe('call')
      expect((ast as any).name).toBe('UPPER')
      expect((ast as any).args[0].type).toBe('call')
    })
  })

  describe('complex expressions', () => {
    it('parses column multiplication', () => {
      const ast = parser.parse('{{price}} * {{quantity}}')
      expect(ast.type).toBe('binary')
      expect((ast as any).operator).toBe('*')
    })

    it('parses conditional with column reference', () => {
      const ast = parser.parse('IF({{status}} == "done", 100, 0)')
      expect(ast.type).toBe('call')
      expect((ast as any).name).toBe('IF')
    })

    it('parses string concatenation', () => {
      const ast = parser.parse('{{first}} & " " & {{last}}')
      expect(ast.type).toBe('binary')
      expect((ast as any).operator).toBe('&')
    })
  })

  describe('error handling', () => {
    it('throws on unexpected token', () => {
      expect(() => parser.parse('1 + + 2')).toThrow()
    })

    it('throws on unclosed parenthesis', () => {
      expect(() => parser.parse('(1 + 2')).toThrow()
    })

    it('throws on unclosed string', () => {
      expect(() => parser.parse('"hello')).toThrow()
    })
  })
})

// ─── Evaluator Tests ─────────────────────────────────────────────────────────

describe('evaluate', () => {
  const parser = new FormulaParser()

  const createContext = (values: Record<string, unknown>) => ({
    getValue: (id: string) => values[id],
    getColumn: () => undefined
  })

  describe('arithmetic', () => {
    it('evaluates addition', () => {
      const ast = parser.parse('1 + 2')
      expect(evaluate(ast, createContext({}))).toBe(3)
    })

    it('evaluates subtraction', () => {
      const ast = parser.parse('5 - 3')
      expect(evaluate(ast, createContext({}))).toBe(2)
    })

    it('evaluates multiplication', () => {
      const ast = parser.parse('4 * 3')
      expect(evaluate(ast, createContext({}))).toBe(12)
    })

    it('evaluates division', () => {
      const ast = parser.parse('10 / 2')
      expect(evaluate(ast, createContext({}))).toBe(5)
    })

    it('evaluates modulo', () => {
      const ast = parser.parse('7 % 3')
      expect(evaluate(ast, createContext({}))).toBe(1)
    })

    it('evaluates unary minus', () => {
      const ast = parser.parse('-5')
      expect(evaluate(ast, createContext({}))).toBe(-5)
    })
  })

  describe('column references', () => {
    it('evaluates column reference', () => {
      const ast = parser.parse('{{price}}')
      expect(evaluate(ast, createContext({ price: 100 }))).toBe(100)
    })

    it('evaluates column multiplication', () => {
      const ast = parser.parse('{{price}} * {{quantity}}')
      expect(evaluate(ast, createContext({ price: 10, quantity: 5 }))).toBe(50)
    })
  })

  describe('comparison', () => {
    it('evaluates equality', () => {
      const ast = parser.parse('1 == 1')
      expect(evaluate(ast, createContext({}))).toBe(true)
    })

    it('evaluates inequality', () => {
      const ast = parser.parse('1 != 2')
      expect(evaluate(ast, createContext({}))).toBe(true)
    })

    it('evaluates less than', () => {
      const ast = parser.parse('1 < 2')
      expect(evaluate(ast, createContext({}))).toBe(true)
    })
  })

  describe('logical', () => {
    it('evaluates AND', () => {
      const ast = parser.parse('true && true')
      expect(evaluate(ast, createContext({}))).toBe(true)
    })

    it('evaluates OR', () => {
      const ast = parser.parse('false || true')
      expect(evaluate(ast, createContext({}))).toBe(true)
    })

    it('evaluates NOT', () => {
      const ast = parser.parse('!false')
      expect(evaluate(ast, createContext({}))).toBe(true)
    })
  })

  describe('string concatenation', () => {
    it('concatenates strings', () => {
      const ast = parser.parse('"hello" & " " & "world"')
      expect(evaluate(ast, createContext({}))).toBe('hello world')
    })

    it('concatenates column values', () => {
      const ast = parser.parse('{{first}} & " " & {{last}}')
      expect(evaluate(ast, createContext({ first: 'John', last: 'Doe' }))).toBe('John Doe')
    })
  })

  describe('functions', () => {
    it('evaluates UPPER', () => {
      const ast = parser.parse('UPPER("hello")')
      expect(evaluate(ast, createContext({}))).toBe('HELLO')
    })

    it('evaluates IF', () => {
      const ast = parser.parse('IF(true, "yes", "no")')
      expect(evaluate(ast, createContext({}))).toBe('yes')
    })

    it('evaluates SUM', () => {
      const ast = parser.parse('SUM(1, 2, 3)')
      expect(evaluate(ast, createContext({}))).toBe(6)
    })

    it('evaluates nested functions', () => {
      const ast = parser.parse('UPPER(CONCAT("a", "b"))')
      expect(evaluate(ast, createContext({}))).toBe('AB')
    })
  })

  describe('safeEvaluate', () => {
    it('returns value on success', () => {
      const ast = parser.parse('1 + 2')
      const result = safeEvaluate(ast, createContext({}))
      expect(result.value).toBe(3)
      expect(result.error).toBeUndefined()
    })

    it('returns error on failure', () => {
      const ast = parser.parse('UNKNOWN()')
      const result = safeEvaluate(ast, createContext({}))
      expect(result.value).toBeNull()
      expect(result.error).toContain('Unknown function')
    })
  })
})

// ─── Functions Tests ─────────────────────────────────────────────────────────

describe('FUNCTIONS', () => {
  describe('math', () => {
    it('ABS returns absolute value', () => {
      expect(FUNCTIONS.ABS(-5)).toBe(5)
    })

    it('ROUND rounds to decimals', () => {
      expect(FUNCTIONS.ROUND(3.14159, 2)).toBe(3.14)
    })

    it('FLOOR rounds down', () => {
      expect(FUNCTIONS.FLOOR(3.9)).toBe(3)
    })

    it('CEIL rounds up', () => {
      expect(FUNCTIONS.CEIL(3.1)).toBe(4)
    })

    it('MIN finds minimum', () => {
      expect(FUNCTIONS.MIN(3, 1, 2)).toBe(1)
    })

    it('MAX finds maximum', () => {
      expect(FUNCTIONS.MAX(3, 1, 2)).toBe(3)
    })

    it('SUM adds values', () => {
      expect(FUNCTIONS.SUM(1, 2, 3)).toBe(6)
    })

    it('AVG averages values', () => {
      expect(FUNCTIONS.AVG(2, 4, 6)).toBe(4)
    })

    it('POW raises to power', () => {
      expect(FUNCTIONS.POW(2, 3)).toBe(8)
    })

    it('SQRT returns square root', () => {
      expect(FUNCTIONS.SQRT(16)).toBe(4)
    })
  })

  describe('text', () => {
    it('CONCAT joins strings', () => {
      expect(FUNCTIONS.CONCAT('a', 'b', 'c')).toBe('abc')
    })

    it('UPPER converts to uppercase', () => {
      expect(FUNCTIONS.UPPER('hello')).toBe('HELLO')
    })

    it('LOWER converts to lowercase', () => {
      expect(FUNCTIONS.LOWER('HELLO')).toBe('hello')
    })

    it('TRIM removes whitespace', () => {
      expect(FUNCTIONS.TRIM('  hello  ')).toBe('hello')
    })

    it('LENGTH returns string length', () => {
      expect(FUNCTIONS.LENGTH('hello')).toBe(5)
    })

    it('SUBSTRING extracts substring', () => {
      expect(FUNCTIONS.SUBSTRING('hello', 1, 3)).toBe('ell')
    })

    it('LEFT returns left characters', () => {
      expect(FUNCTIONS.LEFT('hello', 2)).toBe('he')
    })

    it('RIGHT returns right characters', () => {
      expect(FUNCTIONS.RIGHT('hello', 2)).toBe('lo')
    })
  })

  describe('logic', () => {
    it('IF returns then or else', () => {
      expect(FUNCTIONS.IF(true, 'yes', 'no')).toBe('yes')
      expect(FUNCTIONS.IF(false, 'yes', 'no')).toBe('no')
    })

    it('AND returns true if all true', () => {
      expect(FUNCTIONS.AND(true, true, true)).toBe(true)
      expect(FUNCTIONS.AND(true, false, true)).toBe(false)
    })

    it('OR returns true if any true', () => {
      expect(FUNCTIONS.OR(false, true, false)).toBe(true)
      expect(FUNCTIONS.OR(false, false, false)).toBe(false)
    })

    it('NOT negates', () => {
      expect(FUNCTIONS.NOT(true)).toBe(false)
      expect(FUNCTIONS.NOT(false)).toBe(true)
    })

    it('COALESCE returns first non-null', () => {
      expect(FUNCTIONS.COALESCE(null, undefined, 'value')).toBe('value')
    })

    it('ISBLANK checks for empty', () => {
      expect(FUNCTIONS.ISBLANK('')).toBe(true)
      expect(FUNCTIONS.ISBLANK(null)).toBe(true)
      expect(FUNCTIONS.ISBLANK('value')).toBe(false)
    })
  })

  describe('date', () => {
    it('NOW returns current timestamp', () => {
      const result = FUNCTIONS.NOW() as string
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('TODAY returns current date', () => {
      const result = FUNCTIONS.TODAY() as string
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('YEAR extracts year', () => {
      expect(FUNCTIONS.YEAR('2024-06-15')).toBe(2024)
    })

    it('MONTH extracts month', () => {
      expect(FUNCTIONS.MONTH('2024-06-15')).toBe(6)
    })

    it('DAY extracts day', () => {
      expect(FUNCTIONS.DAY('2024-06-15')).toBe(15)
    })

    it('DATEDIFF calculates difference', () => {
      expect(FUNCTIONS.DATEDIFF('2024-01-01', '2024-01-10', 'days')).toBe(9)
    })
  })

  describe('array', () => {
    it('CONTAINS checks array membership', () => {
      expect(FUNCTIONS.CONTAINS([1, 2, 3], 2)).toBe(true)
      expect(FUNCTIONS.CONTAINS([1, 2, 3], 4)).toBe(false)
    })

    it('COUNT returns array length', () => {
      expect(FUNCTIONS.COUNT([1, 2, 3])).toBe(3)
    })

    it('FIRST returns first element', () => {
      expect(FUNCTIONS.FIRST([1, 2, 3])).toBe(1)
    })

    it('LAST returns last element', () => {
      expect(FUNCTIONS.LAST([1, 2, 3])).toBe(3)
    })

    it('JOIN joins array elements', () => {
      expect(FUNCTIONS.JOIN(['a', 'b', 'c'], '-')).toBe('a-b-c')
    })

    it('UNIQUE removes duplicates', () => {
      expect(FUNCTIONS.UNIQUE([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3])
    })
  })
})

describe('isValidFunction', () => {
  it('returns true for valid functions', () => {
    expect(isValidFunction('SUM')).toBe(true)
    expect(isValidFunction('sum')).toBe(true)
    expect(isValidFunction('IF')).toBe(true)
  })

  it('returns false for invalid functions', () => {
    expect(isValidFunction('UNKNOWN')).toBe(false)
  })
})

describe('getFunctionNames', () => {
  it('returns all function names', () => {
    const names = getFunctionNames()
    expect(names).toContain('SUM')
    expect(names).toContain('IF')
    expect(names).toContain('UPPER')
    expect(names.length).toBeGreaterThan(30)
  })
})

// ─── Dependency Tests ────────────────────────────────────────────────────────

describe('extractDependencies', () => {
  it('extracts column references', () => {
    const deps = extractDependencies('{{price}} * {{quantity}}')
    expect(deps).toContain('price')
    expect(deps).toContain('quantity')
    expect(deps).toHaveLength(2)
  })

  it('extracts nested references', () => {
    const deps = extractDependencies('IF({{status}} == "done", {{value}}, 0)')
    expect(deps).toContain('status')
    expect(deps).toContain('value')
  })

  it('returns empty for no references', () => {
    const deps = extractDependencies('1 + 2')
    expect(deps).toHaveLength(0)
  })

  it('deduplicates references', () => {
    const deps = extractDependencies('{{price}} + {{price}}')
    expect(deps).toHaveLength(1)
  })
})

describe('detectCircularDependencies', () => {
  it('detects simple cycle', () => {
    const columns: ColumnDefinition[] = [
      {
        id: 'a',
        name: 'A',
        type: 'formula',
        config: { expression: '{{b}}', resultType: 'number' }
      },
      { id: 'b', name: 'B', type: 'formula', config: { expression: '{{a}}', resultType: 'number' } }
    ]

    const result = detectCircularDependencies(columns)
    expect(result.hasCircular).toBe(true)
    expect(result.cycle).toBeDefined()
  })

  it('detects transitive cycle', () => {
    const columns: ColumnDefinition[] = [
      {
        id: 'a',
        name: 'A',
        type: 'formula',
        config: { expression: '{{b}}', resultType: 'number' }
      },
      {
        id: 'b',
        name: 'B',
        type: 'formula',
        config: { expression: '{{c}}', resultType: 'number' }
      },
      { id: 'c', name: 'C', type: 'formula', config: { expression: '{{a}}', resultType: 'number' } }
    ]

    const result = detectCircularDependencies(columns)
    expect(result.hasCircular).toBe(true)
  })

  it('allows non-circular dependencies', () => {
    const columns: ColumnDefinition[] = [
      {
        id: 'a',
        name: 'A',
        type: 'formula',
        config: { expression: '{{b}} + {{c}}', resultType: 'number' }
      },
      { id: 'b', name: 'B', type: 'number', config: {} },
      { id: 'c', name: 'C', type: 'number', config: {} }
    ]

    const result = detectCircularDependencies(columns)
    expect(result.hasCircular).toBe(false)
  })

  it('allows chain dependencies', () => {
    const columns: ColumnDefinition[] = [
      {
        id: 'a',
        name: 'A',
        type: 'formula',
        config: { expression: '{{b}}', resultType: 'number' }
      },
      {
        id: 'b',
        name: 'B',
        type: 'formula',
        config: { expression: '{{c}}', resultType: 'number' }
      },
      { id: 'c', name: 'C', type: 'number', config: {} }
    ]

    const result = detectCircularDependencies(columns)
    expect(result.hasCircular).toBe(false)
  })
})

describe('wouldCreateCircular', () => {
  it('returns true if formula would create cycle', () => {
    const columns: ColumnDefinition[] = [
      { id: 'a', name: 'A', type: 'formula', config: { expression: '{{b}}', resultType: 'number' } }
    ]

    const result = wouldCreateCircular('b', '{{a}}', columns)
    expect(result).toBe(true)
  })

  it('returns false if formula is safe', () => {
    const columns: ColumnDefinition[] = [{ id: 'a', name: 'A', type: 'number', config: {} }]

    const result = wouldCreateCircular('b', '{{a}} * 2', columns)
    expect(result).toBe(false)
  })
})

describe('buildDependencyGraph', () => {
  it('builds correct graph', () => {
    const columns: ColumnDefinition[] = [
      { id: 'price', name: 'Price', type: 'number', config: {} },
      { id: 'quantity', name: 'Quantity', type: 'number', config: {} },
      {
        id: 'total',
        name: 'Total',
        type: 'formula',
        config: { expression: '{{price}} * {{quantity}}', resultType: 'number' }
      }
    ]

    const graph = buildDependencyGraph(columns)

    expect(graph.columnDeps.get('total')).toEqual(['price', 'quantity'])
    expect(graph.reverseDeps.get('price')).toContain('total')
    expect(graph.reverseDeps.get('quantity')).toContain('total')
  })
})

describe('getAffectedColumns', () => {
  it('finds directly affected columns', () => {
    const columns: ColumnDefinition[] = [
      { id: 'a', name: 'A', type: 'number', config: {} },
      {
        id: 'b',
        name: 'B',
        type: 'formula',
        config: { expression: '{{a}} * 2', resultType: 'number' }
      }
    ]

    const graph = buildDependencyGraph(columns)
    const affected = getAffectedColumns('a', graph)

    expect(affected).toContain('b')
  })

  it('finds transitively affected columns', () => {
    const columns: ColumnDefinition[] = [
      { id: 'a', name: 'A', type: 'number', config: {} },
      {
        id: 'b',
        name: 'B',
        type: 'formula',
        config: { expression: '{{a}} * 2', resultType: 'number' }
      },
      {
        id: 'c',
        name: 'C',
        type: 'formula',
        config: { expression: '{{b}} + 10', resultType: 'number' }
      }
    ]

    const graph = buildDependencyGraph(columns)
    const affected = getAffectedColumns('a', graph)

    expect(affected).toContain('b')
    expect(affected).toContain('c')
  })
})

describe('getEvaluationOrder', () => {
  it('returns formulas in dependency order', () => {
    const columns: ColumnDefinition[] = [
      { id: 'a', name: 'A', type: 'number', config: {} },
      {
        id: 'c',
        name: 'C',
        type: 'formula',
        config: { expression: '{{b}} + 10', resultType: 'number' }
      },
      {
        id: 'b',
        name: 'B',
        type: 'formula',
        config: { expression: '{{a}} * 2', resultType: 'number' }
      }
    ]

    const order = getEvaluationOrder(columns)

    const bIndex = order.findIndex((c) => c.id === 'b')
    const cIndex = order.findIndex((c) => c.id === 'c')

    expect(bIndex).toBeLessThan(cIndex)
  })
})
