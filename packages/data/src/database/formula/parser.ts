/**
 * Formula expression parser.
 *
 * Parses formula expressions into an AST for evaluation.
 * Supports arithmetic, comparison, logical operators, function calls,
 * and column references using {{columnId}} syntax.
 */

// ─── AST Types ───────────────────────────────────────────────────────────────

export type ASTNode =
  | LiteralNode
  | ReferenceNode
  | BinaryNode
  | UnaryNode
  | CallNode
  | ConditionalNode

export interface LiteralNode {
  type: 'literal'
  value: unknown
}

export interface ReferenceNode {
  type: 'reference'
  columnId: string
  property?: string
}

export interface BinaryNode {
  type: 'binary'
  operator: string
  left: ASTNode
  right: ASTNode
}

export interface UnaryNode {
  type: 'unary'
  operator: string
  operand: ASTNode
}

export interface CallNode {
  type: 'call'
  name: string
  args: ASTNode[]
}

export interface ConditionalNode {
  type: 'conditional'
  condition: ASTNode
  then: ASTNode
  else: ASTNode
}

// ─── Parser ──────────────────────────────────────────────────────────────────

export class FormulaParser {
  private pos = 0
  private expr = ''
  private lastMatch = ''

  /**
   * Parse a formula expression into an AST.
   *
   * @example
   * ```typescript
   * const parser = new FormulaParser()
   * const ast = parser.parse('{{price}} * {{quantity}}')
   * ```
   */
  parse(expression: string): ASTNode {
    this.expr = expression.trim()
    this.pos = 0
    this.lastMatch = ''

    if (this.expr.length === 0) {
      return { type: 'literal', value: null }
    }

    const result = this.parseExpression()

    this.skipWhitespace()
    if (this.pos < this.expr.length) {
      throw new Error(`Unexpected token at position ${this.pos}: '${this.peek()}'`)
    }

    return result
  }

  // ─── Expression Parsing (Precedence Climbing) ────────────────────────────

  private parseExpression(): ASTNode {
    return this.parseOr()
  }

  private parseOr(): ASTNode {
    let left = this.parseAnd()

    while (this.match('||')) {
      const right = this.parseAnd()
      left = { type: 'binary', operator: '||', left, right }
    }

    return left
  }

  private parseAnd(): ASTNode {
    let left = this.parseEquality()

    while (this.match('&&')) {
      const right = this.parseEquality()
      left = { type: 'binary', operator: '&&', left, right }
    }

    return left
  }

  private parseEquality(): ASTNode {
    let left = this.parseComparison()

    while (this.matchAny(['==', '!='])) {
      const operator = this.lastMatch
      const right = this.parseComparison()
      left = { type: 'binary', operator, left, right }
    }

    return left
  }

  private parseComparison(): ASTNode {
    let left = this.parseAdditive()

    while (this.matchAny(['<=', '>=', '<', '>'])) {
      const operator = this.lastMatch
      const right = this.parseAdditive()
      left = { type: 'binary', operator, left, right }
    }

    return left
  }

  private parseAdditive(): ASTNode {
    let left = this.parseMultiplicative()

    // Note: '&' for string concat, but not '&&' (which is logical AND)
    while (this.matchAny(['+', '-']) || this.matchSingleAmpersand()) {
      const operator = this.lastMatch
      const right = this.parseMultiplicative()
      left = { type: 'binary', operator, left, right }
    }

    return left
  }

  /**
   * Match a single '&' but not '&&'.
   */
  private matchSingleAmpersand(): boolean {
    this.skipWhitespace()
    if (this.peek() === '&' && this.peekNext() !== '&') {
      this.pos++
      this.lastMatch = '&'
      return true
    }
    return false
  }

  private parseMultiplicative(): ASTNode {
    let left = this.parseUnary()

    while (this.matchAny(['*', '/', '%'])) {
      const operator = this.lastMatch
      const right = this.parseUnary()
      left = { type: 'binary', operator, left, right }
    }

    return left
  }

  private parseUnary(): ASTNode {
    if (this.matchAny(['-', '!'])) {
      const operator = this.lastMatch
      const operand = this.parseUnary()
      return { type: 'unary', operator, operand }
    }

    return this.parsePrimary()
  }

  private parsePrimary(): ASTNode {
    this.skipWhitespace()

    // Column reference: {{columnId}} or {{columnId.property}}
    if (this.match('{{')) {
      const start = this.pos
      while (this.pos < this.expr.length && this.expr.slice(this.pos, this.pos + 2) !== '}}') {
        this.pos++
      }
      const ref = this.expr.slice(start, this.pos)
      this.expect('}}')

      const [columnId, property] = ref.split('.')
      return { type: 'reference', columnId: columnId.trim(), property: property?.trim() }
    }

    // Number literal
    if (this.isDigit(this.peek()) || (this.peek() === '.' && this.isDigit(this.peekNext()))) {
      return { type: 'literal', value: this.parseNumber() }
    }

    // String literal
    if (this.peek() === '"' || this.peek() === "'") {
      return { type: 'literal', value: this.parseString() }
    }

    // Boolean literals
    if (this.match('true')) {
      return { type: 'literal', value: true }
    }
    if (this.match('false')) {
      return { type: 'literal', value: false }
    }

    // Null literal
    if (this.match('null')) {
      return { type: 'literal', value: null }
    }

    // Function call or identifier
    if (this.isAlpha(this.peek())) {
      const name = this.parseIdentifier()

      this.skipWhitespace()
      if (this.match('(')) {
        const args: ASTNode[] = []

        this.skipWhitespace()
        if (!this.check(')')) {
          do {
            this.skipWhitespace()
            args.push(this.parseExpression())
            this.skipWhitespace()
          } while (this.match(','))
        }

        this.expect(')')
        return { type: 'call', name: name.toUpperCase(), args }
      }

      // Bare identifier - treat as column reference
      return { type: 'reference', columnId: name }
    }

    // Parenthesized expression
    if (this.match('(')) {
      const expr = this.parseExpression()
      this.expect(')')
      return expr
    }

    throw new Error(`Unexpected token at position ${this.pos}: '${this.peek()}'`)
  }

  // ─── Literal Parsing ─────────────────────────────────────────────────────

  private parseNumber(): number {
    const start = this.pos

    // Integer part
    while (this.isDigit(this.peek())) {
      this.pos++
    }

    // Decimal part
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      this.pos++ // consume '.'
      while (this.isDigit(this.peek())) {
        this.pos++
      }
    }

    // Exponent part
    if (this.peek() === 'e' || this.peek() === 'E') {
      this.pos++
      if (this.peek() === '+' || this.peek() === '-') {
        this.pos++
      }
      while (this.isDigit(this.peek())) {
        this.pos++
      }
    }

    return parseFloat(this.expr.slice(start, this.pos))
  }

  private parseString(): string {
    const quote = this.peek()
    this.pos++ // consume opening quote

    let result = ''
    while (this.pos < this.expr.length && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.pos++ // consume backslash
        const escaped = this.peek()
        switch (escaped) {
          case 'n':
            result += '\n'
            break
          case 't':
            result += '\t'
            break
          case 'r':
            result += '\r'
            break
          case '\\':
            result += '\\'
            break
          case '"':
            result += '"'
            break
          case "'":
            result += "'"
            break
          default:
            result += escaped
        }
        this.pos++
      } else {
        result += this.peek()
        this.pos++
      }
    }

    if (this.pos >= this.expr.length) {
      throw new Error('Unterminated string literal')
    }

    this.pos++ // consume closing quote
    return result
  }

  private parseIdentifier(): string {
    const start = this.pos
    while (this.isAlphaNumeric(this.peek())) {
      this.pos++
    }
    return this.expr.slice(start, this.pos)
  }

  // ─── Helper Methods ──────────────────────────────────────────────────────

  private peek(): string {
    return this.expr[this.pos] ?? ''
  }

  private peekNext(): string {
    return this.expr[this.pos + 1] ?? ''
  }

  private check(expected: string): boolean {
    return this.expr.slice(this.pos, this.pos + expected.length) === expected
  }

  private match(expected: string): boolean {
    this.skipWhitespace()
    if (this.check(expected)) {
      this.pos += expected.length
      this.lastMatch = expected
      return true
    }
    return false
  }

  private matchAny(options: string[]): boolean {
    this.skipWhitespace()
    // Sort by length descending to match longer operators first
    const sorted = [...options].sort((a, b) => b.length - a.length)
    for (const option of sorted) {
      if (this.check(option)) {
        this.pos += option.length
        this.lastMatch = option
        return true
      }
    }
    return false
  }

  private expect(expected: string): void {
    this.skipWhitespace()
    if (!this.check(expected)) {
      throw new Error(`Expected '${expected}' at position ${this.pos}, got '${this.peek()}'`)
    }
    this.pos += expected.length
  }

  private skipWhitespace(): void {
    while (this.pos < this.expr.length && /\s/.test(this.peek())) {
      this.pos++
    }
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9'
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_'
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char)
  }
}
