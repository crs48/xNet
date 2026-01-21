/**
 * AST Types - Abstract Syntax Tree node definitions
 *
 * Defines the structure of parsed formula expressions.
 */

/**
 * Base interface for all AST nodes
 */
export interface BaseNode {
  type: string
}

/**
 * Number literal (e.g., 42, 3.14)
 */
export interface NumberLiteral extends BaseNode {
  type: 'NumberLiteral'
  value: number
}

/**
 * String literal (e.g., "hello", 'world')
 */
export interface StringLiteral extends BaseNode {
  type: 'StringLiteral'
  value: string
}

/**
 * Boolean literal (true, false)
 */
export interface BooleanLiteral extends BaseNode {
  type: 'BooleanLiteral'
  value: boolean
}

/**
 * Null literal
 */
export interface NullLiteral extends BaseNode {
  type: 'NullLiteral'
}

/**
 * Identifier (variable name or function name)
 */
export interface Identifier extends BaseNode {
  type: 'Identifier'
  name: string
}

/**
 * Array literal (e.g., [1, 2, 3])
 */
export interface ArrayLiteral extends BaseNode {
  type: 'ArrayLiteral'
  elements: ASTNode[]
}

/**
 * Binary expression (e.g., 1 + 2, a && b)
 */
export interface BinaryExpression extends BaseNode {
  type: 'BinaryExpression'
  operator: string
  left: ASTNode
  right: ASTNode
}

/**
 * Unary expression (e.g., -5, !true)
 */
export interface UnaryExpression extends BaseNode {
  type: 'UnaryExpression'
  operator: string
  argument: ASTNode
}

/**
 * Function call expression (e.g., abs(-5), concat("a", "b"))
 */
export interface CallExpression extends BaseNode {
  type: 'CallExpression'
  callee: string
  arguments: ASTNode[]
}

/**
 * Conditional (ternary) expression (e.g., a ? b : c)
 */
export interface ConditionalExpression extends BaseNode {
  type: 'ConditionalExpression'
  test: ASTNode
  consequent: ASTNode
  alternate: ASTNode
}

/**
 * Member access expression (e.g., obj.prop, arr[0])
 */
export interface MemberExpression extends BaseNode {
  type: 'MemberExpression'
  object: ASTNode
  property: ASTNode
  computed: boolean // true for arr[0], false for obj.prop
}

/**
 * Union type of all AST node types
 */
export type ASTNode =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral
  | Identifier
  | ArrayLiteral
  | BinaryExpression
  | UnaryExpression
  | CallExpression
  | ConditionalExpression
  | MemberExpression

/**
 * Create a number literal node
 */
export function numberLiteral(value: number): NumberLiteral {
  return { type: 'NumberLiteral', value }
}

/**
 * Create a string literal node
 */
export function stringLiteral(value: string): StringLiteral {
  return { type: 'StringLiteral', value }
}

/**
 * Create a boolean literal node
 */
export function booleanLiteral(value: boolean): BooleanLiteral {
  return { type: 'BooleanLiteral', value }
}

/**
 * Create a null literal node
 */
export function nullLiteral(): NullLiteral {
  return { type: 'NullLiteral' }
}

/**
 * Create an identifier node
 */
export function identifier(name: string): Identifier {
  return { type: 'Identifier', name }
}

/**
 * Create an array literal node
 */
export function arrayLiteral(elements: ASTNode[]): ArrayLiteral {
  return { type: 'ArrayLiteral', elements }
}

/**
 * Create a binary expression node
 */
export function binaryExpression(
  operator: string,
  left: ASTNode,
  right: ASTNode
): BinaryExpression {
  return { type: 'BinaryExpression', operator, left, right }
}

/**
 * Create a unary expression node
 */
export function unaryExpression(operator: string, argument: ASTNode): UnaryExpression {
  return { type: 'UnaryExpression', operator, argument }
}

/**
 * Create a function call expression node
 */
export function callExpression(callee: string, args: ASTNode[]): CallExpression {
  return { type: 'CallExpression', callee, arguments: args }
}

/**
 * Create a conditional expression node
 */
export function conditionalExpression(
  test: ASTNode,
  consequent: ASTNode,
  alternate: ASTNode
): ConditionalExpression {
  return { type: 'ConditionalExpression', test, consequent, alternate }
}

/**
 * Create a member expression node
 */
export function memberExpression(
  object: ASTNode,
  property: ASTNode,
  computed: boolean
): MemberExpression {
  return { type: 'MemberExpression', object, property, computed }
}
