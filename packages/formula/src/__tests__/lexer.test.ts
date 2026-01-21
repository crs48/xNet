/**
 * Tests for Lexer
 */

import { describe, it, expect } from 'vitest'
import { Lexer } from '../lexer'

describe('Lexer', () => {
  describe('numbers', () => {
    it('should tokenize integers', () => {
      const lexer = new Lexer('42')
      const tokens = lexer.tokenize()
      expect(tokens[0]).toEqual({ type: 'NUMBER', value: 42, position: 0 })
    })

    it('should tokenize decimals', () => {
      const lexer = new Lexer('3.14')
      const tokens = lexer.tokenize()
      expect(tokens[0]).toEqual({ type: 'NUMBER', value: 3.14, position: 0 })
    })

    it('should tokenize leading decimal', () => {
      const lexer = new Lexer('.5')
      const tokens = lexer.tokenize()
      expect(tokens[0]).toEqual({ type: 'NUMBER', value: 0.5, position: 0 })
    })

    it('should tokenize scientific notation', () => {
      const lexer = new Lexer('1e10')
      const tokens = lexer.tokenize()
      expect(tokens[0]).toEqual({ type: 'NUMBER', value: 1e10, position: 0 })
    })
  })

  describe('strings', () => {
    it('should tokenize double-quoted strings', () => {
      const lexer = new Lexer('"hello"')
      const tokens = lexer.tokenize()
      expect(tokens[0]).toEqual({ type: 'STRING', value: 'hello', position: 0 })
    })

    it('should tokenize single-quoted strings', () => {
      const lexer = new Lexer("'world'")
      const tokens = lexer.tokenize()
      expect(tokens[0]).toEqual({ type: 'STRING', value: 'world', position: 0 })
    })

    it('should handle escape sequences', () => {
      const lexer = new Lexer('"hello\\nworld"')
      const tokens = lexer.tokenize()
      expect(tokens[0]).toEqual({ type: 'STRING', value: 'hello\nworld', position: 0 })
    })

    it('should handle escaped quotes', () => {
      const lexer = new Lexer('"say \\"hello\\""')
      const tokens = lexer.tokenize()
      expect(tokens[0]).toEqual({ type: 'STRING', value: 'say "hello"', position: 0 })
    })

    it('should throw on unterminated string', () => {
      const lexer = new Lexer('"hello')
      expect(() => lexer.tokenize()).toThrow('Unterminated string')
    })
  })

  describe('booleans', () => {
    it('should tokenize true', () => {
      const lexer = new Lexer('true')
      const tokens = lexer.tokenize()
      expect(tokens[0]).toEqual({ type: 'BOOLEAN', value: true, position: 0 })
    })

    it('should tokenize false', () => {
      const lexer = new Lexer('false')
      const tokens = lexer.tokenize()
      expect(tokens[0]).toEqual({ type: 'BOOLEAN', value: false, position: 0 })
    })
  })

  describe('identifiers', () => {
    it('should tokenize simple identifiers', () => {
      const lexer = new Lexer('foo')
      const tokens = lexer.tokenize()
      expect(tokens[0]).toEqual({ type: 'IDENTIFIER', value: 'foo', position: 0 })
    })

    it('should tokenize identifiers with underscores', () => {
      const lexer = new Lexer('foo_bar')
      const tokens = lexer.tokenize()
      expect(tokens[0]).toEqual({ type: 'IDENTIFIER', value: 'foo_bar', position: 0 })
    })

    it('should tokenize identifiers with numbers', () => {
      const lexer = new Lexer('foo123')
      const tokens = lexer.tokenize()
      expect(tokens[0]).toEqual({ type: 'IDENTIFIER', value: 'foo123', position: 0 })
    })
  })

  describe('operators', () => {
    it('should tokenize single-char operators', () => {
      const lexer = new Lexer('+ - * / %')
      const tokens = lexer.tokenize()
      expect(tokens[0].type).toBe('OPERATOR')
      expect(tokens[0].value).toBe('+')
      expect(tokens[1].value).toBe('-')
      expect(tokens[2].value).toBe('*')
      expect(tokens[3].value).toBe('/')
      expect(tokens[4].value).toBe('%')
    })

    it('should tokenize two-char operators', () => {
      const lexer = new Lexer('== != <= >= && ||')
      const tokens = lexer.tokenize()
      expect(tokens[0].value).toBe('==')
      expect(tokens[1].value).toBe('!=')
      expect(tokens[2].value).toBe('<=')
      expect(tokens[3].value).toBe('>=')
      expect(tokens[4].value).toBe('&&')
      expect(tokens[5].value).toBe('||')
    })

    it('should tokenize power operator', () => {
      const lexer = new Lexer('**')
      const tokens = lexer.tokenize()
      expect(tokens[0].value).toBe('**')
    })
  })

  describe('delimiters', () => {
    it('should tokenize parentheses', () => {
      const lexer = new Lexer('()')
      const tokens = lexer.tokenize()
      expect(tokens[0].type).toBe('LPAREN')
      expect(tokens[1].type).toBe('RPAREN')
    })

    it('should tokenize brackets', () => {
      const lexer = new Lexer('[]')
      const tokens = lexer.tokenize()
      expect(tokens[0].type).toBe('LBRACKET')
      expect(tokens[1].type).toBe('RBRACKET')
    })

    it('should tokenize comma', () => {
      const lexer = new Lexer(',')
      const tokens = lexer.tokenize()
      expect(tokens[0].type).toBe('COMMA')
    })

    it('should tokenize dot', () => {
      const lexer = new Lexer('a.b')
      const tokens = lexer.tokenize()
      expect(tokens[0].type).toBe('IDENTIFIER')
      expect(tokens[1].type).toBe('DOT')
      expect(tokens[2].type).toBe('IDENTIFIER')
    })
  })

  describe('whitespace', () => {
    it('should skip whitespace', () => {
      const lexer = new Lexer('  1  +  2  ')
      const tokens = lexer.tokenize()
      expect(tokens).toHaveLength(4) // 1, +, 2, EOF
    })

    it('should handle newlines', () => {
      const lexer = new Lexer('1\n+\n2')
      const tokens = lexer.tokenize()
      expect(tokens).toHaveLength(4)
    })
  })

  describe('complex expressions', () => {
    it('should tokenize function call', () => {
      const lexer = new Lexer('abs(-5)')
      const tokens = lexer.tokenize()
      expect(tokens.map((t) => t.type)).toEqual([
        'IDENTIFIER',
        'LPAREN',
        'OPERATOR',
        'NUMBER',
        'RPAREN',
        'EOF'
      ])
    })

    it('should tokenize arithmetic expression', () => {
      const lexer = new Lexer('1 + 2 * 3')
      const tokens = lexer.tokenize()
      expect(tokens.map((t) => t.type)).toEqual([
        'NUMBER',
        'OPERATOR',
        'NUMBER',
        'OPERATOR',
        'NUMBER',
        'EOF'
      ])
    })

    it('should tokenize comparison', () => {
      const lexer = new Lexer('x >= 10 && y <= 20')
      const tokens = lexer.tokenize()
      expect(tokens.map((t) => t.value)).toEqual(['x', '>=', 10, '&&', 'y', '<=', 20, ''])
    })
  })

  describe('errors', () => {
    it('should throw on unexpected character', () => {
      const lexer = new Lexer('@')
      expect(() => lexer.tokenize()).toThrow("Unexpected character '@'")
    })
  })
})
