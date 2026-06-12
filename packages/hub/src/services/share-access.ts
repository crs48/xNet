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
 * schema allowlist, not content inspection.
 */
const COMMENT_SCHEMA_PREFIXES = ['xnet://xnet.fyi/Comment@', 'xnet://xnet.fyi/Reaction@']

export const isCommentSchema = (schemaId: string | undefined): boolean =>
  typeof schemaId === 'string' &&
  COMMENT_SCHEMA_PREFIXES.some((prefix) => schemaId.startsWith(prefix))

/** `null` means the DID has no share grant for the doc — no restriction. */
export type ShareRestriction = ShareLinkRole | null

type CacheEntry = {
  restriction: ShareRestriction
  expiresAt: number
}

export class ShareAccessService {
  private readonly cache = new Map<string, CacheEntry>()

  constructor(
    private readonly storage: HubStorage,
    private readonly cacheTtlMs = 10_000
  ) {}

  /**
   * Resolve the share-grant restriction for a DID on a doc.
   * Cached briefly — write paths call this per envelope.
   */
  async getRestriction(did: string, docId: string): Promise<ShareRestriction> {
    const key = `${did}|${docId}`
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.restriction
    }

    const grant = await this.storage.getActiveGrant(did, docId)
    const restriction: ShareRestriction = grant ? roleFromActions(grant.actions) : null
    this.cache.set(key, { restriction, expiresAt: Date.now() + this.cacheTtlMs })
    return restriction
  }

  /** Drop cached restrictions after a grant changes (claim, role edit, revoke). */
  invalidate(did?: string, docId?: string): void {
    if (!did && !docId) {
      this.cache.clear()
      return
    }
    for (const key of this.cache.keys()) {
      const [cachedDid, cachedDocId] = key.split('|')
      if ((did && cachedDid === did) || (docId && cachedDocId === docId)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Whether a DID may relay a node-change for the given schema into a doc
   * room. Unrestricted (no grant) and `write` grantees pass; `comment`
   * grantees pass only for comment-kind schemas; `read` grantees never pass.
   */
  async canWriteNodeChange(
    did: string,
    docId: string,
    schemaId: string | undefined
  ): Promise<boolean> {
    const restriction = await this.getRestriction(did, docId)
    if (restriction === null || restriction === 'write') return true
    if (restriction === 'comment') return isCommentSchema(schemaId)
    return false
  }

  /**
   * Whether a DID may relay Yjs document updates (sync-step2 / sync-update).
   * Comment grantees cannot — page bodies are Yjs, comments are node-changes.
   */
  async canWriteYjs(did: string, docId: string): Promise<boolean> {
    const restriction = await this.getRestriction(did, docId)
    return restriction === null || restriction === 'write'
  }
}
