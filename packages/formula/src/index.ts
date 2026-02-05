/**
 * @xnet/formula - Formula Engine
 *
 * Expression parser and evaluator for computed properties.
 * Supports Notion-compatible formula syntax.
 *
 * @example
 * ```typescript
 * import { evaluateFormula } from '@xnet/formula'
 *
 * const result = evaluateFormula('prop("price") * prop("quantity")', {
 *   props: { price: 100, quantity: 5 }
 * })
 * // result: 500
 * ```
 */

import type { ASTNode } from './ast.js'
import type { EvaluatorContext } from './evaluator.js'
import { Evaluator } from './evaluator.js'
import { functions } from './functions/index.js'
import { Lexer } from './lexer.js'
import { Parser, ParseError } from './parser.js'

// ============================================================================
// Main API
// ============================================================================

/**
 * Parse a formula string into an AST
 *
 * @param expression - Formula expression string
 * @returns Parsed AST
 * @throws ParseError if formula syntax is invalid
 *
 * @example
 * ```typescript
 * const ast = parseFormula('1 + 2 * 3')
 * // Returns: { type: 'BinaryExpression', ... }
 * ```
 */
export function parseFormula(expression: string): ASTNode {
  const lexer = new Lexer(expression)
  const tokens = lexer.tokenize()
  const parser = new Parser(tokens)
  return parser.parse()
}

/**
 * Evaluate a formula expression
 *
 * @param expression - Formula expression string
 * @param context - Evaluation context with property values
 * @returns Computed result
 * @throws ParseError if formula syntax is invalid
 * @throws EvaluationError if evaluation fails
 *
 * @example
 * ```typescript
 * const result = evaluateFormula('price * quantity', {
 *   props: { price: 100, quantity: 5 }
 * })
 * // result: 500
 * ```
 */
export function evaluateFormula(
  expression: string,
  context: EvaluatorContext = { props: {} }
): unknown {
  const ast = parseFormula(expression)
  const evaluator = new Evaluator(context, functions)
  return evaluator.evaluate(ast)
}

/**
 * Evaluate a pre-parsed AST
 *
 * @param ast - Parsed AST node
 * @param context - Evaluation context with property values
 * @returns Computed result
 *
 * @example
 * ```typescript
 * const ast = parseFormula('price * quantity')
 * const result = evaluateAST(ast, { props: { price: 100, quantity: 5 } })
 * // result: 500
 * ```
 */
export function evaluateAST(ast: ASTNode, context: EvaluatorContext = { props: {} }): unknown {
  const evaluator = new Evaluator(context, functions)
  return evaluator.evaluate(ast)
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the formula is valid */
  valid: boolean
  /** Error message if invalid */
  error?: string
  /** Error position if invalid */
  position?: number
}

/**
 * Validate formula syntax without evaluating
 *
 * @param expression - Formula expression string
 * @returns Validation result with error details if invalid
 *
 * @example
 * ```typescript
 * const result = validateFormula('1 + 2')
 * // result: { valid: true }
 *
 * const result2 = validateFormula('1 +')
 * // result2: { valid: false, error: 'Unexpected token EOF at position 3' }
 * ```
 */
export function validateFormula(expression: string): ValidationResult {
  try {
    parseFormula(expression)
    return { valid: true }
  } catch (e) {
    if (e instanceof ParseError) {
      return { valid: false, error: e.message, position: e.position }
    }
    return { valid: false, error: (e as Error).message }
  }
}

/**
 * Compiled formula for repeated evaluation
 */
export interface CompiledFormula {
  /** Original expression */
  expression: string
  /** Parsed AST */
  ast: ASTNode
  /** Evaluate with context */
  evaluate: (context?: EvaluatorContext) => unknown
}

/**
 * Compile a formula for repeated evaluation
 *
 * Use this when evaluating the same formula multiple times with different contexts.
 * Parsing is done once, making subsequent evaluations faster.
 *
 * @param expression - Formula expression string
 * @returns Compiled formula object
 *
 * @example
 * ```typescript
 * const formula = compileFormula('price * quantity')
 *
 * const result1 = formula.evaluate({ props: { price: 100, quantity: 5 } })
 * const result2 = formula.evaluate({ props: { price: 200, quantity: 3 } })
 * ```
 */
export function compileFormula(expression: string): CompiledFormula {
  const ast = parseFormula(expression)
  return {
    expression,
    ast,
    evaluate: (context: EvaluatorContext = { props: {} }) => {
      const evaluator = new Evaluator(context, functions)
      return evaluator.evaluate(ast)
    }
  }
}

/**
 * Extract property references from a formula
 *
 * Finds all prop("name") calls in the formula.
 *
 * @param expression - Formula expression string
 * @returns Array of property names referenced
 *
 * @example
 * ```typescript
 * const props = extractPropertyReferences('prop("price") * prop("quantity") + tax')
 * // props: ['price', 'quantity']
 * ```
 */
export function extractPropertyReferences(expression: string): string[] {
  const ast = parseFormula(expression)
  const props = new Set<string>()
  extractPropsFromNode(ast, props)
  return Array.from(props)
}

function extractPropsFromNode(node: ASTNode, props: Set<string>): void {
  switch (node.type) {
    case 'CallExpression':
      if (node.callee === 'prop' && node.arguments.length > 0) {
        const arg = node.arguments[0]
        if (arg.type === 'StringLiteral') {
          props.add(arg.value)
        }
      }
      // Check function arguments
      node.arguments.forEach((arg) => extractPropsFromNode(arg, props))
      break
    case 'BinaryExpression':
      extractPropsFromNode(node.left, props)
      extractPropsFromNode(node.right, props)
      break
    case 'UnaryExpression':
      extractPropsFromNode(node.argument, props)
      break
    case 'ConditionalExpression':
      extractPropsFromNode(node.test, props)
      extractPropsFromNode(node.consequent, props)
      extractPropsFromNode(node.alternate, props)
      break
    case 'ArrayLiteral':
      node.elements.forEach((el) => extractPropsFromNode(el, props))
      break
    case 'MemberExpression':
      extractPropsFromNode(node.object, props)
      if (node.computed) {
        extractPropsFromNode(node.property, props)
      }
      break
    case 'Identifier':
      // Bare identifiers are also property references
      props.add(node.name)
      break
  }
}

// ============================================================================
// Re-exports
// ============================================================================

// Classes
export { Lexer } from './lexer.js'
export { Parser, ParseError } from './parser.js'
export { Evaluator, EvaluationError } from './evaluator.js'

// Types
export type { Token, TokenType } from './lexer.js'
export type { ASTNode } from './ast.js'
export type { EvaluatorContext } from './evaluator.js'
export type { FormulaFunction } from './functions/index.js'

// AST builders
export {
  numberLiteral,
  stringLiteral,
  booleanLiteral,
  nullLiteral,
  identifier,
  arrayLiteral,
  binaryExpression,
  unaryExpression,
  callExpression,
  conditionalExpression,
  memberExpression
} from './ast.js'

// Functions
export { functions, getFunctionNames, hasFunction } from './functions/index.js'
