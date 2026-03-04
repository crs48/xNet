# 10: Enterprise Features

> SSO, audit logging, RBAC, and multi-tenant isolation

**Package:** `@xnetjs/enterprise`
**Dependencies:** `@xnetjs/identity`, `@xnetjs/modules`, `@xnetjs/data`
**Estimated Time:** 3 weeks

> **Architecture Update (Jan 2026):**
>
> - `@xnetjs/database` → `@xnetjs/data`
> - Audit logs stored as Nodes with AuditEntry schema
> - RBAC permissions apply to Node operations

## Goals

- SAML and OIDC Single Sign-On
- Comprehensive audit logging
- Role-based access control (RBAC)
- Multi-tenant workspace isolation
- Compliance features (GDPR, SOC2)

## Core Types

```typescript
// packages/enterprise/src/types.ts

// SSO Configuration
export interface SSOConfig {
  id: string
  name: string
  type: 'saml' | 'oidc'
  enabled: boolean

  // SAML
  saml?: {
    entryPoint: string
    issuer: string
    cert: string
    privateKey?: string
    signatureAlgorithm: 'sha256' | 'sha512'
    identifierFormat: string
  }

  // OIDC
  oidc?: {
    issuer: string
    clientId: string
    clientSecret: string
    authorizationUrl: string
    tokenUrl: string
    userInfoUrl: string
    scopes: string[]
  }

  // Attribute mapping
  attributeMapping: {
    email: string
    name: string
    firstName?: string
    lastName?: string
    groups?: string
    department?: string
  }

  // Auto-provisioning
  autoProvision: boolean
  defaultRole?: string
  groupMapping?: Record<string, string[]> // IDP group -> xNet roles
}

// Audit Log
export interface AuditEvent {
  id: string
  timestamp: number
  workspaceId: string

  // Actor
  actor: {
    type: 'user' | 'system' | 'api'
    id: string
    name?: string
    ip?: string
    userAgent?: string
  }

  // Action
  action: AuditAction
  resource: {
    type: string
    id: string
    name?: string
  }

  // Details
  details: Record<string, unknown>
  changes?: {
    before: Record<string, unknown>
    after: Record<string, unknown>
  }

  // Result
  outcome: 'success' | 'failure'
  errorMessage?: string
}

export type AuditAction =
  // Authentication
  | 'auth.login'
  | 'auth.logout'
  | 'auth.login_failed'
  | 'auth.sso_login'
  | 'auth.password_changed'
  | 'auth.mfa_enabled'
  | 'auth.mfa_disabled'

  // Users
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'user.role_changed'
  | 'user.suspended'
  | 'user.activated'

  // Data
  | 'record.created'
  | 'record.updated'
  | 'record.deleted'
  | 'record.viewed'
  | 'record.exported'

  // Workflows
  | 'workflow.created'
  | 'workflow.executed'
  | 'workflow.failed'

  // Admin
  | 'settings.changed'
  | 'sso.configured'
  | 'api_key.created'
  | 'api_key.revoked'
  | 'webhook.created'
  | 'webhook.deleted'

// RBAC
export interface Role {
  id: string
  name: string
  description: string
  permissions: Permission[]
  isSystem: boolean // Cannot be deleted
  createdAt: number
}

export interface Permission {
  resource: string // e.g., 'database', 'workflow', 'user'
  action: string // e.g., 'read', 'write', 'delete', 'manage'
  scope?: string // e.g., 'own', 'team', 'workspace'
  conditions?: PermissionCondition[]
}

export interface PermissionCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'in' | 'not_in'
  value: unknown
}

// Multi-tenancy
export interface Tenant {
  id: string
  name: string
  domain?: string
  settings: TenantSettings
  subscription: {
    plan: 'free' | 'pro' | 'enterprise'
    seats: number
    expiresAt?: number
  }
  createdAt: number
}

export interface TenantSettings {
  sso?: SSOConfig[]
  security: {
    mfaRequired: boolean
    passwordPolicy: PasswordPolicy
    sessionTimeout: number // Minutes
    allowedIPs?: string[]
  }
  features: {
    auditLog: boolean
    advancedRBAC: boolean
    customBranding: boolean
    apiAccess: boolean
  }
  branding?: {
    logo?: string
    primaryColor?: string
    name?: string
  }
}

export interface PasswordPolicy {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSpecial: boolean
  maxAge?: number // Days
  preventReuse?: number // Number of previous passwords
}
```

## SSO Service

```typescript
// packages/enterprise/src/sso/SSOService.ts

import { SAML } from '@node-saml/node-saml'

export class SSOService {
  private samlStrategies = new Map<string, SAML>()

  constructor(private tenantService: TenantService) {}

  // Initialize SSO for tenant
  async initializeTenant(tenantId: string): Promise<void> {
    const tenant = await this.tenantService.getTenant(tenantId)
    const ssoConfigs = tenant.settings.sso || []

    for (const config of ssoConfigs) {
      if (config.type === 'saml' && config.enabled && config.saml) {
        const saml = new SAML({
          entryPoint: config.saml.entryPoint,
          issuer: config.saml.issuer,
          cert: config.saml.cert,
          privateKey: config.saml.privateKey,
          signatureAlgorithm: config.saml.signatureAlgorithm,
          identifierFormat: config.saml.identifierFormat,
          callbackUrl: this.getCallbackUrl(tenantId, config.id)
        })
        this.samlStrategies.set(`${tenantId}:${config.id}`, saml)
      }
    }
  }

  // Generate SAML login URL
  async getSAMLLoginUrl(tenantId: string, configId: string): Promise<string> {
    const saml = this.samlStrategies.get(`${tenantId}:${configId}`)
    if (!saml) {
      throw new Error('SAML not configured')
    }

    return saml.getAuthorizeUrlAsync('', {})
  }

  // Handle SAML response
  async handleSAMLResponse(
    tenantId: string,
    configId: string,
    samlResponse: string
  ): Promise<SSOUser> {
    const saml = this.samlStrategies.get(`${tenantId}:${configId}`)
    if (!saml) {
      throw new Error('SAML not configured')
    }

    const tenant = await this.tenantService.getTenant(tenantId)
    const config = tenant.settings.sso?.find((s) => s.id === configId)
    if (!config) {
      throw new Error('SSO config not found')
    }

    const { profile } = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse })

    // Map attributes
    const user: SSOUser = {
      email: this.getAttribute(profile, config.attributeMapping.email),
      name: this.getAttribute(profile, config.attributeMapping.name),
      firstName: config.attributeMapping.firstName
        ? this.getAttribute(profile, config.attributeMapping.firstName)
        : undefined,
      lastName: config.attributeMapping.lastName
        ? this.getAttribute(profile, config.attributeMapping.lastName)
        : undefined,
      groups: config.attributeMapping.groups
        ? this.getArrayAttribute(profile, config.attributeMapping.groups)
        : undefined
    }

    // Auto-provision user if enabled
    if (config.autoProvision) {
      await this.provisionUser(tenantId, config, user)
    }

    return user
  }

  // OIDC login
  async getOIDCLoginUrl(tenantId: string, configId: string, state: string): Promise<string> {
    const tenant = await this.tenantService.getTenant(tenantId)
    const config = tenant.settings.sso?.find((s) => s.id === configId)

    if (!config?.oidc) {
      throw new Error('OIDC not configured')
    }

    const params = new URLSearchParams({
      client_id: config.oidc.clientId,
      redirect_uri: this.getCallbackUrl(tenantId, configId),
      response_type: 'code',
      scope: config.oidc.scopes.join(' '),
      state
    })

    return `${config.oidc.authorizationUrl}?${params}`
  }

  // Handle OIDC callback
  async handleOIDCCallback(tenantId: string, configId: string, code: string): Promise<SSOUser> {
    const tenant = await this.tenantService.getTenant(tenantId)
    const config = tenant.settings.sso?.find((s) => s.id === configId)

    if (!config?.oidc) {
      throw new Error('OIDC not configured')
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(config.oidc.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.oidc.clientId,
        client_secret: config.oidc.clientSecret,
        redirect_uri: this.getCallbackUrl(tenantId, configId)
      })
    })

    const tokens = await tokenResponse.json()

    // Get user info
    const userInfoResponse = await fetch(config.oidc.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    })

    const userInfo = await userInfoResponse.json()

    const user: SSOUser = {
      email: userInfo[config.attributeMapping.email] || userInfo.email,
      name: userInfo[config.attributeMapping.name] || userInfo.name,
      groups: userInfo[config.attributeMapping.groups || 'groups']
    }

    if (config.autoProvision) {
      await this.provisionUser(tenantId, config, user)
    }

    return user
  }

  // Auto-provision user from SSO
  private async provisionUser(
    tenantId: string,
    config: SSOConfig,
    ssoUser: SSOUser
  ): Promise<void> {
    const existingUser = await this.userService.findByEmail(tenantId, ssoUser.email)

    if (existingUser) {
      // Update existing user
      await this.userService.update(existingUser.id, {
        name: ssoUser.name,
        ssoProvider: config.id,
        lastSsoLogin: Date.now()
      })
    } else {
      // Create new user
      const roles = this.mapGroupsToRoles(ssoUser.groups, config.groupMapping)

      await this.userService.create({
        tenantId,
        email: ssoUser.email,
        name: ssoUser.name || ssoUser.email,
        roles: roles.length > 0 ? roles : [config.defaultRole || 'member'],
        ssoProvider: config.id,
        ssoOnly: true
      })
    }
  }

  private mapGroupsToRoles(
    groups: string[] | undefined,
    mapping: Record<string, string[]> | undefined
  ): string[] {
    if (!groups || !mapping) return []

    const roles = new Set<string>()
    for (const group of groups) {
      const mappedRoles = mapping[group]
      if (mappedRoles) {
        mappedRoles.forEach((r) => roles.add(r))
      }
    }
    return Array.from(roles)
  }

  private getCallbackUrl(tenantId: string, configId: string): string {
    return `${process.env.APP_URL}/sso/callback/${tenantId}/${configId}`
  }

  private getAttribute(profile: Record<string, unknown>, path: string): string {
    return (profile[path] as string) || ''
  }

  private getArrayAttribute(profile: Record<string, unknown>, path: string): string[] {
    const value = profile[path]
    if (Array.isArray(value)) return value
    if (typeof value === 'string') return [value]
    return []
  }
}

interface SSOUser {
  email: string
  name?: string
  firstName?: string
  lastName?: string
  groups?: string[]
}
```

## Audit Service

```typescript
// packages/enterprise/src/audit/AuditService.ts

export class AuditService {
  private buffer: AuditEvent[] = []
  private flushInterval: NodeJS.Timeout

  constructor(
    private databaseManager: DatabaseManager,
    private config: {
      bufferSize: number
      flushIntervalMs: number
    } = { bufferSize: 100, flushIntervalMs: 5000 }
  ) {
    // Periodic flush
    this.flushInterval = setInterval(() => this.flush(), this.config.flushIntervalMs)
  }

  // Log an audit event
  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEvent: AuditEvent = {
      id: generateId(),
      timestamp: Date.now(),
      ...event
    }

    this.buffer.push(auditEvent)

    // Flush if buffer is full
    if (this.buffer.length >= this.config.bufferSize) {
      await this.flush()
    }
  }

  // Convenience methods
  async logAuth(params: {
    workspaceId: string
    action: 'login' | 'logout' | 'login_failed' | 'sso_login'
    userId?: string
    email?: string
    ip?: string
    userAgent?: string
    outcome: 'success' | 'failure'
    errorMessage?: string
  }): Promise<void> {
    await this.log({
      workspaceId: params.workspaceId,
      actor: {
        type: 'user',
        id: params.userId || 'anonymous',
        name: params.email,
        ip: params.ip,
        userAgent: params.userAgent
      },
      action: `auth.${params.action}` as AuditAction,
      resource: {
        type: 'session',
        id: params.userId || 'anonymous'
      },
      details: {
        email: params.email
      },
      outcome: params.outcome,
      errorMessage: params.errorMessage
    })
  }

  async logDataAccess(params: {
    workspaceId: string
    userId: string
    action: 'created' | 'updated' | 'deleted' | 'viewed' | 'exported'
    resourceType: string
    resourceId: string
    resourceName?: string
    changes?: { before: Record<string, unknown>; after: Record<string, unknown> }
  }): Promise<void> {
    await this.log({
      workspaceId: params.workspaceId,
      actor: {
        type: 'user',
        id: params.userId
      },
      action: `record.${params.action}` as AuditAction,
      resource: {
        type: params.resourceType,
        id: params.resourceId,
        name: params.resourceName
      },
      details: {},
      changes: params.changes,
      outcome: 'success'
    })
  }

  // Query audit logs
  async query(params: {
    workspaceId: string
    filters?: {
      startDate?: number
      endDate?: number
      actions?: AuditAction[]
      actorId?: string
      resourceType?: string
      resourceId?: string
      outcome?: 'success' | 'failure'
    }
    pagination?: {
      limit: number
      offset: number
    }
  }): Promise<{
    events: AuditEvent[]
    total: number
  }> {
    const db = await this.databaseManager.getDatabase('audit_logs')
    let query = db
      .query()
      .filter({ property: 'workspaceId', operator: 'equals', value: params.workspaceId })

    if (params.filters) {
      if (params.filters.startDate) {
        query = query.filter({
          property: 'timestamp',
          operator: 'is_after',
          value: params.filters.startDate
        })
      }
      if (params.filters.endDate) {
        query = query.filter({
          property: 'timestamp',
          operator: 'is_before',
          value: params.filters.endDate
        })
      }
      if (params.filters.actions) {
        query = query.filter({
          property: 'action',
          operator: 'in',
          value: params.filters.actions
        })
      }
      if (params.filters.actorId) {
        query = query.filter({
          property: 'actor.id',
          operator: 'equals',
          value: params.filters.actorId
        })
      }
      if (params.filters.resourceType) {
        query = query.filter({
          property: 'resource.type',
          operator: 'equals',
          value: params.filters.resourceType
        })
      }
      if (params.filters.outcome) {
        query = query.filter({
          property: 'outcome',
          operator: 'equals',
          value: params.filters.outcome
        })
      }
    }

    query = query.sort('timestamp', 'desc')

    if (params.pagination) {
      query = query.limit(params.pagination.limit).offset(params.pagination.offset)
    }

    const result = await query.execute()
    return {
      events: result.records as AuditEvent[],
      total: result.totalCount
    }
  }

  // Export audit logs
  async export(params: {
    workspaceId: string
    startDate: number
    endDate: number
    format: 'json' | 'csv'
  }): Promise<Blob> {
    const { events } = await this.query({
      workspaceId: params.workspaceId,
      filters: {
        startDate: params.startDate,
        endDate: params.endDate
      }
    })

    if (params.format === 'csv') {
      return this.toCSV(events)
    }
    return new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' })
  }

  // Flush buffer to database
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return

    const events = [...this.buffer]
    this.buffer = []

    const db = await this.databaseManager.getDatabase('audit_logs')
    await db.createRecords(events)
  }

  private toCSV(events: AuditEvent[]): Blob {
    const headers = [
      'timestamp',
      'action',
      'actor_id',
      'actor_type',
      'resource_type',
      'resource_id',
      'outcome'
    ]
    const rows = events.map((e) => [
      new Date(e.timestamp).toISOString(),
      e.action,
      e.actor.id,
      e.actor.type,
      e.resource.type,
      e.resource.id,
      e.outcome
    ])

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n')
    return new Blob([csv], { type: 'text/csv' })
  }

  destroy(): void {
    clearInterval(this.flushInterval)
    this.flush() // Final flush
  }
}
```

## RBAC Service

```typescript
// packages/enterprise/src/rbac/RBACService.ts

export class RBACService {
  private roleCache = new Map<string, Role>()

  constructor(private databaseManager: DatabaseManager) {}

  // Initialize default roles
  async initialize(): Promise<void> {
    const db = await this.databaseManager.getDatabase('roles')
    const existing = await db.query().execute()

    if (existing.totalCount === 0) {
      // Create default roles
      await this.createRole({
        name: 'Admin',
        description: 'Full workspace access',
        permissions: [{ resource: '*', action: '*' }],
        isSystem: true
      })

      await this.createRole({
        name: 'Member',
        description: 'Standard member access',
        permissions: [
          { resource: 'database', action: 'read' },
          { resource: 'database', action: 'write', scope: 'own' },
          { resource: 'workflow', action: 'execute' },
          { resource: 'page', action: 'read' },
          { resource: 'page', action: 'write', scope: 'own' }
        ],
        isSystem: true
      })

      await this.createRole({
        name: 'Viewer',
        description: 'Read-only access',
        permissions: [
          { resource: 'database', action: 'read' },
          { resource: 'page', action: 'read' }
        ],
        isSystem: true
      })
    }
  }

  // Create role
  async createRole(params: Omit<Role, 'id' | 'createdAt'>): Promise<Role> {
    const db = await this.databaseManager.getDatabase('roles')
    const role: Role = {
      id: generateId(),
      ...params,
      createdAt: Date.now()
    }

    await db.createRecord(role)
    this.roleCache.set(role.id, role)

    return role
  }

  // Get role
  async getRole(roleId: string): Promise<Role | null> {
    if (this.roleCache.has(roleId)) {
      return this.roleCache.get(roleId)!
    }

    const db = await this.databaseManager.getDatabase('roles')
    const role = await db.getRecord(roleId)

    if (role) {
      this.roleCache.set(roleId, role as Role)
    }

    return role as Role | null
  }

  // Check permission
  async checkPermission(params: {
    userId: string
    resource: string
    action: string
    resourceOwnerId?: string
    context?: Record<string, unknown>
  }): Promise<boolean> {
    // Get user's roles
    const user = await this.userService.getUser(params.userId)
    if (!user) return false

    for (const roleId of user.roles) {
      const role = await this.getRole(roleId)
      if (!role) continue

      for (const permission of role.permissions) {
        if (this.matchesPermission(permission, params)) {
          return true
        }
      }
    }

    return false
  }

  // Get effective permissions for user
  async getEffectivePermissions(userId: string): Promise<Permission[]> {
    const user = await this.userService.getUser(userId)
    if (!user) return []

    const permissions: Permission[] = []

    for (const roleId of user.roles) {
      const role = await this.getRole(roleId)
      if (role) {
        permissions.push(...role.permissions)
      }
    }

    return this.deduplicatePermissions(permissions)
  }

  private matchesPermission(
    permission: Permission,
    request: {
      resource: string
      action: string
      resourceOwnerId?: string
      context?: Record<string, unknown>
    }
  ): boolean {
    // Wildcard check
    if (permission.resource === '*' && permission.action === '*') {
      return true
    }

    // Resource match
    if (permission.resource !== '*' && permission.resource !== request.resource) {
      return false
    }

    // Action match
    if (permission.action !== '*' && permission.action !== request.action) {
      return false
    }

    // Scope check
    if (permission.scope === 'own' && request.resourceOwnerId) {
      // Would need current user ID passed in
      // Simplified for now
    }

    // Condition checks
    if (permission.conditions) {
      for (const condition of permission.conditions) {
        if (!this.evaluateCondition(condition, request.context || {})) {
          return false
        }
      }
    }

    return true
  }

  private evaluateCondition(
    condition: PermissionCondition,
    context: Record<string, unknown>
  ): boolean {
    const value = context[condition.field]

    switch (condition.operator) {
      case 'equals':
        return value === condition.value
      case 'not_equals':
        return value !== condition.value
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value)
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(value)
      default:
        return false
    }
  }

  private deduplicatePermissions(permissions: Permission[]): Permission[] {
    // If any permission is *, return just that
    if (permissions.some((p) => p.resource === '*' && p.action === '*')) {
      return [{ resource: '*', action: '*' }]
    }

    // Deduplicate by resource+action
    const seen = new Set<string>()
    return permissions.filter((p) => {
      const key = `${p.resource}:${p.action}:${p.scope || ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
}
```

## Multi-tenant Service

```typescript
// packages/enterprise/src/tenant/TenantService.ts

export class TenantService {
  private tenantCache = new Map<string, Tenant>()

  constructor(private databaseManager: DatabaseManager) {}

  // Create tenant
  async createTenant(params: {
    name: string
    domain?: string
    plan: 'free' | 'pro' | 'enterprise'
    seats: number
    adminEmail: string
    adminName: string
  }): Promise<Tenant> {
    const db = await this.databaseManager.getDatabase('tenants')

    const tenant: Tenant = {
      id: generateId(),
      name: params.name,
      domain: params.domain,
      settings: {
        security: {
          mfaRequired: false,
          passwordPolicy: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecial: false
          },
          sessionTimeout: 480 // 8 hours
        },
        features: {
          auditLog: params.plan !== 'free',
          advancedRBAC: params.plan === 'enterprise',
          customBranding: params.plan !== 'free',
          apiAccess: params.plan !== 'free'
        }
      },
      subscription: {
        plan: params.plan,
        seats: params.seats
      },
      createdAt: Date.now()
    }

    await db.createRecord(tenant)

    // Create admin user
    await this.userService.create({
      tenantId: tenant.id,
      email: params.adminEmail,
      name: params.adminName,
      roles: ['admin']
    })

    // Initialize tenant databases
    await this.initializeTenantDatabases(tenant.id)

    this.tenantCache.set(tenant.id, tenant)
    return tenant
  }

  // Get tenant
  async getTenant(tenantId: string): Promise<Tenant> {
    if (this.tenantCache.has(tenantId)) {
      return this.tenantCache.get(tenantId)!
    }

    const db = await this.databaseManager.getDatabase('tenants')
    const tenant = await db.getRecord(tenantId)

    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`)
    }

    this.tenantCache.set(tenantId, tenant as Tenant)
    return tenant as Tenant
  }

  // Get tenant by domain
  async getTenantByDomain(domain: string): Promise<Tenant | null> {
    const db = await this.databaseManager.getDatabase('tenants')
    const result = await db
      .query()
      .filter({ property: 'domain', operator: 'equals', value: domain })
      .first()

    return result as Tenant | null
  }

  // Update tenant settings
  async updateSettings(tenantId: string, settings: Partial<TenantSettings>): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId)
    const updatedSettings = { ...tenant.settings, ...settings }

    const db = await this.databaseManager.getDatabase('tenants')
    await db.updateRecord(tenantId, { settings: updatedSettings })

    tenant.settings = updatedSettings
    this.tenantCache.set(tenantId, tenant)

    return tenant
  }

  // Initialize tenant-specific databases
  private async initializeTenantDatabases(tenantId: string): Promise<void> {
    // Create audit log database for tenant
    await this.databaseManager.createDatabase({
      id: `${tenantId}:audit_logs`,
      name: 'Audit Logs',
      properties: [
        { id: 'timestamp', type: 'date' },
        { id: 'action', type: 'text' },
        { id: 'actor', type: 'json' },
        { id: 'resource', type: 'json' },
        { id: 'details', type: 'json' },
        { id: 'outcome', type: 'text' }
      ]
    })

    // Create roles database for tenant
    await this.databaseManager.createDatabase({
      id: `${tenantId}:roles`,
      name: 'Roles',
      properties: [
        { id: 'name', type: 'text' },
        { id: 'description', type: 'text' },
        { id: 'permissions', type: 'json' },
        { id: 'isSystem', type: 'checkbox' }
      ]
    })
  }

  // Check feature access
  async hasFeature(tenantId: string, feature: keyof TenantSettings['features']): Promise<boolean> {
    const tenant = await this.getTenant(tenantId)
    return tenant.settings.features[feature] || false
  }

  // Check seat limit
  async checkSeatLimit(tenantId: string): Promise<{
    used: number
    limit: number
    available: number
  }> {
    const tenant = await this.getTenant(tenantId)
    const users = await this.userService.listUsers(tenantId)

    return {
      used: users.length,
      limit: tenant.subscription.seats,
      available: tenant.subscription.seats - users.length
    }
  }
}
```

## File Structure

```
packages/enterprise/
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── sso/
│   │   ├── SSOService.ts
│   │   ├── SAMLHandler.ts
│   │   └── OIDCHandler.ts
│   ├── audit/
│   │   ├── AuditService.ts
│   │   ├── AuditMiddleware.ts
│   │   └── AuditExporter.ts
│   ├── rbac/
│   │   ├── RBACService.ts
│   │   ├── PermissionChecker.ts
│   │   └── RBACMiddleware.ts
│   ├── tenant/
│   │   ├── TenantService.ts
│   │   ├── TenantMiddleware.ts
│   │   └── TenantIsolation.ts
│   └── compliance/
│       ├── GDPRService.ts
│       └── DataRetention.ts
├── tests/
│   ├── sso.test.ts
│   ├── audit.test.ts
│   ├── rbac.test.ts
│   └── tenant.test.ts
└── package.json
```

## Validation Checklist

```markdown
## Enterprise Features Validation

### SSO

- [ ] SAML login flow works
- [ ] OIDC login flow works
- [ ] Attribute mapping works
- [ ] Auto-provisioning creates users
- [ ] Group-to-role mapping works
- [ ] SSO-only enforcement works

### Audit Logging

- [ ] Auth events logged
- [ ] Data access events logged
- [ ] Workflow events logged
- [ ] Settings changes logged
- [ ] Query by date range works
- [ ] Query by action type works
- [ ] Export to JSON works
- [ ] Export to CSV works

### RBAC

- [ ] Default roles created
- [ ] Custom roles can be created
- [ ] Permission checks work
- [ ] Wildcard permissions work
- [ ] Scope-based permissions work
- [ ] Condition-based permissions work
- [ ] Role assignment works

### Multi-tenancy

- [ ] Tenant creation works
- [ ] Tenant isolation enforced
- [ ] Domain-based routing works
- [ ] Feature flags work
- [ ] Seat limits enforced
- [ ] Subscription plans work

### Compliance

- [ ] Data export works
- [ ] Data deletion works
- [ ] Retention policies work
- [ ] Consent tracking works
```

---

[← Back to API Gateway](./09-api-gateway.md) | [Next: Timeline →](./11-timeline.md)
