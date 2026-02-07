/**
 * Formula module exports.
 */

export {
  FormulaParser,
  type ASTNode,
  type LiteralNode,
  type ReferenceNode,
  type BinaryNode,
  type UnaryNode,
  type CallNode,
  type ConditionalNode
} from './parser'

export { evaluate, safeEvaluate, type EvalContext } from './evaluator'

export {
  FUNCTIONS,
  isValidFunction,
  getFunction,
  getFunctionNames,
  type FormulaFunction
} from './functions'

export {
  extractDependencies,
  detectCircularDependencies,
  wouldCreateCircular,
  buildDependencyGraph,
  getAffectedColumns,
  getEvaluationOrder,
  type CircularCheckResult,
  type DependencyGraph
} from './dependency'
