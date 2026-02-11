/**
 * Authorization types for xNet's encryption-first authorization system.
 *
 * These types form the foundation of the authorization model where
 * "the ability to decrypt" IS access control.
 */

/**
 * DID - Decentralized Identifier for user identity.
 * Redeclared here to avoid circular imports.
 */
export type DID = `did:key:${string}`

/**
 * Schema IRI - globally unique identifier for a schema.
 */
export type SchemaIRI = `xnet://${string}/${string}`

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Canonical authorization actions.
 * All action checks map to one of these values.
 */
export const AUTH_ACTIONS = ['read', 'write', 'delete', 'share', 'admin'] as const

/**
 * An authorization action that can be checked or granted.
 */
export type AuthAction = (typeof AUTH_ACTIONS)[number]

/**
 * Alias for backward compatibility with existing Capability type.
 * @deprecated Use AuthAction instead
 */
export type Capability = AuthAction

// ─── Decision ─────────────────────────────────────────────────────────────────

/**
 * The result of an authorization check.
 * Contains whether access is allowed plus diagnostic info for debugging.
 */
export interface AuthDecision {
  /** Whether the action is permitted */
  allowed: boolean
  /** The action that was checked */
  action: AuthAction
  /** The DID of the subject requesting access */
  subject: DID
  /** The resource (node ID) being accessed */
  resource: string
  /** Roles the subject holds that contributed to the decision */
  roles: string[]
  /** Grant IDs that contributed to allowing access */
  grants: string[]
  /** If denied, the reasons why */
  reasons: AuthDenyReason[]
  /** Whether this result came from cache */
  cached: boolean
  /** Timestamp when the decision was evaluated */
  evaluatedAt: number
  /** How long the evaluation took in milliseconds */
  duration: number
}

/**
 * Reason codes for authorization denial.
 * Used for debugging and user-friendly error messages.
 */
export type AuthDenyReason =
  | 'DENY_NODE_POLICY' // Node-level deny rule matched
  | 'DENY_NO_ROLE_MATCH' // User lacks required role
  | 'DENY_NO_GRANT' // No grant authorizes the action
  | 'DENY_UCAN_INVALID' // UCAN token is malformed
  | 'DENY_UCAN_REVOKED' // UCAN token has been revoked
  | 'DENY_UCAN_EXPIRED' // UCAN token has expired
  | 'DENY_DEPTH_EXCEEDED' // Delegation chain too deep
  | 'DENY_NOT_AUTHENTICATED' // Subject is not authenticated
  | 'DENY_FIELD_RESTRICTED' // Field-level write restriction
  | 'DENY_GRANT_EXPIRED' // Grant has expired
  | 'DENY_STALE_OFFLINE' // Offline cache too stale to use

// ─── Trace ────────────────────────────────────────────────────────────────────

/**
 * Extended decision with step-by-step evaluation trace.
 * Used by the explain() API for debugging and AI agent validation.
 */
export interface AuthTrace extends AuthDecision {
  /** Each step in the evaluation pipeline */
  steps: AuthTraceStep[]
}

/**
 * A single step in the authorization evaluation pipeline.
 */
export interface AuthTraceStep {
  /** Which phase of evaluation this step represents */
  phase: 'node-deny' | 'role-resolve' | 'schema-eval' | 'grant-check' | 'public-check'
  /** Inputs to this evaluation step */
  input: Record<string, unknown>
  /** Outputs from this evaluation step */
  output: Record<string, unknown>
  /** How long this step took in milliseconds */
  duration: number
}

// ─── Schema Authorization Definition ──────────────────────────────────────────

/**
 * Authorization rules defined in a schema.
 *
 * @example
 * ```typescript
 * authorization: {
 *   roles: {
 *     owner: role.creator(),
 *     editor: role.property('editors'),
 *     admin: role.relation('project', 'admin')
 *   },
 *   actions: {
 *     read: allow('editor', 'admin', 'owner'),
 *     write: allow('editor', 'admin', 'owner'),
 *     delete: allow('admin', 'owner'),
 *     share: allow('admin', 'owner')
 *   },
 *   publicProps: ['title']
 * }
 * ```
 */
export interface AuthorizationDefinition<
  TActions extends Record<string, AuthExpression> = Record<string, AuthExpression>,
  TRoles extends Record<string, RoleResolver> = Record<string, RoleResolver>
> {
  /** Role definitions - how to determine if a user holds each role */
  roles: TRoles
  /** Action expressions - which roles can perform each action */
  actions: TActions
  /** Properties that are publicly readable even for private nodes */
  publicProps?: string[]
  /** Field-level access rules */
  fieldRules?: Record<string, { allow: AuthExpression; deny?: AuthExpression }>
  /** How node-level policy interacts with schema policy */
  nodePolicy?: { mode: 'extend'; allow: ('deny' | 'fieldRules' | 'conditions')[] }
}

/**
 * Serialized form of AuthorizationDefinition for storage in Schema.
 */
export interface SerializedAuthorization {
  roles: Record<string, SerializedRoleResolver>
  actions: Record<string, SerializedAuthExpression>
  publicProps?: string[]
  fieldRules?: Record<string, { allow: SerializedAuthExpression; deny?: SerializedAuthExpression }>
  nodePolicy?: { mode: 'extend'; allow: string[] }
}

// ─── Type Utilities ───────────────────────────────────────────────────────────

/**
 * Extract action keys from an AuthorizationDefinition.
 */
export type ActionKey<TAuth extends AuthorizationDefinition> = keyof TAuth['actions'] & string

/**
 * Extract role keys from an AuthorizationDefinition.
 */
export type RoleKey<TAuth extends AuthorizationDefinition> = keyof TAuth['roles'] & string

/**
 * Extract the action type from a schema with authorization.
 */
export type SchemaAction<S extends { authorization: AuthorizationDefinition }> = ActionKey<
  S['authorization']
>

// ─── Auth Expression AST ──────────────────────────────────────────────────────

/**
 * Authorization expression AST node.
 * Evaluated against a set of roles to determine access.
 */
export type AuthExpression =
  | AllowExpr
  | DenyExpr
  | AndExpr
  | OrExpr
  | NotExpr
  | RoleRefExpr
  | PublicExpr
  | AuthenticatedExpr

/**
 * Serialized form of AuthExpression for JSON storage.
 */
export type SerializedAuthExpression =
  | { _tag: 'allow'; roles: string[] }
  | { _tag: 'deny'; roles: string[] }
  | { _tag: 'and'; exprs: SerializedAuthExpression[] }
  | { _tag: 'or'; exprs: SerializedAuthExpression[] }
  | { _tag: 'not'; expr: SerializedAuthExpression }
  | { _tag: 'roleRef'; role: string }
  | { _tag: 'public' }
  | { _tag: 'authenticated' }

/**
 * Allow access if the subject has any of the specified roles.
 */
export interface AllowExpr {
  readonly _tag: 'allow'
  readonly roles: readonly string[]
}

/**
 * Deny access if the subject has any of the specified roles.
 * Deny always takes precedence over allow.
 */
export interface DenyExpr {
  readonly _tag: 'deny'
  readonly roles: readonly string[]
}

/**
 * Logical AND - all sub-expressions must be true.
 */
export interface AndExpr {
  readonly _tag: 'and'
  readonly exprs: readonly AuthExpression[]
}

/**
 * Logical OR - any sub-expression must be true.
 */
export interface OrExpr {
  readonly _tag: 'or'
  readonly exprs: readonly AuthExpression[]
}

/**
 * Logical NOT - negate the sub-expression.
 */
export interface NotExpr {
  readonly _tag: 'not'
  readonly expr: AuthExpression
}

/**
 * Reference to a named role.
 */
export interface RoleRefExpr {
  readonly _tag: 'roleRef'
  readonly role: string
}

/**
 * Public access - always allows access.
 */
export interface PublicExpr {
  readonly _tag: 'public'
}

/**
 * Authenticated access - allows any authenticated user.
 */
export interface AuthenticatedExpr {
  readonly _tag: 'authenticated'
}

// ─── Role Resolvers ───────────────────────────────────────────────────────────

/**
 * How to determine if a user holds a role.
 */
export type RoleResolver = CreatorRoleResolver | PropertyRoleResolver | RelationRoleResolver

/**
 * Serialized form of RoleResolver for JSON storage.
 */
export type SerializedRoleResolver =
  | { _tag: 'creator' }
  | { _tag: 'property'; propertyName: string }
  | { _tag: 'relation'; relationName: string; targetRole: string }

/**
 * Role held by the node's creator.
 */
export interface CreatorRoleResolver {
  readonly _tag: 'creator'
}

/**
 * Role determined by a person property on the node.
 * The DID(s) in that property hold this role.
 */
export interface PropertyRoleResolver {
  readonly _tag: 'property'
  readonly propertyName: string
}

/**
 * Role inherited from a related node.
 * Users who hold `targetRole` on the related node hold this role.
 */
export interface RelationRoleResolver {
  readonly _tag: 'relation'
  readonly relationName: string
  readonly targetRole: string
}

// ─── Check Input ──────────────────────────────────────────────────────────────

/**
 * Input for an authorization check.
 */
export interface AuthCheckInput {
  /** The DID of the subject requesting access */
  subject: DID
  /** The action being requested */
  action: AuthAction
  /** The node being accessed */
  nodeId: string
  /** Pre-loaded node to avoid re-fetching (optional) */
  node?: { schemaId: SchemaIRI; createdBy: DID; properties?: Record<string, unknown> }
  /** Patch for field-level checks on update (optional) */
  patch?: Record<string, unknown>
}

// ─── Policy Evaluator Interface ───────────────────────────────────────────────

/**
 * Interface for evaluating authorization policies.
 * Supersedes the older PermissionEvaluator interface.
 */
export interface PolicyEvaluator {
  /** Check if subject can perform action on resource */
  can(input: AuthCheckInput): Promise<AuthDecision>

  /** Check with full trace for debugging */
  explain(input: AuthCheckInput): Promise<AuthTrace>

  /** Invalidate cached decisions for a resource */
  invalidate(nodeId: string): void

  /** Invalidate all cached decisions for a subject */
  invalidateSubject(did: DID): void
}
