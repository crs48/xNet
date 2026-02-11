import type { DefinedSchema, SchemaRegistry } from '../schema'
import type { Schema } from '../schema/types'
import type { NodeChangeEvent, NodeState } from '../store'
import type {
  AuthCheckInput,
  AuthDecision,
  AuthDenyReason,
  AuthExpression,
  AuthTrace,
  AuthTraceStep,
  DID,
  PolicyEvaluator,
  RoleResolver
} from '@xnet/core'
import { GrantIndex, isGrantActive, type GrantNode } from './grants'
import { getAuthMode } from './mode'
import { deserializeAuthorization } from './serialize'
import { extractRoleRefs } from './validate'

export interface NodeStoreReader {
  get(id: string): Promise<NodeState | null>
  list(options?: { schemaId?: string; includeDeleted?: boolean }): Promise<NodeState[]>
  subscribe(listener: (event: NodeChangeEvent) => void): () => void
}

export interface DecisionCacheOptions {
  ttlMs?: number
  maxSize?: number
  now?: () => number
}

interface DecisionCacheEntry {
  decision: AuthDecision
  expiresAt: number
}

export class DecisionCache {
  private cache = new Map<string, DecisionCacheEntry>()
  private readonly ttlMs: number
  private readonly maxSize: number
  private readonly now: () => number

  constructor(options: DecisionCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 30_000
    this.maxSize = options.maxSize ?? 10_000
    this.now = options.now ?? Date.now
  }

  get(subject: DID, action: string, nodeId: string): AuthDecision | null {
    const key = this.key(subject, action, nodeId)
    const entry = this.cache.get(key)
    if (!entry) {
      return null
    }

    if (entry.expiresAt <= this.now()) {
      this.cache.delete(key)
      return null
    }

    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.decision
  }

  set(subject: DID, action: string, nodeId: string, decision: AuthDecision): void {
    const key = this.key(subject, action, nodeId)
    this.cache.delete(key)

    this.cache.set(key, {
      decision,
      expiresAt: this.now() + this.ttlMs
    })

    if (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }
  }

  invalidateNode(nodeId: string): void {
    for (const key of this.cache.keys()) {
      if (key.endsWith(`:${nodeId}`)) {
        this.cache.delete(key)
      }
    }
  }

  invalidateSubject(did: DID): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${did}:`)) {
        this.cache.delete(key)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }

  private key(subject: DID, action: string, nodeId: string): string {
    return `${subject}:${action}:${nodeId}`
  }
}

export interface DefaultRoleResolverOptions {
  maxDepth?: number
  maxNodes?: number
}

export class DefaultRoleResolver {
  private readonly maxDepth: number
  private readonly maxNodes: number

  constructor(
    private readonly store: NodeStoreReader,
    private readonly schemaRegistry: SchemaRegistry,
    options: DefaultRoleResolverOptions = {}
  ) {
    this.maxDepth = options.maxDepth ?? 3
    this.maxNodes = options.maxNodes ?? 100
  }

  async resolveRoles(did: DID, node: NodeState, schema: Schema): Promise<Set<string>> {
    const roles = new Set<string>()
    if (!schema.authorization) {
      return roles
    }

    const auth = deserializeAuthorization(schema.authorization)
    for (const [roleName, resolver] of Object.entries(auth.roles)) {
      const visited = new Set<string>()
      const hasRole = await this.checkRole(did, resolver, node, 0, visited)
      if (hasRole) {
        roles.add(roleName)
      }
    }

    return roles
  }

  async resolveRoleMembers(resolver: RoleResolver, node: NodeState): Promise<DID[]> {
    return this.resolveRoleMembersInner(resolver, node, 0, new Set<string>())
  }

  private async resolveRoleMembersInner(
    resolver: RoleResolver,
    node: NodeState,
    depth: number,
    visited: Set<string>
  ): Promise<DID[]> {
    if (depth > this.maxDepth || visited.size >= this.maxNodes) {
      return []
    }

    const visitKey = `${node.id}:${resolver._tag}`
    if (visited.has(visitKey)) {
      return []
    }
    visited.add(visitKey)

    switch (resolver._tag) {
      case 'creator':
        return [node.createdBy]
      case 'property':
        return readDidProperty(node.properties[resolver.propertyName])
      case 'relation': {
        const relatedNodes = await this.loadRelatedNodes(node, resolver.relationName)
        if (relatedNodes.length === 0) {
          return []
        }

        const members = new Set<DID>()
        for (const relatedNode of relatedNodes) {
          const relatedSchema = await this.schemaRegistry.get(relatedNode.schemaId)
          const relatedAuth = relatedSchema?.schema.authorization
          if (!relatedAuth) {
            continue
          }

          const targetResolver = deserializeAuthorization(relatedAuth).roles[resolver.targetRole]
          if (!targetResolver) {
            continue
          }

          const targetMembers = await this.resolveRoleMembersInner(
            targetResolver,
            relatedNode,
            depth + 1,
            visited
          )
          for (const member of targetMembers) {
            members.add(member)
          }
        }

        return [...members]
      }
    }
  }

  private async checkRole(
    did: DID,
    resolver: RoleResolver,
    node: NodeState,
    depth: number,
    visited: Set<string>
  ): Promise<boolean> {
    if (depth > this.maxDepth || visited.size >= this.maxNodes) {
      return false
    }

    const visitKey = `${node.id}:${resolver._tag}:${depth}`
    if (visited.has(visitKey)) {
      return false
    }
    visited.add(visitKey)

    switch (resolver._tag) {
      case 'creator':
        return did === node.createdBy
      case 'property':
        return readDidProperty(node.properties[resolver.propertyName]).includes(did)
      case 'relation': {
        const relatedNodes = await this.loadRelatedNodes(node, resolver.relationName)
        for (const relatedNode of relatedNodes) {
          const relatedSchema = await this.schemaRegistry.get(relatedNode.schemaId)
          const relatedAuth = relatedSchema?.schema.authorization
          if (!relatedAuth) {
            continue
          }

          const targetResolver = deserializeAuthorization(relatedAuth).roles[resolver.targetRole]
          if (!targetResolver) {
            continue
          }

          const hasRole = await this.checkRole(did, targetResolver, relatedNode, depth + 1, visited)
          if (hasRole) {
            return true
          }
        }

        return false
      }
    }
  }

  private async loadRelatedNodes(node: NodeState, relationName: string): Promise<NodeState[]> {
    const value = node.properties[relationName]
    const relationIds = Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : typeof value === 'string'
        ? [value]
        : []

    const nodes: NodeState[] = []
    for (const relationId of relationIds) {
      const relatedNode = await this.store.get(relationId)
      if (relatedNode) {
        nodes.push(relatedNode)
      }
    }
    return nodes
  }
}

export function evaluateExpression(
  expr: AuthExpression,
  roles: Set<string>,
  isAuthenticated: boolean
): boolean {
  switch (expr._tag) {
    case 'allow':
      return expr.roles.some((role) => roles.has(role))
    case 'deny':
      return expr.roles.some((role) => roles.has(role))
    case 'and':
      return expr.exprs.every((entry) => evaluateExpression(entry, roles, isAuthenticated))
    case 'or':
      return expr.exprs.some((entry) => evaluateExpression(entry, roles, isAuthenticated))
    case 'not':
      return !evaluateExpression(expr.expr, roles, isAuthenticated)
    case 'roleRef':
      return roles.has(expr.role)
    case 'public':
      return true
    case 'authenticated':
      return isAuthenticated
  }
}

export interface DefaultPolicyEvaluatorOptions {
  store: NodeStoreReader
  schemaRegistry: SchemaRegistry
  grantIndex?: GrantIndex
  cache?: DecisionCache
  roleResolver?: DefaultRoleResolver
  maxDepth?: number
  maxNodes?: number
  now?: () => number
}

export class DefaultPolicyEvaluator implements PolicyEvaluator {
  private readonly grantIndex?: GrantIndex
  private readonly cache: DecisionCache
  private readonly roleResolver: DefaultRoleResolver
  private readonly now: () => number

  constructor(private readonly options: DefaultPolicyEvaluatorOptions) {
    this.grantIndex = options.grantIndex
    this.cache = options.cache ?? new DecisionCache()
    this.roleResolver =
      options.roleResolver ??
      new DefaultRoleResolver(options.store, options.schemaRegistry, {
        maxDepth: options.maxDepth,
        maxNodes: options.maxNodes
      })
    this.now = options.now ?? Date.now
  }

  async can(input: AuthCheckInput): Promise<AuthDecision> {
    const start = performance.now()

    const cached = this.cache.get(input.subject, input.action, input.nodeId)
    if (cached) {
      return {
        ...cached,
        cached: true,
        duration: performance.now() - start
      }
    }

    const node = input.node
      ? await this.loadNodeFromInput(input)
      : await this.options.store.get(input.nodeId)
    if (!node) {
      return this.deny(input, ['DENY_NOT_AUTHENTICATED'], start)
    }

    const schema = await this.options.schemaRegistry.get(node.schemaId)
    if (!schema) {
      return this.deny(input, ['DENY_NOT_AUTHENTICATED'], start)
    }

    const mode = getAuthMode(schema.schema)
    if (mode === 'legacy') {
      const allowed = node.createdBy === input.subject
      const decision = this.decision(input, allowed, allowed ? ['owner'] : [], start)
      this.cache.set(input.subject, input.action, input.nodeId, decision)
      return decision
    }

    if (!schema.schema.authorization) {
      return this.deny(input, ['DENY_NO_ROLE_MATCH'], start)
    }

    const auth = deserializeAuthorization(schema.schema.authorization)
    const roles = await this.roleResolver.resolveRoles(input.subject, node, schema.schema)

    const fieldRuleDenied = this.checkFieldRules(input, auth.fieldRules, roles)
    if (fieldRuleDenied) {
      return this.deny(input, ['DENY_FIELD_RESTRICTED'], start, [...roles])
    }

    const actionExpr = auth.actions[input.action]
    if (!actionExpr) {
      return this.deny(input, ['DENY_NO_ROLE_MATCH'], start, [...roles])
    }

    if (actionExpr._tag === 'deny' && evaluateExpression(actionExpr, roles, true)) {
      return this.deny(input, ['DENY_NODE_POLICY'], start, [...roles])
    }

    const allowedByRole = evaluateExpression(actionExpr, roles, true)
    if (allowedByRole) {
      const decision = this.decision(input, true, [...roles], start)
      this.cache.set(input.subject, input.action, input.nodeId, decision)
      return decision
    }

    const grant = this.findMatchingGrant(
      input,
      this.grantIndex?.findGrants(input.nodeId, input.subject) ?? []
    )
    if (grant) {
      const decision = this.decision(input, true, [...roles], start, [grant.id])
      this.cache.set(input.subject, input.action, input.nodeId, decision)
      return decision
    }

    const reasons: AuthDenyReason[] =
      roles.size > 0 ? ['DENY_NO_ROLE_MATCH'] : ['DENY_NO_ROLE_MATCH', 'DENY_NO_GRANT']
    return this.deny(input, reasons, start, [...roles])
  }

  async explain(input: AuthCheckInput): Promise<AuthTrace> {
    const steps: AuthTraceStep[] = []
    const start = performance.now()

    const nodeStart = performance.now()
    const node = input.node
      ? await this.loadNodeFromInput(input)
      : await this.options.store.get(input.nodeId)
    steps.push({
      phase: 'node-deny',
      input: { nodeId: input.nodeId },
      output: { nodeFound: Boolean(node) },
      duration: performance.now() - nodeStart
    })

    let roles = new Set<string>()
    let actionExpr: AuthExpression | undefined

    if (node) {
      const schema = await this.options.schemaRegistry.get(node.schemaId)
      if (schema?.schema.authorization) {
        const roleStart = performance.now()
        roles = await this.roleResolver.resolveRoles(input.subject, node, schema.schema)
        steps.push({
          phase: 'role-resolve',
          input: { subject: input.subject, nodeId: node.id },
          output: { roles: [...roles] },
          duration: performance.now() - roleStart
        })

        const auth = deserializeAuthorization(schema.schema.authorization)
        actionExpr = auth.actions[input.action]

        const evalStart = performance.now()
        const requiredRoles = actionExpr ? extractRoleRefs(actionExpr) : []
        const allowed = actionExpr ? evaluateExpression(actionExpr, roles, true) : false
        steps.push({
          phase: 'schema-eval',
          input: {
            action: input.action,
            requiredRoles
          },
          output: {
            allowed,
            userRoles: [...roles]
          },
          duration: performance.now() - evalStart
        })

        const grantStart = performance.now()
        const grants = this.grantIndex?.findGrants(input.nodeId, input.subject) ?? []
        steps.push({
          phase: 'grant-check',
          input: {
            subject: input.subject,
            action: input.action,
            nodeId: input.nodeId
          },
          output: {
            grantCount: grants.length,
            grantIds: grants.map((grant) => grant.id)
          },
          duration: performance.now() - grantStart
        })
      }
    }

    const decision = await this.can(input)
    return {
      ...decision,
      steps,
      duration: performance.now() - start
    }
  }

  invalidate(nodeId: string): void {
    this.cache.invalidateNode(nodeId)
  }

  invalidateSubject(did: DID): void {
    this.cache.invalidateSubject(did)
  }

  private findMatchingGrant(input: AuthCheckInput, grants: GrantNode[]): GrantNode | null {
    const now = this.now()
    for (const grant of grants) {
      if (!isGrantActive(grant, now)) {
        continue
      }

      const actions = parseActions(grant.properties.actions)
      if (actions.includes(input.action)) {
        return grant
      }
    }

    return null
  }

  private checkFieldRules(
    input: AuthCheckInput,
    fieldRules: Record<string, { allow: AuthExpression; deny?: AuthExpression }> | undefined,
    roles: Set<string>
  ): boolean {
    if (input.action !== 'write' || !input.patch || !fieldRules) {
      return false
    }

    for (const fieldName of Object.keys(input.patch)) {
      const fieldRule = fieldRules[fieldName]
      if (!fieldRule) {
        continue
      }

      const denied = fieldRule.deny ? evaluateExpression(fieldRule.deny, roles, true) : false
      const allowed = evaluateExpression(fieldRule.allow, roles, true)
      if (denied || !allowed) {
        return true
      }
    }

    return false
  }

  private decision(
    input: AuthCheckInput,
    allowed: boolean,
    roles: string[],
    start: number,
    grants: string[] = []
  ): AuthDecision {
    return {
      allowed,
      action: input.action,
      subject: input.subject,
      resource: input.nodeId,
      roles,
      grants,
      reasons: [],
      cached: false,
      evaluatedAt: this.now(),
      duration: performance.now() - start
    }
  }

  private deny(
    input: AuthCheckInput,
    reasons: AuthDenyReason[],
    start: number,
    roles: string[] = []
  ): AuthDecision {
    return {
      allowed: false,
      action: input.action,
      subject: input.subject,
      resource: input.nodeId,
      roles,
      grants: [],
      reasons,
      cached: false,
      evaluatedAt: this.now(),
      duration: performance.now() - start
    }
  }

  private async loadNodeFromInput(input: AuthCheckInput): Promise<NodeState | null> {
    if (!input.node) {
      return this.options.store.get(input.nodeId)
    }

    const existing = await this.options.store.get(input.nodeId)
    if (existing) {
      return existing
    }

    return {
      id: input.nodeId,
      schemaId: input.node.schemaId,
      properties: input.node.properties ?? {},
      timestamps: {},
      deleted: false,
      createdAt: this.now(),
      createdBy: input.node.createdBy,
      updatedAt: this.now(),
      updatedBy: input.node.createdBy
    }
  }
}

function readDidProperty(value: unknown): DID[] {
  if (Array.isArray(value)) {
    return value.filter(isDid)
  }

  if (isDid(value)) {
    return [value]
  }

  return []
}

function isDid(value: unknown): value is DID {
  return typeof value === 'string' && value.startsWith('did:key:')
}

function parseActions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string')
  }

  if (typeof value !== 'string') {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}

export async function createPolicyEvaluator(options: {
  store: NodeStoreReader
  schemaRegistry: SchemaRegistry
  grantSchemaId?: string
  cache?: DecisionCache
  maxDepth?: number
  maxNodes?: number
}): Promise<DefaultPolicyEvaluator> {
  const grantIndex = new GrantIndex(options.store, {
    schemaId: options.grantSchemaId
  })
  await grantIndex.initialize()

  return new DefaultPolicyEvaluator({
    store: options.store,
    schemaRegistry: options.schemaRegistry,
    grantIndex,
    cache: options.cache,
    maxDepth: options.maxDepth,
    maxNodes: options.maxNodes
  })
}

export type SchemaRegistryReader = Pick<SchemaRegistry, 'get'>
export type DefinedSchemaLike = DefinedSchema
