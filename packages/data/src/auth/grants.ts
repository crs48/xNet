import type { NodeChangeEvent, NodeState } from '../store'
import type { DID } from '@xnetjs/core'

export const GRANT_SCHEMA_IRI = 'xnet://xnet.fyi/Grant' as const

export interface GrantNode {
  id: string
  properties: Record<string, unknown>
  deleted: boolean
}

export interface GrantIndexStore {
  list(options?: { schemaId?: string; includeDeleted?: boolean }): Promise<NodeState[]>
  subscribe(listener: (event: NodeChangeEvent) => void): () => void
}

export interface GrantIndexOptions {
  schemaId?: string
  clock?: () => number
}

export function isGrantActive(grant: GrantNode, now: number = Date.now()): boolean {
  const revokedAt = asNumber(grant.properties.revokedAt)
  if (revokedAt > 0) {
    return false
  }

  const expiresAt = asNumber(grant.properties.expiresAt)
  if (expiresAt > 0 && expiresAt <= now) {
    return false
  }

  return true
}

export class GrantIndex {
  private byResourceAndGrantee = new Map<string, Map<DID, Set<string>>>()
  private byResource = new Map<string, Set<string>>()
  private grantsById = new Map<string, GrantNode>()
  private unsubscribe: (() => void) | null = null
  private readonly schemaId: string
  private readonly clock: () => number

  constructor(
    private readonly store: GrantIndexStore,
    options: GrantIndexOptions = {}
  ) {
    this.schemaId = options.schemaId ?? GRANT_SCHEMA_IRI
    this.clock = options.clock ?? Date.now
  }

  async initialize(): Promise<void> {
    const grants = await this.loadGrantNodes()
    for (const grant of grants) {
      this.indexGrant(grant)
    }

    this.unsubscribe = this.store.subscribe((event) => {
      const node = event.node
      if (!node || !this.isGrantSchema(node.schemaId)) {
        return
      }

      this.removeGrant(node.id)
      if (!node.deleted) {
        this.indexGrant(node)
      }
    })
  }

  findGrants(resource: string, grantee: DID): GrantNode[] {
    const grantsByGrantee = this.byResourceAndGrantee.get(resource)
    if (!grantsByGrantee) return []
    const grantIds = grantsByGrantee.get(grantee)
    if (!grantIds) return []

    const now = this.clock()
    const grants: GrantNode[] = []
    for (const grantId of grantIds) {
      const grant = this.grantsById.get(grantId)
      if (grant && isGrantActive(grant, now)) {
        grants.push(grant)
      }
    }

    return grants
  }

  findGrantsForResource(resource: string): GrantNode[] {
    const grantIds = this.byResource.get(resource)
    if (!grantIds) return []

    const now = this.clock()
    const grants: GrantNode[] = []
    for (const grantId of grantIds) {
      const grant = this.grantsById.get(grantId)
      if (grant && isGrantActive(grant, now)) {
        grants.push(grant)
      }
    }

    return grants
  }

  findAllGrantsForResource(resource: string): GrantNode[] {
    const grantIds = this.byResource.get(resource)
    if (!grantIds) return []

    const grants: GrantNode[] = []
    for (const grantId of grantIds) {
      const grant = this.grantsById.get(grantId)
      if (grant) {
        grants.push(grant)
      }
    }

    return grants
  }

  findGrantsForGrantee(grantee: DID): GrantNode[] {
    const grants: GrantNode[] = []
    const now = this.clock()

    for (const grantsByGrantee of this.byResourceAndGrantee.values()) {
      const grantIds = grantsByGrantee.get(grantee)
      if (!grantIds) continue

      for (const grantId of grantIds) {
        const grant = this.grantsById.get(grantId)
        if (grant && isGrantActive(grant, now)) {
          grants.push(grant)
        }
      }
    }

    return grants
  }

  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.byResourceAndGrantee.clear()
    this.byResource.clear()
    this.grantsById.clear()
  }

  private async loadGrantNodes(): Promise<NodeState[]> {
    const directMatches = await this.store.list({ schemaId: this.schemaId, includeDeleted: false })
    if (directMatches.length > 0 || this.schemaId.includes('@')) {
      return directMatches
    }

    const allNodes = await this.store.list({ includeDeleted: false })
    return allNodes.filter((node) => this.isGrantSchema(node.schemaId))
  }

  private isGrantSchema(schemaId: string): boolean {
    return schemaId === this.schemaId || schemaId.startsWith(`${this.schemaId}@`)
  }

  private indexGrant(node: NodeState): void {
    const resource = asString(node.properties.resource)
    const grantee = asDid(node.properties.grantee)
    if (!resource || !grantee) {
      return
    }

    const grant: GrantNode = {
      id: node.id,
      properties: node.properties,
      deleted: node.deleted
    }

    this.grantsById.set(node.id, grant)

    let byGrantee = this.byResourceAndGrantee.get(resource)
    if (!byGrantee) {
      byGrantee = new Map<DID, Set<string>>()
      this.byResourceAndGrantee.set(resource, byGrantee)
    }

    let grantIdsForGrantee = byGrantee.get(grantee)
    if (!grantIdsForGrantee) {
      grantIdsForGrantee = new Set<string>()
      byGrantee.set(grantee, grantIdsForGrantee)
    }
    grantIdsForGrantee.add(node.id)

    let grantIdsForResource = this.byResource.get(resource)
    if (!grantIdsForResource) {
      grantIdsForResource = new Set<string>()
      this.byResource.set(resource, grantIdsForResource)
    }
    grantIdsForResource.add(node.id)
  }

  private removeGrant(grantId: string): void {
    const existing = this.grantsById.get(grantId)
    if (!existing) {
      return
    }

    const resource = asString(existing.properties.resource)
    const grantee = asDid(existing.properties.grantee)
    this.grantsById.delete(grantId)

    if (!resource || !grantee) {
      return
    }

    const byGrantee = this.byResourceAndGrantee.get(resource)
    if (byGrantee) {
      const grantIds = byGrantee.get(grantee)
      if (grantIds) {
        grantIds.delete(grantId)
        if (grantIds.size === 0) {
          byGrantee.delete(grantee)
        }
      }
      if (byGrantee.size === 0) {
        this.byResourceAndGrantee.delete(resource)
      }
    }

    const byResource = this.byResource.get(resource)
    if (byResource) {
      byResource.delete(grantId)
      if (byResource.size === 0) {
        this.byResource.delete(resource)
      }
    }
  }
}

function asDid(value: unknown): DID | null {
  if (typeof value === 'string' && value.startsWith('did:key:')) {
    return value as DID
  }
  return null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
