/**
 * Parser - Builds AST from token stream
 *
 * Implements a recursive descent parser with operator precedence.
 * Operator precedence (lowest to highest):
 * 1. || (or)
 * 2. && (and)
 * 3. ==, != (equality)
 * 4. <, >, <=, >= (comparison)
 * 5. +, - (additive)
 * 6. *, /, % (multiplicative)
 * 7. ** (power)
 * 8. -, ! (unary)
 * 9. function call, member access
 */

import type { Token, TokenType } from './lexer.js'
import type { ASTNode } from './ast.js'

/**
 * Parser error with position information
 */
export class ParseError extends Error {
  position: number

  constructor(message: string, position: number) {
    super(`${message} at position ${position}`)
    this.name = 'ParseError'
    this.position = position
  }
}

/**
 * Parser class that builds AST from tokens
 */
export class Parser {
  private tokens: Token[]
  private position = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  /**
   * Parse tokens into an AST
   */
  parse(): ASTNode {
    const result = this.parseExpression()

    // Ensure we've consumed all tokens
    if (this.current().type !== 'EOF') {
      throw new ParseError(`Unexpected token '${this.current().value}'`, this.current().position)
    }

    return result
  }

  /**
   * Get current token
   */
  private current(): Token {
    return this.tokens[this.position]
  }

  /**
   * Peek at next token
   */
  private peek(offset = 1): Token {
    return this.tokens[this.position + offset] || this.tokens[this.tokens.length - 1]
  }

  /**
   * Consume current token if it matches expected type
   */
  private consume(type: TokenType): Token {
    const token = this.current()
    if (token.type !== type) {
      throw new ParseError(`Expected ${type} but got ${token.type}`, token.position)
    }
    this.position++
    return token
  }

  /**
   * Check if current token matches type
   */
  private match(type: TokenType): boolean {
    return this.current().type === type
  }

  /**
   * Check if current token is operator with given value
   */
  private isOperator(value: string | string[]): boolean {
    if (this.current().type !== 'OPERATOR') return false
    if (Array.isArray(value)) {
      return value.includes(this.current().value as string)
    }
    return this.current().value === value
  }

  // ============================================================================
  // Expression Parsing (by precedence)
  // ============================================================================

  /**
   * Parse any expression
   */
  private parseExpression(): ASTNode {
    return this.parseOr()
  }

  /**
   * Parse || (or) expressions
   */
  private parseOr(): ASTNode {
    let left = this.parseAnd()

    while (this.isOperator('||')) {
      const operator = this.consume('OPERATOR').value as string
      const right = this.parseAnd()
      left = { type: 'BinaryExpression', operator, left, right }
    }

    return left
  }

  /**
   * Parse && (and) expressions
   */
  private parseAnd(): ASTNode {
    let left = this.parseEquality()

    while (this.isOperator('&&')) {
      const operator = this.consume('OPERATOR').value as string
      const right = this.parseEquality()
      left = { type: 'BinaryExpression', operator, left, right }
    }

    return left
  }

  /**
   * Parse ==, != (equality) expressions
   */
  private parseEquality(): ASTNode {
    let left = this.parseComparison()

    while (this.isOperator(['==', '!='])) {
      const operator = this.consume('OPERATOR').value as string
      const right = this.parseComparison()
      left = { type: 'BinaryExpression', operator, left, right }
    }

    return left
  }

  /**
   * Parse <, >, <=, >= (comparison) expressions
   */
  private parseComparison(): ASTNode {
    let left = this.parseAdditive()

    while (this.isOperator(['<', '>', '<=', '>='])) {
      const operator = this.consume('OPERATOR').value as string
      const right = this.parseAdditive()
      left = { type: 'BinaryExpression', operator, left, right }
    }

    return left
  }

  /**
   * Parse +, - (additive) expressions
   */
  private parseAdditive(): ASTNode {
    let left = this.parseMultiplicative()

    while (this.isOperator(['+', '-'])) {
      const operator = this.consume('OPERATOR').value as string
      const right = this.parseMultiplicative()
      left = { type: 'BinaryExpression', operator, left, right }
    }

    return left
  }

  /**
   * Parse *, /, % (multiplicative) expressions
   */
  private parseMultiplicative(): ASTNode {
    let left = this.parsePower()

    while (this.isOperator(['*', '/', '%'])) {
      const operator = this.consume('OPERATOR').value as string
      const right = this.parsePower()
      left = { type: 'BinaryExpression', operator, left, right }
    }

    return left
  }

  /**
   * Parse ** (power) expressions (right associative)
   */
  private parsePower(): ASTNode {
    const left = this.parseUnary()

    if (this.isOperator('**')) {
      const operator = this.consume('OPERATOR').value as string
      const right = this.parsePower() // Right associative
      return { type: 'BinaryExpression', operator, left, right }
    }

    return left
  }

  /**
   * Parse -, ! (unary) expressions
   */
  private parseUnary(): ASTNode {
    if (this.isOperator(['-', '!'])) {
      const operator = this.consume('OPERATOR').value as string
      const argument = this.parseUnary()
      return { type: 'UnaryExpression', operator, argument }
    }

    return this.parseCall()
  }

  /**
   * Parse function calls and member access
   */
  private parseCall(): ASTNode {
    let expr = this.parsePrimary()

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.match('LPAREN')) {
        // Function call - only valid if expr is an identifier
        if (expr.type !== 'Identifier') {
          throw new ParseError('Expected function name', this.current().position)
        }
        expr = this.parseCallExpression(expr.name)
      } else if (this.match('LBRACKET')) {
        // Computed member access: arr[0]
        this.consume('LBRACKET')
        const property = this.parseExpression()
        this.consume('RBRACKET')
        expr = { type: 'MemberExpression', object: expr, property, computed: true }
      } else if (this.match('DOT')) {
        // Property access: obj.prop
        this.consume('DOT')
        const prop = this.consume('IDENTIFIER')
        expr = {
          type: 'MemberExpression',
          object: expr,
          property: { type: 'Identifier', name: prop.value as string },
          computed: false
        }
      } else {
        break
      }
    }

    return expr
  }

  /**
   * Parse function call arguments
   */
  private parseCallExpression(callee: string): ASTNode {
    this.consume('LPAREN')
    const args: ASTNode[] = []

    if (!this.match('RPAREN')) {
      args.push(this.parseExpression())
      while (this.match('COMMA')) {
        this.consume('COMMA')
        args.push(this.parseExpression())
      }
    }

    this.consume('RPAREN')
    return { type: 'CallExpression', callee, arguments: args }
  }

  /**
   * Parse primary expressions (literals, identifiers, grouped expressions)
   */
  private parsePrimary(): ASTNode {
    const token = this.current()

    switch (token.type) {
      case 'NUMBER':
        this.position++
        return { type: 'NumberLiteral', value: token.value as number }

      case 'STRING':
        this.position++
        return { type: 'StringLiteral', value: token.value as string }

      case 'BOOLEAN':
        this.position++
        return { type: 'BooleanLiteral', value: token.value as boolean }

      case 'IDENTIFIER':
        // Check for null keyword
        if (token.value === 'null') {
          this.position++
          return { type: 'NullLiteral' }
        }
        this.position++
        return { type: 'Identifier', name: token.value as string }

      case 'LPAREN': {
        // Grouped expression
        this.consume('LPAREN')
        const expr = this.parseExpression()
        this.consume('RPAREN')
        return expr
      }

      case 'LBRACKET':
        // Array literal
        return this.parseArrayLiteral()

      default:
        throw new ParseError(`Unexpected token '${token.value}'`, token.position)
    }
  }

  /**
   * Parse array literal
   */
  private parseArrayLiteral(): ASTNode {
    this.consume('LBRACKET')
    const elements: ASTNode[] = []

    if (!this.match('RBRACKET')) {
      elements.push(this.parseExpression())
      while (this.match('COMMA')) {
        this.consume('COMMA')
        elements.push(this.parseExpression())
      }
    }

    this.consume('RBRACKET')
    return { type: 'ArrayLiteral', elements }
  }
}
