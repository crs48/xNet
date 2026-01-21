/**
 * Tests for Parser
 */

import { describe, it, expect } from 'vitest'
import { Lexer } from '../lexer'
import { Parser, ParseError } from '../parser'

function parse(expression: string) {
  const lexer = new Lexer(expression)
  const tokens = lexer.tokenize()
  const parser = new Parser(tokens)
  return parser.parse()
}

describe('Parser', () => {
  describe('literals', () => {
    it('should parse number literals', () => {
      expect(parse('42')).toEqual({ type: 'NumberLiteral', value: 42 })
    })

    it('should parse string literals', () => {
      expect(parse('"hello"')).toEqual({ type: 'StringLiteral', value: 'hello' })
    })

    it('should parse boolean literals', () => {
      expect(parse('true')).toEqual({ type: 'BooleanLiteral', value: true })
      expect(parse('false')).toEqual({ type: 'BooleanLiteral', value: false })
    })

    it('should parse null literal', () => {
      expect(parse('null')).toEqual({ type: 'NullLiteral' })
    })

    it('should parse array literals', () => {
      expect(parse('[1, 2, 3]')).toEqual({
        type: 'ArrayLiteral',
        elements: [
          { type: 'NumberLiteral', value: 1 },
          { type: 'NumberLiteral', value: 2 },
          { type: 'NumberLiteral', value: 3 }
        ]
      })
    })

    it('should parse empty array', () => {
      expect(parse('[]')).toEqual({ type: 'ArrayLiteral', elements: [] })
    })
  })

  describe('identifiers', () => {
    it('should parse identifiers', () => {
      expect(parse('foo')).toEqual({ type: 'Identifier', name: 'foo' })
    })
  })

  describe('arithmetic', () => {
    it('should parse addition', () => {
      const ast = parse('1 + 2')
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '+',
        left: { type: 'NumberLiteral', value: 1 },
        right: { type: 'NumberLiteral', value: 2 }
      })
    })

    it('should parse multiplication with higher precedence', () => {
      const ast = parse('1 + 2 * 3')
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '+',
        left: { type: 'NumberLiteral', value: 1 },
        right: {
          type: 'BinaryExpression',
          operator: '*',
          left: { type: 'NumberLiteral', value: 2 },
          right: { type: 'NumberLiteral', value: 3 }
        }
      })
    })

    it('should respect parentheses', () => {
      const ast = parse('(1 + 2) * 3')
      expect(ast.type).toBe('BinaryExpression')
      expect(ast.operator).toBe('*')
      expect(ast.left.type).toBe('BinaryExpression')
      expect(ast.left.operator).toBe('+')
    })

    it('should parse power operator (right associative)', () => {
      const ast = parse('2 ** 3 ** 2')
      // Should be 2 ** (3 ** 2) = 2 ** 9 = 512
      expect(ast.type).toBe('BinaryExpression')
      expect(ast.operator).toBe('**')
      expect(ast.right.type).toBe('BinaryExpression')
      expect(ast.right.operator).toBe('**')
    })
  })

  describe('comparison', () => {
    it('should parse comparison operators', () => {
      expect(parse('a < b').operator).toBe('<')
      expect(parse('a > b').operator).toBe('>')
      expect(parse('a <= b').operator).toBe('<=')
      expect(parse('a >= b').operator).toBe('>=')
    })

    it('should parse equality operators', () => {
      expect(parse('a == b').operator).toBe('==')
      expect(parse('a != b').operator).toBe('!=')
    })
  })

  describe('logical', () => {
    it('should parse logical AND', () => {
      const ast = parse('a && b')
      expect(ast.operator).toBe('&&')
    })

    it('should parse logical OR', () => {
      const ast = parse('a || b')
      expect(ast.operator).toBe('||')
    })

    it('should parse AND with higher precedence than OR', () => {
      const ast = parse('a || b && c')
      expect(ast.operator).toBe('||')
      expect(ast.right.operator).toBe('&&')
    })
  })

  describe('unary', () => {
    it('should parse negation', () => {
      expect(parse('-5')).toEqual({
        type: 'UnaryExpression',
        operator: '-',
        argument: { type: 'NumberLiteral', value: 5 }
      })
    })

    it('should parse logical NOT', () => {
      expect(parse('!true')).toEqual({
        type: 'UnaryExpression',
        operator: '!',
        argument: { type: 'BooleanLiteral', value: true }
      })
    })

    it('should parse double negation', () => {
      const ast = parse('--5')
      expect(ast.type).toBe('UnaryExpression')
      expect(ast.argument.type).toBe('UnaryExpression')
    })
  })

  describe('function calls', () => {
    it('should parse function call with no arguments', () => {
      expect(parse('now()')).toEqual({
        type: 'CallExpression',
        callee: 'now',
        arguments: []
      })
    })

    it('should parse function call with one argument', () => {
      expect(parse('abs(-5)')).toEqual({
        type: 'CallExpression',
        callee: 'abs',
        arguments: [
          {
            type: 'UnaryExpression',
            operator: '-',
            argument: { type: 'NumberLiteral', value: 5 }
          }
        ]
      })
    })

    it('should parse function call with multiple arguments', () => {
      const ast = parse('max(1, 2, 3)')
      expect(ast.type).toBe('CallExpression')
      expect(ast.callee).toBe('max')
      expect(ast.arguments).toHaveLength(3)
    })

    it('should parse nested function calls', () => {
      const ast = parse('abs(min(1, 2))')
      expect(ast.type).toBe('CallExpression')
      expect(ast.callee).toBe('abs')
      expect(ast.arguments[0].type).toBe('CallExpression')
      expect(ast.arguments[0].callee).toBe('min')
    })
  })

  describe('member access', () => {
    it('should parse dot notation', () => {
      expect(parse('a.b')).toEqual({
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'a' },
        property: { type: 'Identifier', name: 'b' },
        computed: false
      })
    })

    it('should parse bracket notation', () => {
      expect(parse('a[0]')).toEqual({
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'a' },
        property: { type: 'NumberLiteral', value: 0 },
        computed: true
      })
    })

    it('should parse chained member access', () => {
      const ast = parse('a.b.c')
      expect(ast.type).toBe('MemberExpression')
      expect(ast.object.type).toBe('MemberExpression')
    })
  })

  describe('errors', () => {
    it('should throw on unexpected token', () => {
      expect(() => parse('1 +')).toThrow(ParseError)
    })

    it('should throw on unclosed parenthesis', () => {
      expect(() => parse('(1 + 2')).toThrow(ParseError)
    })

    it('should throw on extra tokens', () => {
      expect(() => parse('1 2')).toThrow(ParseError)
    })
  })

  describe('complex expressions', () => {
    it('should parse prop function call', () => {
      const ast = parse('prop("price") * prop("quantity")')
      expect(ast.type).toBe('BinaryExpression')
      expect(ast.operator).toBe('*')
      expect(ast.left.type).toBe('CallExpression')
      expect(ast.left.callee).toBe('prop')
    })

    it('should parse conditional in function', () => {
      const ast = parse('if(a > b, "yes", "no")')
      expect(ast.type).toBe('CallExpression')
      expect(ast.callee).toBe('if')
      expect(ast.arguments).toHaveLength(3)
    })
  })
})
