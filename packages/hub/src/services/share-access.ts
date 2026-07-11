/**
 * @xnetjs/hub - Share-grant role resolution for write enforcement.
 *
 * Grants created by share-link claims carry an action list derived from the
 * link role. A grant with a restricted role OVERRIDES the legacy wildcard
 * capability model on write paths: if the hub knows a DID's access to a doc
 * came from a read-only link, signed write envelopes from that DID are
 * rejected even though its self-issued UCAN claims `hub/*`.
 */

import type { HubStorage, ShareLinkRole } from '../storage/interface'

/** Actions stored on grant rows for each share-link role. */
export const SHARE_ROLE_ACTIONS: Record<ShareLinkRole, string[]> = {
  read: ['read'],
  comment: ['read', 'comment'],
  write: ['read', 'comment', 'write']
}

const ROLE_RANK: Record<ShareLinkRole, number> = { read: 0, comment: 1, write: 2 }

export const compareShareRoles = (a: ShareLinkRole, b: ShareLinkRole): number =>
  ROLE_RANK[a] - ROLE_RANK[b]

export const roleFromActions = (actions: string[]): ShareLinkRole => {
  if (actions.includes('write')) return 'write'
  if (actions.includes('comment')) return 'comment'
  return 'read'
}

/**
 * Schema IRIs (version-agnostic prefixes) a `comment` grantee may still
 * write. Comments and reactions are their own node kinds, so the gate is a
 * schema allowlist, not content inspection. Chat messages count as
 * "commenting" too — a comment-role channel share means "can participate in
 * the conversation, can't edit the channel itself" (0290 follow-up).
 */
const COMMENT_SCHEMA_PREFIXES = [
  'xnet://xnet.fyi/Comment@',
  'xnet://xnet.fyi/Reaction@',
  'xnet://xnet.fyi/ChatMessage@'
]

export const isCommentSchema = (schemaId: string | undefined): boolean =>
  typeof schemaId === 'string' &&
  COMMENT_SCHEMA_PREFIXES.some((prefix) => schemaId.startsWith(prefix))

/**
 * Profile rooms (`profile-<did>`, see `profileNodeId` in @xnetjs/data) are
 * hub-published identity: any authenticated DID may read them so shared
 * content can render author names/avatars, but ONLY the subject DID may
 * write. Returns the subject DID, or null when the doc isn't a profile.
 */
export const profileSubjectFromDocId = (docId: string): string | null =>
  docId.startsWith('profile-did:') ? docId.slice('profile-'.length) : null

/**
 * Share-grant status of a DID for a doc:
 * - `none` — never had a grant; the legacy capability model applies.
 * - a role — has an active grant; writes are limited to that role.
 * - `revoked` — every grant was revoked or expired ("remove access");
 *   the DID is denied entirely, overriding wildcard capabilities, until
 *   it claims a still-valid link again.
 */
export type ShareStatus = ShareLinkRole | 'none' | 'revoked'

type CacheEntry = {
  status: ShareStatus
  expiresAt: number
}

export class ShareAccessService {
  private readonly cache = new Map<string, CacheEntry>()

  constructor(
    private readonly storage: HubStorage,
    private readonly cacheTtlMs = 10_000
  ) {}

  /**
   * Resolve the share-grant status for a DID on a doc.
   * Cached briefly — write paths call this per envelope.
   */
  async getStatus(did: string, docId: string): Promise<ShareStatus> {
    const key = `${did}|${docId}`
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.status
    }

    const now = Date.now()
    const grants = (await this.storage.listGrantsForDoc(docId)).filter(
      (grant) => grant.granteeDid === did
    )
    const active = grants
      .filter((grant) => grant.revokedAt === 0 && (grant.expiresAt === 0 || grant.expiresAt > now))
      .sort((a, b) => b.createdAt - a.createdAt)[0]

    const status: ShareStatus = active
      ? roleFromActions(active.actions)
      : grants.length > 0
        ? 'revoked'
        : 'none'
    this.cache.set(key, { status, expiresAt: now + this.cacheTtlMs })
    return status
  }

  /**
   * Resolve a DID's effective status for a node, folding in container (Space)
   * grants (exploration 0179). The most permissive of the node's direct grant
   * and any ancestor-Space grant wins (Drive's expansive rule). An explicit
   * per-doc removal (`revoked`) denies outright — a deny always wins, even over
   * a space membership.
   */
  async getStatusForNode(did: string, docId: string): Promise<ShareStatus> {
    const key = `node|${did}|${docId}`
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.status
    }

    const direct = await this.getStatus(did, docId)
    let status: ShareStatus
    if (direct === 'revoked') {
      status = 'revoked'
    } else {
      let best: ShareLinkRole | null = direct === 'none' ? null : direct
      const ancestors = await this.storage.ancestorContainers(docId)
      for (const containerId of ancestors) {
        const grant = await this.storage.getActiveGrant(did, containerId)
        if (!grant) continue
        const role = roleFromActions(grant.actions)
        if (!best || compareShareRoles(role, best) > 0) best = role
      }
      status = best ?? 'none'
    }

    this.cache.set(key, { status, expiresAt: Date.now() + this.cacheTtlMs })
    return status
  }

  /** Whether the DID has been explicitly removed from the doc (direct grant only). */
  async isDenied(did: string, docId: string): Promise<boolean> {
    return (await this.getStatus(did, docId)) === 'revoked'
  }

  /**
   * Whether the DID may read/subscribe to a node — directly granted, or a
   * member of an ancestor Space (exploration 0179). Explicit removal denies.
   */
  async canAccessNode(did: string, docId: string): Promise<boolean> {
    const status = await this.getStatusForNode(did, docId)
    return status === 'read' || status === 'comment' || status === 'write'
  }

  /**
   * Drop cached restrictions after a grant changes (claim, role edit, revoke).
   * Keys are either `did|docId` (direct) or `node|did|docId` (container-folded).
   * A grant change always names the affected DID; because a container (Space)
   * grant can move the status of any node beneath it, invalidating a DID clears
   * every cached entry for that DID, not just the named doc.
   */
  invalidate(did?: string, docId?: string): void {
    if (!did && !docId) {
      this.cache.clear()
      return
    }
    for (const key of this.cache.keys()) {
      const parts = key.split('|')
      const keyDid = parts.length === 3 ? parts[1] : parts[0]
      const keyDoc = parts.length === 3 ? parts[2] : parts[1]
      if ((did && keyDid === did) || (docId && keyDoc === docId)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Whether a DID may relay a node-change for the given schema into a doc
   * room. Unrestricted (no grant) and `write` grantees pass; `comment`
   * grantees pass only for comment-kind schemas; `read` grantees and
   * removed (`revoked`) DIDs never pass.
   */
  async canWriteNodeChange(
    did: string,
    docId: string,
    schemaId: string | undefined
  ): Promise<boolean> {
    const profileSubject = profileSubjectFromDocId(docId)
    if (profileSubject) return did === profileSubject
    const status = await this.getStatusForNode(did, docId)
    if (status === 'none' || status === 'write') return true
    if (status === 'comment') return isCommentSchema(schemaId)
    return false
  }

  /**
   * Whether a DID may relay Yjs document updates (sync-step2 / sync-update).
   * Comment grantees cannot — page bodies are Yjs, comments are node-changes.
   */
  async canWriteYjs(did: string, docId: string): Promise<boolean> {
    const profileSubject = profileSubjectFromDocId(docId)
    if (profileSubject) return did === profileSubject
    const status = await this.getStatusForNode(did, docId)
    return status === 'none' || status === 'write'
  }
}
