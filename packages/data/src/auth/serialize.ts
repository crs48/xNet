/**
 * Serialization and deserialization of authorization definitions.
 *
 * Authorization blocks in schemas need to be serialized to JSON for storage
 * and deserialized back to typed objects for evaluation.
 */

import type {
  AuthorizationDefinition,
  SerializedAuthorization,
  AuthExpression,
  SerializedAuthExpression,
  RoleResolver,
  SerializedRoleResolver
} from '@xnetjs/core'

// ─── Expression Serialization ─────────────────────────────────────────────────

/**
 * Serialize an AuthExpression to its JSON-serializable form.
 */
export function serializeAuthExpression(expr: AuthExpression): SerializedAuthExpression {
  switch (expr._tag) {
    case 'allow':
      return { _tag: 'allow', roles: [...expr.roles] }
    case 'deny':
      return { _tag: 'deny', roles: [...expr.roles] }
    case 'and':
      return { _tag: 'and', exprs: expr.exprs.map(serializeAuthExpression) }
    case 'or':
      return { _tag: 'or', exprs: expr.exprs.map(serializeAuthExpression) }
    case 'not':
      return { _tag: 'not', expr: serializeAuthExpression(expr.expr) }
    case 'roleRef':
      return { _tag: 'roleRef', role: expr.role }
    case 'public':
      return { _tag: 'public' }
    case 'authenticated':
      return { _tag: 'authenticated' }
  }
}

/**
 * Deserialize a SerializedAuthExpression back to its typed form.
 */
export function deserializeAuthExpression(serialized: SerializedAuthExpression): AuthExpression {
  switch (serialized._tag) {
    case 'allow':
      return { _tag: 'allow', roles: serialized.roles }
    case 'deny':
      return { _tag: 'deny', roles: serialized.roles }
    case 'and':
      return { _tag: 'and', exprs: serialized.exprs.map(deserializeAuthExpression) }
    case 'or':
      return { _tag: 'or', exprs: serialized.exprs.map(deserializeAuthExpression) }
    case 'not':
      return { _tag: 'not', expr: deserializeAuthExpression(serialized.expr) }
    case 'roleRef':
      return { _tag: 'roleRef', role: serialized.role }
    case 'public':
      return { _tag: 'public' }
    case 'authenticated':
      return { _tag: 'authenticated' }
  }
}

// ─── Role Resolver Serialization ──────────────────────────────────────────────

/**
 * Serialize a RoleResolver to its JSON-serializable form.
 */
export function serializeRoleResolver(resolver: RoleResolver): SerializedRoleResolver {
  switch (resolver._tag) {
    case 'creator':
      return { _tag: 'creator' }
    case 'property':
      return { _tag: 'property', propertyName: resolver.propertyName }
    case 'relation':
      return {
        _tag: 'relation',
        relationName: resolver.relationName,
        targetRole: resolver.targetRole
      }
  }
}

/**
 * Deserialize a SerializedRoleResolver back to its typed form.
 */
export function deserializeRoleResolver(serialized: SerializedRoleResolver): RoleResolver {
  switch (serialized._tag) {
    case 'creator':
      return { _tag: 'creator' }
    case 'property':
      return { _tag: 'property', propertyName: serialized.propertyName }
    case 'relation':
      return {
        _tag: 'relation',
        relationName: serialized.relationName,
        targetRole: serialized.targetRole
      }
  }
}

// ─── Full Authorization Serialization ─────────────────────────────────────────

/**
 * Serialize an AuthorizationDefinition to its JSON-serializable form.
 */
export function serializeAuthorization(auth: AuthorizationDefinition): SerializedAuthorization {
  const serialized: SerializedAuthorization = {
    roles: {},
    actions: {}
  }

  // Serialize roles
  for (const [name, resolver] of Object.entries(auth.roles)) {
    serialized.roles[name] = serializeRoleResolver(resolver)
  }

  // Serialize actions
  for (const [name, expr] of Object.entries(auth.actions)) {
    serialized.actions[name] = serializeAuthExpression(expr)
  }

  // Copy optional fields
  if (auth.publicProps) {
    serialized.publicProps = [...auth.publicProps]
  }

  if (auth.fieldRules) {
    serialized.fieldRules = {}
    for (const [fieldName, rule] of Object.entries(auth.fieldRules)) {
      serialized.fieldRules[fieldName] = {
        allow: serializeAuthExpression(rule.allow),
        deny: rule.deny ? serializeAuthExpression(rule.deny) : undefined
      }
    }
  }

  if (auth.nodePolicy) {
    serialized.nodePolicy = {
      mode: auth.nodePolicy.mode,
      allow: [...auth.nodePolicy.allow]
    }
  }

  return serialized
}

/**
 * Deserialize a SerializedAuthorization back to its typed form.
 */
export function deserializeAuthorization(
  serialized: SerializedAuthorization
): AuthorizationDefinition {
  const auth: AuthorizationDefinition = {
    roles: {},
    actions: {}
  }

  // Deserialize roles
  for (const [name, resolver] of Object.entries(serialized.roles)) {
    auth.roles[name] = deserializeRoleResolver(resolver)
  }

  // Deserialize actions
  for (const [name, expr] of Object.entries(serialized.actions)) {
    auth.actions[name] = deserializeAuthExpression(expr)
  }

  // Copy optional fields
  if (serialized.publicProps) {
    auth.publicProps = [...serialized.publicProps]
  }

  if (serialized.fieldRules) {
    auth.fieldRules = {}
    for (const [fieldName, rule] of Object.entries(serialized.fieldRules)) {
      auth.fieldRules[fieldName] = {
        allow: deserializeAuthExpression(rule.allow),
        deny: rule.deny ? deserializeAuthExpression(rule.deny) : undefined
      }
    }
  }

  if (serialized.nodePolicy) {
    auth.nodePolicy = {
      mode: serialized.nodePolicy.mode,
      allow: serialized.nodePolicy.allow as ('deny' | 'fieldRules' | 'conditions')[]
    }
  }

  return auth
}
