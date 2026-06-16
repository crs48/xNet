/**
 * Permission-matrix reflection.
 *
 * Turns a schema's `authorization` definition into a role × action matrix for
 * display — the data behind a "who can do what" panel (e.g. a Permissions tab
 * in the share dialog). This is a *structural summary* of the policy, not an
 * evaluator: it reports which roles each action references and whether the
 * action is public / authenticated. Actual per-subject decisions still come
 * from the policy evaluator; per-member resolution (who holds each role) is a
 * separate, store-backed step (see `computeRecipients`).
 */

import type {
  AuthAction,
  SerializedAuthExpression,
  SerializedAuthorization,
  SerializedRoleResolver
} from '@xnetjs/core'
import { AUTH_ACTIONS } from '@xnetjs/core'

/** How an action's expression resolves, summarized for display. */
export interface ActionPermission {
  action: string
  /** Roles that grant this action (allow / bare role refs, negation-aware). */
  roles: string[]
  /** Roles explicitly denied (deny takes precedence at evaluation time). */
  denied: string[]
  /** Anyone, including anonymous, is allowed. */
  public: boolean
  /** Any authenticated user is allowed. */
  authenticated: boolean
}

/** A role and a human-readable description of how a subject comes to hold it. */
export interface RoleSummary {
  role: string
  /** Resolver kind: creator | property | relation | membership */
  kind: SerializedRoleResolver['_tag']
  /** Human-readable provenance (e.g. "Inherited from space", "Node creator"). */
  provenance: string
}

export interface PermissionMatrix {
  /** All roles declared on the schema, with provenance. */
  roles: RoleSummary[]
  /** One entry per action the schema defines (in canonical order). */
  actions: ActionPermission[]
}

interface Collected {
  allow: Set<string>
  deny: Set<string>
  public: boolean
  authenticated: boolean
}

/**
 * Walk a serialized expression, accumulating allow/deny roles and
 * public/authenticated flags. `polarity` is true in a positive position and
 * flips under `not` (so `not(allow(x))` reads as denying `x`).
 */
function collect(expr: SerializedAuthExpression, polarity: boolean, acc: Collected): void {
  switch (expr._tag) {
    case 'allow':
      for (const role of expr.roles) (polarity ? acc.allow : acc.deny).add(role)
      return
    case 'roleRef':
      ;(polarity ? acc.allow : acc.deny).add(expr.role)
      return
    case 'deny':
      for (const role of expr.roles) (polarity ? acc.deny : acc.allow).add(role)
      return
    case 'public':
      if (polarity) acc.public = true
      return
    case 'authenticated':
      if (polarity) acc.authenticated = true
      return
    case 'and':
    case 'or':
      for (const sub of expr.exprs) collect(sub, polarity, acc)
      return
    case 'not':
      collect(expr.expr, !polarity, acc)
      return
  }
}

function summarizeAction(
  action: string,
  expr: SerializedAuthExpression | undefined
): ActionPermission {
  const acc: Collected = { allow: new Set(), deny: new Set(), public: false, authenticated: false }
  if (expr) collect(expr, true, acc)
  return {
    action,
    roles: [...acc.allow],
    denied: [...acc.deny],
    public: acc.public,
    authenticated: acc.authenticated
  }
}

/** Human-readable description of how a subject comes to hold a role. */
export function describeRoleResolver(resolver: SerializedRoleResolver): string {
  switch (resolver._tag) {
    case 'creator':
      return 'Node creator'
    case 'property':
      return `Listed in "${resolver.propertyName}"`
    case 'relation':
      return `Inherited from "${resolver.relationName}" (as ${resolver.targetRole})`
    case 'membership':
      return `Member of "${resolver.containerProp}" (≥ ${resolver.minRole})`
  }
}

/**
 * Build the role × action matrix for a schema's authorization. Returns an
 * empty matrix (no roles, every action public) when the schema has no
 * authorization — an unauthorized schema is open by construction.
 */
export function buildPermissionMatrix(
  authorization: SerializedAuthorization | undefined
): PermissionMatrix {
  if (!authorization) {
    return {
      roles: [],
      actions: AUTH_ACTIONS.map((action) => ({
        action,
        roles: [],
        denied: [],
        public: true,
        authenticated: false
      }))
    }
  }

  const roles: RoleSummary[] = Object.entries(authorization.roles).map(([role, resolver]) => ({
    role,
    kind: resolver._tag,
    provenance: describeRoleResolver(resolver)
  }))

  // Emit canonical actions first (stable order), then any custom actions.
  const actionKeys: string[] = [
    ...AUTH_ACTIONS.filter((action) => action in authorization.actions),
    ...Object.keys(authorization.actions).filter(
      (action) => !(AUTH_ACTIONS as readonly string[]).includes(action)
    )
  ]

  return {
    roles,
    actions: actionKeys.map((action) => summarizeAction(action, authorization.actions[action]))
  }
}

export type { AuthAction }
