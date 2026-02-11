/**
 * Authorization module for xNet schemas.
 *
 * This module provides typed builders for defining authorization rules
 * in schemas, plus validation utilities.
 */

// Re-export types from core
export type {
  AuthAction,
  AuthDecision,
  AuthDenyReason,
  AuthTrace,
  AuthTraceStep,
  AuthorizationDefinition,
  SerializedAuthorization,
  AuthExpression,
  SerializedAuthExpression,
  AllowExpr,
  DenyExpr,
  AndExpr,
  OrExpr,
  NotExpr,
  RoleRefExpr,
  PublicExpr,
  AuthenticatedExpr,
  RoleResolver,
  SerializedRoleResolver,
  CreatorRoleResolver,
  PropertyRoleResolver,
  RelationRoleResolver,
  AuthCheckInput,
  PolicyEvaluator
} from '@xnet/core'

export { AUTH_ACTIONS } from '@xnet/core'

// Builders
export { allow, deny, and, or, not, PUBLIC, AUTHENTICATED, role, relation } from './builders'

// Validation
export type { AuthValidationResult, AuthValidationError, AuthSchemaErrorCode } from './validate'
export {
  validateAuthorization,
  extractRoleRefs,
  countExpressionNodes,
  hasPublicAccess,
  BUILTIN_ROLES,
  MAX_EXPRESSION_NODES
} from './validate'

// Serialization
export {
  serializeAuthorization,
  deserializeAuthorization,
  serializeAuthExpression,
  deserializeAuthExpression
} from './serialize'

// Presets
export { presets } from './presets'
