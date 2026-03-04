/**
 * Authorization expression builders for schema definitions.
 *
 * These functions create typed AST nodes for authorization rules.
 *
 * @example
 * ```typescript
 * import { allow, deny, and, or, not, role, PUBLIC, AUTHENTICATED } from '@xnetjs/data/auth'
 *
 * const TaskSchema = defineSchema({
 *   // ...
 *   authorization: {
 *     roles: {
 *       owner: role.creator(),
 *       editor: role.property('editors'),
 *       admin: role.relation('project', 'admin')
 *     },
 *     actions: {
 *       read: allow('editor', 'admin', 'owner'),
 *       write: allow('editor', 'admin', 'owner'),
 *       delete: allow('admin', 'owner'),
 *       share: allow('admin', 'owner')
 *     }
 *   }
 * })
 * ```
 */

import type {
  AllowExpr,
  DenyExpr,
  AndExpr,
  OrExpr,
  NotExpr,
  PublicExpr,
  AuthenticatedExpr,
  AuthExpression,
  CreatorRoleResolver,
  PropertyRoleResolver,
  RelationRoleResolver
} from '@xnetjs/core'

// ─── Expression Builders ──────────────────────────────────────────────────────

/**
 * Allow access if the subject has any of the specified roles.
 *
 * @example
 * ```typescript
 * read: allow('viewer', 'editor', 'admin', 'owner')
 * ```
 */
export function allow(...roles: string[]): AllowExpr {
  return { _tag: 'allow', roles }
}

/**
 * Deny access if the subject has any of the specified roles.
 * Deny ALWAYS takes precedence over allow.
 *
 * @example
 * ```typescript
 * read: and(allow('member'), deny('banned'))
 * ```
 */
export function deny(...roles: string[]): DenyExpr {
  return { _tag: 'deny', roles }
}

/**
 * Logical AND - all sub-expressions must be true.
 *
 * @example
 * ```typescript
 * write: and(allow('editor'), deny('readonly'))
 * ```
 */
export function and(...exprs: AuthExpression[]): AndExpr {
  return { _tag: 'and', exprs }
}

/**
 * Logical OR - any sub-expression must be true.
 *
 * @example
 * ```typescript
 * read: or(allow('owner'), PUBLIC)
 * ```
 */
export function or(...exprs: AuthExpression[]): OrExpr {
  return { _tag: 'or', exprs }
}

/**
 * Logical NOT - negate the sub-expression.
 *
 * @example
 * ```typescript
 * write: and(AUTHENTICATED, not(allow('banned')))
 * ```
 */
export function not(expr: AuthExpression): NotExpr {
  return { _tag: 'not', expr }
}

/**
 * Public access - always allows access.
 * Use for read-only public content.
 *
 * @example
 * ```typescript
 * read: PUBLIC
 * ```
 */
export const PUBLIC: PublicExpr = { _tag: 'public' }

/**
 * Authenticated access - allows any authenticated user.
 * Use for open-but-not-anonymous content.
 *
 * @example
 * ```typescript
 * read: AUTHENTICATED
 * write: AUTHENTICATED
 * ```
 */
export const AUTHENTICATED: AuthenticatedExpr = { _tag: 'authenticated' }

// ─── Role Builders ────────────────────────────────────────────────────────────

/**
 * Role resolver builders.
 *
 * @example
 * ```typescript
 * roles: {
 *   owner: role.creator(),
 *   assignee: role.property('assignee'),
 *   admin: role.relation('project', 'admin')
 * }
 * ```
 */
export const role = {
  /**
   * Role held by the node's creator.
   * The DID in `createdBy` holds this role.
   */
  creator(): CreatorRoleResolver {
    return { _tag: 'creator' }
  },

  /**
   * Role determined by a person property on the node.
   * The DID(s) in that property hold this role.
   *
   * @param propertyName - Name of the person/person[] property
   */
  property(propertyName: string): PropertyRoleResolver {
    return { _tag: 'property', propertyName }
  },

  /**
   * Role inherited from a related node.
   * Users who hold `targetRole` on the related node hold this role.
   *
   * @param relationName - Name of the relation property
   * @param targetRole - Role to check on the related node
   */
  relation(relationName: string, targetRole: string): RelationRoleResolver {
    return { _tag: 'relation', relationName, targetRole }
  }
}

// ─── Relation Helper ──────────────────────────────────────────────────────────

/**
 * Alias for role.relation() for use in authorization expressions.
 * @deprecated Use role.relation() instead
 */
export const relation = role.relation
