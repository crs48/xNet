/**
 * Lexer - Tokenizer for formula expressions
 *
 * Converts formula strings into a stream of tokens for the parser.
 */

export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'IDENTIFIER'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'COMMA'
  | 'DOT'
  | 'EOF'

export interface Token {
  type: TokenType
  value: string | number | boolean
  position: number
}

/**
 * Lexer class that tokenizes formula expressions
 */
export class Lexer {
  private input: string
  private position = 0

  constructor(input: string) {
    this.input = input
  }

  /**
   * Tokenize the input string into an array of tokens
   */
  tokenize(): Token[] {
    const tokens: Token[] = []

    while (this.position < this.input.length) {
      this.skipWhitespace()
      if (this.position >= this.input.length) break

      const char = this.input[this.position]

      // Numbers (including negative with preceding operator context)
      if (this.isDigit(char)) {
        tokens.push(this.readNumber())
        continue
      }

      // Strings (double or single quoted)
      if (char === '"' || char === "'") {
        tokens.push(this.readString(char))
        continue
      }

      // Identifiers and keywords (true, false)
      if (this.isAlpha(char)) {
        tokens.push(this.readIdentifier())
        continue
      }

      // Operators
      if (this.isOperatorStart(char)) {
        tokens.push(this.readOperator())
        continue
      }

      // Parentheses
      if (char === '(') {
        tokens.push({ type: 'LPAREN', value: '(', position: this.position++ })
        continue
      }
      if (char === ')') {
        tokens.push({ type: 'RPAREN', value: ')', position: this.position++ })
        continue
      }

      // Brackets (for array access)
      if (char === '[') {
        tokens.push({ type: 'LBRACKET', value: '[', position: this.position++ })
        continue
      }
      if (char === ']') {
        tokens.push({ type: 'RBRACKET', value: ']', position: this.position++ })
        continue
      }

      // Comma (function argument separator)
      if (char === ',') {
        tokens.push({ type: 'COMMA', value: ',', position: this.position++ })
        continue
      }

      // Dot (property access)
      if (char === '.') {
        // Check if it's part of a number (e.g., .5)
        if (this.position + 1 < this.input.length && this.isDigit(this.input[this.position + 1])) {
          tokens.push(this.readNumber())
          continue
        }
        tokens.push({ type: 'DOT', value: '.', position: this.position++ })
        continue
      }

      throw new Error(`Unexpected character '${char}' at position ${this.position}`)
    }

    tokens.push({ type: 'EOF', value: '', position: this.position })
    return tokens
  }

  /**
   * Skip whitespace characters
   */
  private skipWhitespace(): void {
    while (this.position < this.input.length && /\s/.test(this.input[this.position])) {
      this.position++
    }
  }

  /**
   * Check if character is a digit
   */
  private isDigit(char: string): boolean {
    return /[0-9]/.test(char)
  }

  /**
   * Check if character is an alphabetic character or underscore
   */
  private isAlpha(char: string): boolean {
    return /[a-zA-Z_]/.test(char)
  }

  /**
   * Check if character is alphanumeric
   */
  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char)
  }

  /**
   * Check if character starts an operator
   */
  private isOperatorStart(char: string): boolean {
    return ['+', '-', '*', '/', '%', '=', '!', '<', '>', '&', '|', '^'].includes(char)
  }

  /**
   * Read a number token (integer or decimal)
   */
  private readNumber(): Token {
    const start = this.position
    let hasDecimal = false

    // Handle leading decimal point (e.g., .5)
    if (this.input[this.position] === '.') {
      hasDecimal = true
      this.position++
    }

    while (this.position < this.input.length) {
      const char = this.input[this.position]
      if (this.isDigit(char)) {
        this.position++
      } else if (char === '.' && !hasDecimal) {
        hasDecimal = true
        this.position++
      } else if (char === 'e' || char === 'E') {
        // Scientific notation
        this.position++
        if (this.input[this.position] === '+' || this.input[this.position] === '-') {
          this.position++
        }
      } else {
        break
      }
    }

    const value = parseFloat(this.input.slice(start, this.position))
    return { type: 'NUMBER', value, position: start }
  }

  /**
   * Read a string token (handles escape sequences)
   */
  private readString(quote: string): Token {
    const start = this.position
    this.position++ // Skip opening quote

    let value = ''
    while (this.position < this.input.length) {
      const char = this.input[this.position]
      if (char === quote) {
        this.position++
        return { type: 'STRING', value, position: start }
      }
      if (char === '\\') {
        this.position++
        value += this.readEscapeSequence()
      } else {
        value += char
        this.position++
      }
    }

    throw new Error(`Unterminated string at position ${start}`)
  }

  /**
   * Read an escape sequence in a string
   */
  private readEscapeSequence(): string {
    if (this.position >= this.input.length) {
      throw new Error(`Unexpected end of input in escape sequence`)
    }

    const char = this.input[this.position++]
    switch (char) {
      case 'n':
        return '\n'
      case 't':
        return '\t'
      case 'r':
        return '\r'
      case '\\':
        return '\\'
      case '"':
        return '"'
      case "'":
        return "'"
      case '0':
        return '\0'
      default:
        return char
    }
  }

  /**
   * Read an identifier or keyword token
   */
  private readIdentifier(): Token {
    const start = this.position

    while (this.position < this.input.length) {
      const char = this.input[this.position]
      if (this.isAlphaNumeric(char)) {
        this.position++
      } else {
        break
      }
    }

    const value = this.input.slice(start, this.position)

    // Check for boolean keywords
    if (value === 'true') {
      return { type: 'BOOLEAN', value: true, position: start }
    }
    if (value === 'false') {
      return { type: 'BOOLEAN', value: false, position: start }
    }

    return { type: 'IDENTIFIER', value, position: start }
  }

  /**
   * Read an operator token (handles multi-character operators)
   */
  private readOperator(): Token {
    const start = this.position
    const char = this.input[this.position++]

    // Check for two-character operators
    if (this.position < this.input.length) {
      const next = this.input[this.position]
      const twoChar = char + next

      if (['==', '!=', '<=', '>=', '&&', '||', '**'].includes(twoChar)) {
        this.position++
        return { type: 'OPERATOR', value: twoChar, position: start }
      }
    }

    return { type: 'OPERATOR', value: char, position: start }
  }
}
