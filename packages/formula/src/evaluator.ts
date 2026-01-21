/**
 * Evaluator - Executes AST to produce a result
 *
 * Takes an AST node and a context with property values,
 * and returns the computed result.
 */

import type { ASTNode } from './ast.js'
import type { FormulaFunction } from './functions/index.js'

/**
 * Context for formula evaluation
 */
export interface EvaluatorContext {
  /** Property values available to the formula */
  props: Record<string, unknown>
  /** Function to get related items (for rollups) */
  getRelation?: (propertyId: string) => unknown[]
  /** Custom functions to add to the evaluator */
  customFunctions?: Record<string, FormulaFunction>
}

/**
 * Evaluation error with position information
 */
export class EvaluationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EvaluationError'
  }
}

/**
 * Evaluator class that executes AST nodes
 */
export class Evaluator {
  private context: EvaluatorContext
  private functions: Record<string, FormulaFunction>

  constructor(context: EvaluatorContext, functions: Record<string, FormulaFunction>) {
    this.context = context
    this.functions = { ...functions, ...context.customFunctions }
  }

  /**
   * Evaluate an AST node and return the result
   */
  evaluate(node: ASTNode): unknown {
    switch (node.type) {
      case 'NumberLiteral':
        return node.value

      case 'StringLiteral':
        return node.value

      case 'BooleanLiteral':
        return node.value

      case 'NullLiteral':
        return null

      case 'Identifier':
        return this.evaluateIdentifier(node.name)

      case 'ArrayLiteral':
        return node.elements.map((el) => this.evaluate(el))

      case 'BinaryExpression':
        return this.evaluateBinary(node.operator, node.left, node.right)

      case 'UnaryExpression':
        return this.evaluateUnary(node.operator, node.argument)

      case 'CallExpression':
        return this.evaluateCall(node.callee, node.arguments)

      case 'ConditionalExpression':
        return this.evaluate(node.test)
          ? this.evaluate(node.consequent)
          : this.evaluate(node.alternate)

      case 'MemberExpression':
        return this.evaluateMember(node.object, node.property, node.computed)

      default:
        throw new EvaluationError(`Unknown node type: ${(node as ASTNode).type}`)
    }
  }

  /**
   * Evaluate an identifier (property access)
   */
  private evaluateIdentifier(name: string): unknown {
    // Check if it's a property
    if (name in this.context.props) {
      return this.context.props[name]
    }
    // Return undefined for unknown identifiers
    return undefined
  }

  /**
   * Evaluate a binary expression
   */
  private evaluateBinary(operator: string, leftNode: ASTNode, rightNode: ASTNode): unknown {
    // Short-circuit evaluation for logical operators
    if (operator === '&&') {
      const left = this.evaluate(leftNode)
      if (!left) return left
      return this.evaluate(rightNode)
    }
    if (operator === '||') {
      const left = this.evaluate(leftNode)
      if (left) return left
      return this.evaluate(rightNode)
    }

    const left = this.evaluate(leftNode)
    const right = this.evaluate(rightNode)

    switch (operator) {
      // Arithmetic
      case '+':
        if (typeof left === 'string' || typeof right === 'string') {
          return String(left ?? '') + String(right ?? '')
        }
        return toNumber(left) + toNumber(right)
      case '-':
        return toNumber(left) - toNumber(right)
      case '*':
        return toNumber(left) * toNumber(right)
      case '/':
        const divisor = toNumber(right)
        if (divisor === 0) return Infinity
        return toNumber(left) / divisor
      case '%':
        return toNumber(left) % toNumber(right)
      case '**':
        return Math.pow(toNumber(left), toNumber(right))

      // Comparison
      case '==':
        return left === right
      case '!=':
        return left !== right
      case '<':
        return toNumber(left) < toNumber(right)
      case '>':
        return toNumber(left) > toNumber(right)
      case '<=':
        return toNumber(left) <= toNumber(right)
      case '>=':
        return toNumber(left) >= toNumber(right)

      default:
        throw new EvaluationError(`Unknown operator: ${operator}`)
    }
  }

  /**
   * Evaluate a unary expression
   */
  private evaluateUnary(operator: string, argumentNode: ASTNode): unknown {
    const arg = this.evaluate(argumentNode)

    switch (operator) {
      case '-':
        return -toNumber(arg)
      case '!':
        return !arg
      default:
        throw new EvaluationError(`Unknown unary operator: ${operator}`)
    }
  }

  /**
   * Evaluate a function call
   */
  private evaluateCall(callee: string, argumentNodes: ASTNode[]): unknown {
    const fn = this.functions[callee]
    if (!fn) {
      throw new EvaluationError(`Unknown function: ${callee}`)
    }

    const args = argumentNodes.map((arg) => this.evaluate(arg))
    return fn(args, this.context)
  }

  /**
   * Evaluate a member expression
   */
  private evaluateMember(objectNode: ASTNode, propertyNode: ASTNode, computed: boolean): unknown {
    const obj = this.evaluate(objectNode)

    if (obj == null) {
      return undefined
    }

    if (computed) {
      // arr[0] or obj["key"]
      const prop = this.evaluate(propertyNode)
      if (Array.isArray(obj)) {
        return obj[toNumber(prop)]
      }
      if (typeof obj === 'object') {
        return (obj as Record<string, unknown>)[String(prop)]
      }
    } else {
      // obj.prop
      if (propertyNode.type !== 'Identifier') {
        throw new EvaluationError('Expected identifier for property access')
      }
      if (typeof obj === 'object') {
        return (obj as Record<string, unknown>)[propertyNode.name]
      }
    }

    return undefined
  }
}

/**
 * Convert value to number safely
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const num = parseFloat(value)
    return isNaN(num) ? 0 : num
  }
  if (value == null) return 0
  return 0
}
