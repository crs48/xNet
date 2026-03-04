/**
 * Authorization schema validation.
 *
 * Validates that authorization blocks are well-formed:
 * - Role references in actions exist in the roles definition
 * - Property-based roles reference existing person properties
 * - Expression depth limits are enforced
 */

import type { PropertyDefinition } from '../schema/types'
import type { AuthorizationDefinition, AuthExpression } from '@xnetjs/core'

// ─── Validation Result Types ──────────────────────────────────────────────────

/**
 * Result of authorization schema validation.
 */
export interface AuthValidationResult {
  valid: boolean
  errors: AuthValidationError[]
}

/**
 * A single validation error.
 */
export interface AuthValidationError {
  /** Error code for programmatic handling */
  code: AuthSchemaErrorCode
  /** Human-readable error message */
  message: string
  /** JSON path to the error location */
  path: string
}

/**
 * Error codes for authorization schema validation.
 */
export type AuthSchemaErrorCode =
  | 'AUTH_SCHEMA_INVALID_ROLE_REF' // Action references unknown role
  | 'AUTH_SCHEMA_INVALID_ACTION_REF' // Reference to unknown action
  | 'AUTH_SCHEMA_INVALID_RELATION_PATH' // Relation/property doesn't exist
  | 'AUTH_SCHEMA_ROLE_CYCLE' // Circular role definition
  | 'AUTH_SCHEMA_EXPR_LIMIT_EXCEEDED' // Expression tree too deep/large
  | 'AUTH_SCHEMA_UNSAFE_PUBLIC_MUTATION' // PUBLIC on write/delete/share action
  | 'AUTH_SCHEMA_INVALID_FIELD_REF' // Field rule references unknown field
  | 'AUTH_SCHEMA_INVALID_PUBLIC_PROP' // publicProps references unknown property

// ─── Builtin Roles ────────────────────────────────────────────────────────────

/**
 * Roles that are always available without definition.
 */
export const BUILTIN_ROLES = ['owner'] as const

// ─── Expression Utilities ─────────────────────────────────────────────────────

/**
 * Extract all role references from an authorization expression.
 */
export function extractRoleRefs(expr: AuthExpression): string[] {
  const roles: string[] = []

  function visit(e: AuthExpression): void {
    switch (e._tag) {
      case 'allow':
      case 'deny':
        roles.push(...e.roles)
        break
      case 'and':
      case 'or':
        for (const sub of e.exprs) visit(sub)
        break
      case 'not':
        visit(e.expr)
        break
      case 'roleRef':
        roles.push(e.role)
        break
      case 'public':
      case 'authenticated':
        // No role references
        break
    }
  }

  visit(expr)
  return roles
}

/**
 * Count the number of nodes in an expression tree.
 */
export function countExpressionNodes(expr: AuthExpression): number {
  let count = 1 // Count this node

  switch (expr._tag) {
    case 'and':
    case 'or':
      for (const sub of expr.exprs) {
        count += countExpressionNodes(sub)
      }
      break
    case 'not':
      count += countExpressionNodes(expr.expr)
      break
    // Leaf nodes: allow, deny, roleRef, public, authenticated
  }

  return count
}

/**
 * Check if an expression allows public access.
 */
export function hasPublicAccess(expr: AuthExpression): boolean {
  if (expr._tag === 'public') return true
  if (expr._tag === 'or') return expr.exprs.some(hasPublicAccess)
  if (expr._tag === 'and') return expr.exprs.every(hasPublicAccess)
  if (expr._tag === 'not') return false // not(public) is not public
  return false
}

// ─── Main Validation Function ─────────────────────────────────────────────────

/**
 * Maximum allowed nodes in an expression tree.
 */
export const MAX_EXPRESSION_NODES = 50

/**
 * Validate an authorization definition against property definitions.
 *
 * Checks:
 * 1. All role references in action expressions exist in roles
 * 2. Property-based roles reference existing person properties
 * 3. Relation-based roles reference existing relation properties
 * 4. publicProps reference existing properties
 * 5. Expression depth limits are enforced
 * 6. Write/delete/share actions don't use PUBLIC (unsafe)
 */
export function validateAuthorization(
  auth: AuthorizationDefinition,
  properties: Record<string, PropertyDefinition>
): AuthValidationResult {
  const errors: AuthValidationError[] = []

  // 1. Validate all role references in action expressions exist in roles
  for (const [actionName, expr] of Object.entries(auth.actions)) {
    const referencedRoles = extractRoleRefs(expr)
    for (const ref of referencedRoles) {
      if (!(ref in auth.roles) && !BUILTIN_ROLES.includes(ref as (typeof BUILTIN_ROLES)[number])) {
        errors.push({
          code: 'AUTH_SCHEMA_INVALID_ROLE_REF',
          message: `Action '${actionName}' references unknown role '${ref}'`,
          path: `authorization.actions.${actionName}`
        })
      }
    }
  }

  // 2. Validate property-based roles reference existing person properties
  for (const [roleName, resolver] of Object.entries(auth.roles)) {
    if (resolver._tag === 'property') {
      const propDef = properties[resolver.propertyName]
      if (!propDef) {
        errors.push({
          code: 'AUTH_SCHEMA_INVALID_RELATION_PATH',
          message: `Role '${roleName}' references non-existent property '${resolver.propertyName}'`,
          path: `authorization.roles.${roleName}`
        })
      } else if (propDef.type !== 'person') {
        errors.push({
          code: 'AUTH_SCHEMA_INVALID_RELATION_PATH',
          message: `Role '${roleName}' references property '${resolver.propertyName}' which is not a person type (got '${propDef.type}')`,
          path: `authorization.roles.${roleName}`
        })
      }
    }

    if (resolver._tag === 'relation') {
      const propDef = properties[resolver.relationName]
      if (!propDef) {
        errors.push({
          code: 'AUTH_SCHEMA_INVALID_RELATION_PATH',
          message: `Role '${roleName}' references non-existent relation '${resolver.relationName}'`,
          path: `authorization.roles.${roleName}`
        })
      } else if (propDef.type !== 'relation') {
        errors.push({
          code: 'AUTH_SCHEMA_INVALID_RELATION_PATH',
          message: `Role '${roleName}' references property '${resolver.relationName}' which is not a relation type (got '${propDef.type}')`,
          path: `authorization.roles.${roleName}`
        })
      }
    }
  }

  // 3. Validate publicProps reference existing properties
  if (auth.publicProps) {
    for (const prop of auth.publicProps) {
      if (!(prop in properties)) {
        errors.push({
          code: 'AUTH_SCHEMA_INVALID_PUBLIC_PROP',
          message: `publicProps references non-existent property '${prop}'`,
          path: `authorization.publicProps`
        })
      }
    }
  }

  // 4. Validate expression depth (max 50 nodes)
  for (const [actionName, expr] of Object.entries(auth.actions)) {
    const nodeCount = countExpressionNodes(expr)
    if (nodeCount > MAX_EXPRESSION_NODES) {
      errors.push({
        code: 'AUTH_SCHEMA_EXPR_LIMIT_EXCEEDED',
        message: `Action '${actionName}' expression has ${nodeCount} nodes (max ${MAX_EXPRESSION_NODES})`,
        path: `authorization.actions.${actionName}`
      })
    }
  }

  // 5. Validate field rules reference existing properties
  if (auth.fieldRules) {
    for (const fieldName of Object.keys(auth.fieldRules)) {
      if (!(fieldName in properties)) {
        errors.push({
          code: 'AUTH_SCHEMA_INVALID_FIELD_REF',
          message: `fieldRules references non-existent property '${fieldName}'`,
          path: `authorization.fieldRules.${fieldName}`
        })
      }
    }
  }

  // 6. Warn about PUBLIC on mutation actions (unsafe pattern)
  const mutationActions = ['write', 'delete', 'share']
  for (const actionName of mutationActions) {
    const expr = auth.actions[actionName]
    if (expr && hasPublicAccess(expr)) {
      errors.push({
        code: 'AUTH_SCHEMA_UNSAFE_PUBLIC_MUTATION',
        message: `Action '${actionName}' allows PUBLIC access, which is unsafe for mutation operations`,
        path: `authorization.actions.${actionName}`
      })
    }
  }

  return { valid: errors.length === 0, errors }
}
