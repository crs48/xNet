import type { AuthAction, AuthDecision, AuthTrace, DID, PolicyEvaluator } from '@xnet/core'
import type { PublicKeyResolver } from '@xnet/crypto'
import { createUCAN } from '@xnet/identity'
import { GrantRateLimiter } from './grant-rate-limit'
import { GRANT_SCHEMA_IRI, type GrantNode, type GrantIndex, isGrantActive } from './grants'
import {
  DEFAULT_OFFLINE_POLICY,
  mergeOfflinePolicy,
  type OfflineAuthPolicy
} from './offline-policy'

const MAX_PROOF_DEPTH = 4

type GrantStatus = 'active' | 'expired' | 'revoked' | 'all'

export interface StoreAuthAPI {
  can(input: {
    action: AuthAction
    nodeId: string
    patch?: Record<string, unknown>
  }): Promise<AuthDecision>
  explain(input: { action: AuthAction; nodeId: string }): Promise<AuthTrace>
  grant(input: GrantInput): Promise<Grant>
  revoke(input: { grantId: string }): Promise<void>
  listGrants(input: { nodeId: string; status?: GrantStatus }): Promise<Grant[]>
  listIssuedGrants(): Promise<Grant[]>
  listReceivedGrants(): Promise<Grant[]>
  getOfflinePolicy(): OfflineAuthPolicy
  setOfflinePolicy(policy: Partial<OfflineAuthPolicy>): void
}

export interface GrantInput {
  to: DID
  actions: AuthAction[]
  resource: string
  expiresIn?: string | number
  parentGrantId?: string
}

export interface Grant {
  id: string
  issuer: DID
  grantee: DID
  resource: string
  resourceSchema: string
  actions: AuthAction[]
  expiresAt: number
  revokedAt: number
  revokedBy?: DID
  ucanToken?: string
  proofDepth: number
  parentGrantId?: string
}

export interface StoreAuthStore {
  create(options: {
    schemaId: string
    properties: Record<string, unknown>
  }): Promise<{ id: string }>
  update(nodeId: string, options: { properties: Record<string, unknown> }): Promise<unknown>
  get(nodeId: string): Promise<{
    id: string
    createdBy: DID
    schemaId: string
    properties: Record<string, unknown>
  } | null>
  list(options?: {
    schemaId?: string
    includeDeleted?: boolean
  }): Promise<Array<{ id: string; schemaId: string; properties: Record<string, unknown> }>>
}

export interface StoreAuthKeyManager {
  getContentKey(resourceId: string): Promise<Uint8Array>
  addRecipient(input: {
    resourceId: string
    recipient: DID
    contentKey: Uint8Array
    recipientPublicKey: Uint8Array
  }): Promise<void>
  rotateContentKey(resourceId: string, revokedRecipient: DID): Promise<void>
}

export interface StoreAuthOptions {
  store: StoreAuthStore
  actorDid: DID
  signingKey: Uint8Array
  evaluator: PolicyEvaluator
  grantIndex?: GrantIndex
  publicKeyResolver?: PublicKeyResolver
  keyManager?: StoreAuthKeyManager
  rateLimiter?: GrantRateLimiter
  now?: () => number
  maxProofDepth?: number
}

export type StoreAuthErrorCode =
  | 'AUTH_PERMISSION_DENIED'
  | 'AUTH_RATE_LIMIT_EXCEEDED'
  | 'AUTH_DELEGATION_DEPTH_EXCEEDED'
  | 'AUTH_DELEGATION_ESCALATION'

export class StoreAuthError extends Error {
  readonly code: StoreAuthErrorCode

  constructor(code: StoreAuthErrorCode, message: string) {
    super(message)
    this.name = 'StoreAuthError'
    this.code = code
  }
}

export class StoreAuth implements StoreAuthAPI {
  private readonly rateLimiter: GrantRateLimiter
  private readonly now: () => number
  private readonly maxProofDepth: number
  private offlinePolicy: OfflineAuthPolicy

  constructor(private readonly options: StoreAuthOptions) {
    this.rateLimiter = options.rateLimiter ?? new GrantRateLimiter()
    this.now = options.now ?? Date.now
    this.maxProofDepth = options.maxProofDepth ?? MAX_PROOF_DEPTH
    this.offlinePolicy = { ...DEFAULT_OFFLINE_POLICY }
  }

  async can(input: {
    action: AuthAction
    nodeId: string
    patch?: Record<string, unknown>
  }): Promise<AuthDecision> {
    return this.options.evaluator.can({
      subject: this.options.actorDid,
      action: input.action,
      nodeId: input.nodeId,
      patch: input.patch
    })
  }

  async explain(input: { action: AuthAction; nodeId: string }): Promise<AuthTrace> {
    return this.options.evaluator.explain({
      subject: this.options.actorDid,
      action: input.action,
      nodeId: input.nodeId
    })
  }

  async grant(input: GrantInput): Promise<Grant> {
    if (input.to === this.options.actorDid) {
      throw new Error('Cannot grant access to yourself')
    }

    if (!this.rateLimiter.allow(this.options.actorDid)) {
      throw new StoreAuthError('AUTH_RATE_LIMIT_EXCEEDED', 'Grant rate limit exceeded')
    }

    const canShare = await this.options.evaluator.can({
      subject: this.options.actorDid,
      action: 'share',
      nodeId: input.resource
    })
    if (!canShare.allowed) {
      throw new StoreAuthError(
        'AUTH_PERMISSION_DENIED',
        'Permission denied: cannot share this resource'
      )
    }

    for (const action of input.actions) {
      const canAction = await this.options.evaluator.can({
        subject: this.options.actorDid,
        action,
        nodeId: input.resource
      })
      if (!canAction.allowed) {
        throw new StoreAuthError(
          'AUTH_PERMISSION_DENIED',
          `Permission denied: cannot delegate action '${action}'`
        )
      }
    }

    const resourceNode = await this.options.store.get(input.resource)
    if (!resourceNode) {
      throw new Error(`Resource not found: ${input.resource}`)
    }

    const parentGrant = input.parentGrantId
      ? await this.getGrantNodeOrThrow(input.parentGrantId)
      : null
    const proofDepth = this.computeProofDepth(parentGrant)
    if (proofDepth > this.maxProofDepth) {
      throw new StoreAuthError(
        'AUTH_DELEGATION_DEPTH_EXCEEDED',
        `Delegation proof depth exceeds max ${this.maxProofDepth}`
      )
    }

    const expiresAt = this.computeExpiration(input.expiresIn)
    this.assertDelegationAttenuation(input, parentGrant, expiresAt)

    const ucanToken = this.createDelegationUCAN({
      ...input,
      expiresAt,
      parentUcanToken: parseString(parentGrant?.properties.ucanToken) ?? undefined
    })

    const created = await this.options.store.create({
      schemaId: GRANT_SCHEMA_IRI,
      properties: {
        issuer: this.options.actorDid,
        grantee: input.to,
        resource: input.resource,
        resourceSchema: resourceNode.schemaId,
        actions: JSON.stringify(input.actions),
        expiresAt,
        revokedAt: 0,
        revokedBy: '',
        ucanToken,
        proofDepth,
        parentGrantId: parentGrant?.id ?? ''
      }
    })

    if (this.options.keyManager && this.options.publicKeyResolver) {
      const contentKey = await this.options.keyManager.getContentKey(input.resource)
      const granteePublicKey = await this.options.publicKeyResolver.resolve(input.to)
      if (!granteePublicKey) {
        throw new Error(`Cannot resolve public key for ${input.to}`)
      }

      await this.options.keyManager.addRecipient({
        resourceId: input.resource,
        recipient: input.to,
        contentKey,
        recipientPublicKey: granteePublicKey
      })
    }

    this.options.evaluator.invalidateSubject(input.to)
    this.options.evaluator.invalidate(input.resource)

    const node = await this.getGrantNodeOrThrow(created.id)
    return toGrant(node)
  }

  async revoke(input: { grantId: string }): Promise<void> {
    const grantNode = await this.getGrantNodeOrThrow(input.grantId)
    const grant = toGrant(grantNode)

    const canRevoke =
      grant.issuer === this.options.actorDid ||
      (
        await this.options.evaluator.can({
          subject: this.options.actorDid,
          action: 'share',
          nodeId: grant.resource
        })
      ).allowed
    if (!canRevoke) {
      throw new Error('Permission denied: cannot revoke this grant')
    }

    await this.validateRevocation(grantNode)

    const revokedAt = this.now()
    await this.options.store.update(input.grantId, {
      properties: {
        revokedAt,
        revokedBy: this.options.actorDid
      }
    })

    await this.cascadeRevocation(input.grantId)

    if (this.options.keyManager) {
      await this.options.keyManager.rotateContentKey(grant.resource, grant.grantee)
    }

    this.options.evaluator.invalidateSubject(grant.grantee)
    this.options.evaluator.invalidate(grant.resource)
  }

  async listGrants(input: { nodeId: string; status?: GrantStatus }): Promise<Grant[]> {
    const status = input.status ?? 'all'
    const grants = await this.loadGrantNodes()
    return grants
      .filter((grant) => parseString(grant.properties.resource) === input.nodeId)
      .map(toGrant)
      .filter((grant) => this.matchesStatus(grant, status))
  }

  async listIssuedGrants(): Promise<Grant[]> {
    const grants = await this.loadGrantNodes()
    return grants.map(toGrant).filter((grant) => grant.issuer === this.options.actorDid)
  }

  async listReceivedGrants(): Promise<Grant[]> {
    const grants = await this.loadGrantNodes()
    return grants.map(toGrant).filter((grant) => grant.grantee === this.options.actorDid)
  }

  getOfflinePolicy(): OfflineAuthPolicy {
    return { ...this.offlinePolicy }
  }

  setOfflinePolicy(policy: Partial<OfflineAuthPolicy>): void {
    this.offlinePolicy = mergeOfflinePolicy(this.offlinePolicy, policy)

    const evaluator = this.options.evaluator as Partial<{
      setOfflinePolicy: (patch: Partial<OfflineAuthPolicy>) => void
    }>
    evaluator.setOfflinePolicy?.(policy)
  }

  private matchesStatus(grant: Grant, status: GrantStatus): boolean {
    if (status === 'all') {
      return true
    }

    const now = this.now()
    const revoked = grant.revokedAt > 0
    const expired = !revoked && grant.expiresAt > 0 && grant.expiresAt <= now
    if (status === 'active') {
      return !revoked && !expired
    }
    if (status === 'expired') {
      return expired
    }
    return revoked
  }

  private async validateRevocation(grant: GrantNode): Promise<void> {
    const resource = parseString(grant.properties.resource)
    const grantee = parseDid(grant.properties.grantee)
    if (!resource || !grantee) {
      return
    }

    const resourceNode = await this.options.store.get(resource)
    const shareHolders = new Set<DID>()
    if (resourceNode) {
      shareHolders.add(resourceNode.createdBy)
    }

    const grants = this.options.grantIndex
      ? this.options.grantIndex.findAllGrantsForResource(resource)
      : (await this.loadGrantNodes()).filter(
          (entry) => parseString(entry.properties.resource) === resource
        )

    for (const entry of grants) {
      if (entry.id === grant.id) {
        continue
      }

      const grantActions = parseActions(entry.properties.actions)
      if (!grantActions.includes('share') || !isGrantActive(entry, this.now())) {
        continue
      }

      const holderDid = parseDid(entry.properties.grantee)
      if (holderDid) {
        shareHolders.add(holderDid)
      }
    }

    shareHolders.delete(grantee)
    if (shareHolders.size === 0) {
      throw new Error(
        `Cannot revoke: this would leave zero users with 'share' access on ${resource}.`
      )
    }
  }

  private assertDelegationAttenuation(
    input: GrantInput,
    parentGrant: GrantNode | null,
    expiresAt: number
  ): void {
    if (!parentGrant) {
      return
    }

    const parentActions = parseActions(parentGrant.properties.actions)
    for (const action of input.actions) {
      if (!parentActions.includes(action)) {
        throw new StoreAuthError(
          'AUTH_DELEGATION_ESCALATION',
          `Delegation escalation blocked for action '${action}'`
        )
      }
    }

    const parentExpiresAt = parseNumber(parentGrant.properties.expiresAt)
    if (parentExpiresAt > 0 && expiresAt > 0 && expiresAt > parentExpiresAt) {
      throw new StoreAuthError(
        'AUTH_DELEGATION_ESCALATION',
        'Delegation expiration exceeds parent grant expiration'
      )
    }
  }

  private computeProofDepth(parentGrant: GrantNode | null): number {
    if (!parentGrant) {
      return 0
    }
    return parseNumber(parentGrant.properties.proofDepth) + 1
  }

  private async cascadeRevocation(revokedGrantId: string): Promise<void> {
    const now = this.now()
    const grants = await this.loadGrantNodes()
    const queue = [revokedGrantId]
    const visited = new Set<string>(queue)

    while (queue.length > 0) {
      const parentId = queue.shift()
      if (!parentId) {
        break
      }

      for (const grant of grants) {
        const parentGrantId = parseString(grant.properties.parentGrantId)
        if (!parentGrantId || parentGrantId !== parentId) {
          continue
        }
        if (!isGrantActive(grant, now) || visited.has(grant.id)) {
          continue
        }

        await this.options.store.update(grant.id, {
          properties: {
            revokedAt: now,
            revokedBy: this.options.actorDid
          }
        })

        const childGrantee = parseDid(grant.properties.grantee)
        const childResource = parseString(grant.properties.resource)
        if (childGrantee && childResource) {
          this.options.evaluator.invalidateSubject(childGrantee)
          this.options.evaluator.invalidate(childResource)
        }

        queue.push(grant.id)
        visited.add(grant.id)
      }
    }
  }

  private async getGrantNodeOrThrow(grantId: string): Promise<GrantNode> {
    const node = await this.options.store.get(grantId)
    if (!node || !isGrantSchema(node.schemaId)) {
      throw new Error(`Grant not found: ${grantId}`)
    }

    return {
      id: node.id,
      properties: node.properties,
      deleted: false
    }
  }

  private async loadGrantNodes(): Promise<GrantNode[]> {
    const nodes = await this.options.store.list({
      schemaId: GRANT_SCHEMA_IRI,
      includeDeleted: false
    })
    return nodes
      .filter((node) => isGrantSchema(node.schemaId))
      .map((node) => ({
        id: node.id,
        properties: node.properties,
        deleted: false
      }))
  }

  private createDelegationUCAN(input: {
    to: DID
    actions: AuthAction[]
    resource: string
    expiresAt: number
    parentUcanToken?: string
  }): string {
    return createUCAN({
      issuer: this.options.actorDid,
      issuerKey: this.options.signingKey,
      audience: input.to,
      capabilities: input.actions.map((action) => ({
        with: `xnet://${this.options.actorDid}/node/${input.resource}`,
        can: `xnet/${action}`
      })),
      expiration: Math.floor(input.expiresAt / 1000),
      proofs: input.parentUcanToken ? [input.parentUcanToken] : []
    })
  }

  private computeExpiration(expiresIn: string | number | undefined): number {
    if (typeof expiresIn === 'number') {
      return expiresIn
    }

    if (typeof expiresIn === 'string') {
      const parsed = parseDuration(expiresIn)
      if (parsed !== null) {
        return this.now() + parsed
      }
    }

    return this.now() + 7 * 24 * 60 * 60 * 1000
  }
}

function toGrant(node: GrantNode): Grant {
  return {
    id: node.id,
    issuer: parseDid(node.properties.issuer) ?? ('did:key:unknown' as DID),
    grantee: parseDid(node.properties.grantee) ?? ('did:key:unknown' as DID),
    resource: parseString(node.properties.resource) ?? '',
    resourceSchema: parseString(node.properties.resourceSchema) ?? '',
    actions: parseActions(node.properties.actions),
    expiresAt: parseNumber(node.properties.expiresAt),
    revokedAt: parseNumber(node.properties.revokedAt),
    revokedBy: parseDid(node.properties.revokedBy) ?? undefined,
    ucanToken: parseString(node.properties.ucanToken) ?? undefined,
    proofDepth: parseNumber(node.properties.proofDepth),
    parentGrantId: parseString(node.properties.parentGrantId) ?? undefined
  }
}

function isGrantSchema(schemaId: string): boolean {
  return schemaId === GRANT_SCHEMA_IRI || schemaId.startsWith(`${GRANT_SCHEMA_IRI}@`)
}

function parseActions(value: unknown): AuthAction[] {
  if (Array.isArray(value)) {
    return value.filter(isAuthAction)
  }

  if (typeof value !== 'string') {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(isAuthAction)
  } catch {
    return []
  }
}

function isAuthAction(value: unknown): value is AuthAction {
  return (
    value === 'read' ||
    value === 'write' ||
    value === 'delete' ||
    value === 'share' ||
    value === 'admin'
  )
}

function parseDid(value: unknown): DID | null {
  if (typeof value === 'string' && value.startsWith('did:key:')) {
    return value as DID
  }
  return null
}

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function parseNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function parseDuration(value: string): number | null {
  const match = value.match(/^(\d+)([smhdw])$/)
  if (!match) {
    return null
  }

  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }

  const unit = match[2]
  switch (unit) {
    case 's':
      return amount * 1000
    case 'm':
      return amount * 60 * 1000
    case 'h':
      return amount * 60 * 60 * 1000
    case 'd':
      return amount * 24 * 60 * 60 * 1000
    case 'w':
      return amount * 7 * 24 * 60 * 60 * 1000
    default:
      return null
  }
}
