/**
 * Permission and authorization types for xNet
 */

/**
 * A group of users
 */
export interface Group {
  id: string // e.g., 'acme-corp/engineers'
  members: string[] // DIDs of direct members
  memberGroups: string[] // Nested group IDs
  managedBy: string[] // DIDs who can modify
}

/**
 * A role with associated capabilities
 */
export interface Role {
  id: string // e.g., 'editor', 'viewer', 'admin'
  capabilities: Capability[]
}

/**
 * Available capabilities
 */
export type Capability = 'read' | 'write' | 'delete' | 'share' | 'admin'

/**
 * All capabilities in order of privilege
 */
export const ALL_CAPABILITIES: Capability[] = ['read', 'write', 'delete', 'share', 'admin']

/**
 * A grant of a role to a principal
 */
export interface PermissionGrant {
  principal: string // DID or group ID
  role: string // Role ID
  scope: ResourceScope
  conditions?: Condition[]
}

/**
 * Scope of a permission
 */
export interface ResourceScope {
  type: 'workspace' | 'document' | 'block'
  id: string
}

/**
 * Conditional access restriction
 */
export interface Condition {
  type: 'time' | 'ip' | 'device'
  value: unknown
}

/**
 * Time-based condition
 */
export interface TimeCondition extends Condition {
  type: 'time'
  value: {
    after?: number // Unix timestamp
    before?: number // Unix timestamp
  }
}

/**
 * IP-based condition
 */
export interface IPCondition extends Condition {
  type: 'ip'
  value: {
    allowList?: string[]
    denyList?: string[]
  }
}

/**
 * Interface for evaluating permissions
 */
export interface PermissionEvaluator {
  /** Check if DID has capability on resource */
  hasCapability(did: string, capability: Capability, resource: ResourceScope): Promise<boolean>

  /** Resolve group membership (including nested) */
  resolveGroups(did: string): Promise<string[]>

  /** Get effective permissions for DID */
  getPermissions(did: string, resource: ResourceScope): Promise<Capability[]>
}

/**
 * Standard roles
 */
export const STANDARD_ROLES: Record<string, Role> = {
  viewer: {
    id: 'viewer',
    capabilities: ['read']
  },
  editor: {
    id: 'editor',
    capabilities: ['read', 'write']
  },
  admin: {
    id: 'admin',
    capabilities: ['read', 'write', 'delete', 'share', 'admin']
  }
}

/**
 * Check if a capability is included in a role
 */
export function roleHasCapability(role: Role, capability: Capability): boolean {
  return role.capabilities.includes(capability)
}

/**
 * Check if a condition is currently satisfied
 */
export function evaluateCondition(condition: Condition, context: { now?: number }): boolean {
  switch (condition.type) {
    case 'time': {
      const timeCondition = condition as TimeCondition
      const now = context.now || Date.now()
      if (timeCondition.value.after && now < timeCondition.value.after) return false
      if (timeCondition.value.before && now > timeCondition.value.before) return false
      return true
    }
    default:
      // Other conditions require more context
      return true
  }
}

/**
 * Get the most permissive capability from a list
 */
export function getMostPermissiveCapability(capabilities: Capability[]): Capability | null {
  for (const cap of [...ALL_CAPABILITIES].reverse()) {
    if (capabilities.includes(cap)) return cap
  }
  return null
}
