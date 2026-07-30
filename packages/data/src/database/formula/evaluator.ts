/**
 * Formula expression evaluator.
 *
 * Evaluates an AST against a row context to produce a value.
 */

import type { ASTNode } from './parser'
import type { ColumnDefinition } from '../column-types'
import { FUNCTIONS } from './functions'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Context for evaluating a formula.
 */
export interface EvalContext {
  /** Get column value for current row */
  getValue: (columnId: string) => unknown

  /** Get column definition */
  getColumn: (columnId: string) => ColumnDefinition | undefined

  /**
   * Cross-node scope (0346): values of a target column across the rows
   * this row relates to through a relation column. Pre-resolved by the
   * host (formulas stay synchronous); absent on hosts without relation
   * access — RELATED() then evaluates to [].
   */
  getRelatedValues?: (relationColumnId: string, targetColumnId?: string) => unknown[]

  /**
   * Cross-node scope (0346): a named node's property, pre-resolved by
   * the host. Absent → NODE() evaluates to null.
   */
  getNodeProperty?: (nodeId: string, property: string) => unknown
}

// ─── Evaluator ───────────────────────────────────────────────────────────────

/**
 * Evaluate an AST node against a context.
 *
 * @example
 * ```typescript
 * const context = {
 *   getValue: (id) => row.cells[id],
 *   getColumn: (id) => columns.find(c => c.id === id)
 * }
 * const result = evaluate(ast, context)
 * ```
 */
export function evaluate(node: ASTNode, context: EvalContext): unknown {
  switch (node.type) {
    case 'literal':
      return node.value

    case 'reference':
      return evaluateReference(node.columnId, node.property, context)

    case 'binary':
      return evaluateBinary(node.operator, node.left, node.right, context)

    case 'unary':
      return evaluateUnary(node.operator, node.operand, context)

    case 'call':
      return evaluateCall(node.name, node.args, context)

    case 'conditional':
      return evaluateConditional(node.condition, node.then, node.else, context)

    default:
      throw new Error(`Unknown node type: ${(node as ASTNode).type}`)
  }
}

// ─── Node Evaluators ─────────────────────────────────────────────────────────

function evaluateReference(
  columnId: string,
  property: string | undefined,
  context: EvalContext
): unknown {
  const value = context.getValue(columnId)

  if (property && typeof value === 'object' && value !== null) {
    return (value as Record<string, unknown>)[property]
  }

  return value
}

function evaluateBinary(
  operator: string,
  left: ASTNode,
  right: ASTNode,
  context: EvalContext
): unknown {
  const lval = evaluate(left, context)
  const rval = evaluate(right, context)

  switch (operator) {
    // Arithmetic
    case '+':
      return Number(lval) + Number(rval)
    case '-':
      return Number(lval) - Number(rval)
    case '*':
      return Number(lval) * Number(rval)
    case '/':
      return Number(lval) / Number(rval)
    case '%':
      return Number(lval) % Number(rval)

    // String concatenation
    case '&':
      return String(lval ?? '') + String(rval ?? '')

    // Comparison
    case '==':
      return lval === rval
    case '!=':
      return lval !== rval
    case '<':
      return Number(lval) < Number(rval)
    case '>':
      return Number(lval) > Number(rval)
    case '<=':
      return Number(lval) <= Number(rval)
    case '>=':
      return Number(lval) >= Number(rval)

    // Logical
    case '&&':
      return Boolean(lval) && Boolean(rval)
    case '||':
      return Boolean(lval) || Boolean(rval)

    default:
      throw new Error(`Unknown operator: ${operator}`)
  }
}

function evaluateUnary(operator: string, operand: ASTNode, context: EvalContext): unknown {
  const value = evaluate(operand, context)

  switch (operator) {
    case '-':
      return -Number(value)
    case '!':
      return !value
    default:
      throw new Error(`Unknown unary operator: ${operator}`)
  }
}

function evaluateCall(name: string, args: ASTNode[], context: EvalContext): unknown {
  // Context-backed scope functions (0346): one formula language, scope
  // widened row → relations → named nodes (Coda's lesson — never a
  // second engine). Hosts that can't resolve relations degrade to
  // empty/null instead of erroring.
  if (name === 'RELATED') {
    const evaluated = args.map((arg) => evaluate(arg, context))
    const relationColumnId = String(evaluated[0] ?? '')
    const targetColumnId = evaluated[1] === undefined ? undefined : String(evaluated[1])
    return context.getRelatedValues?.(relationColumnId, targetColumnId) ?? []
  }
  if (name === 'NODE') {
    const evaluated = args.map((arg) => evaluate(arg, context))
    const nodeId = String(evaluated[0] ?? '')
    const property = String(evaluated[1] ?? '')
    return context.getNodeProperty?.(nodeId, property) ?? null
  }

  const fn = FUNCTIONS[name]

  if (!fn) {
    throw new Error(`Unknown function: ${name}`)
  }

  // Evaluate arguments
  const evaluatedArgs = args.map((arg) => evaluate(arg, context))

  return fn(...evaluatedArgs)
}

function evaluateConditional(
  condition: ASTNode,
  thenBranch: ASTNode,
  elseBranch: ASTNode,
  context: EvalContext
): unknown {
  const condValue = evaluate(condition, context)
  return condValue ? evaluate(thenBranch, context) : evaluate(elseBranch, context)
}

// ─── Safe Evaluation ─────────────────────────────────────────────────────────

/**
 * Safely evaluate a formula, catching errors.
 */
export function safeEvaluate(
  node: ASTNode,
  context: EvalContext
): { value: unknown; error?: string } {
  try {
    const value = evaluate(node, context)
    return { value }
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
