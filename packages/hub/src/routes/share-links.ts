/**
 * @xnetjs/hub - Durable share-link routes (exploration 0169).
 *
 * Share links are revocable records in hub storage. The URL shape is
 * `https://<hub>/s/<linkId>#s=<secret>` — the linkId routes, the fragment
 * secret authenticates the claim and never reaches server logs. Claiming a
 * link writes a per-DID grant; the link is only the bootstrap, so disabling
 * a link never kicks members admitted through it.
 */

import type { AuthContext } from '../auth/ucan'
import type { HubStorage, ShareLinkRecord, ShareLinkRole } from '../storage/interface'
import type { MiddlewareHandler } from 'hono'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { compareShareRoles, SHARE_ROLE_ACTIONS } from '../services/share-access'

type Env = { Variables: { auth: AuthContext } }

export type ShareLinkRouteDeps = {
  storage: HubStorage
  requireAuth: MiddlewareHandler
  /** Public hub URL (ws/wss or http/https); used to build link + endpoint URLs. */
  publicUrl: string | undefined
  port: number
  /** Called after a grant is created or revoked so role caches refresh. */
  onGrantsChanged?: (did: string, docId: string) => void
  /** Claim attempts allowed per DID per window (default 10/min). */
  claimRateLimit?: { maxAttempts: number; windowMs: number }
}

// 'space' invites bootstrap Space membership: the grant a claim writes is keyed
// on the Space id, so it acts as a container (subtree) grant that the hub
// resolves for every node beneath the Space (exploration 0179).
// 'workspace' shares a saved shell layout — a bench travels like a node
// (exploration 0280; the client sent it long before the hub accepted it, 0290).
// 'channel' shares a chat channel; a comment-role grant lets the recipient
// post messages (0290 follow-up).
const SHARE_DOC_TYPES = [
  'page',
  'database',
  'canvas',
  'dashboard',
  'view',
  'space',
  'workspace',
  'channel'
] as const
type ShareDocType = (typeof SHARE_DOC_TYPES)[number]

const isShareDocType = (value: unknown): value is ShareDocType =>
  SHARE_DOC_TYPES.includes(value as ShareDocType)

const isShareRole = (value: unknown): value is ShareLinkRole =>
  value === 'read' || value === 'comment' || value === 'write'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

export const hashShareSecret = (secret: string): string =>
  createHash('sha256').update(secret).digest('base64url')

const secretMatches = (secret: string, secretHash: string): boolean => {
  const candidate = createHash('sha256').update(secret).digest()
  const expected = Buffer.from(secretHash, 'base64url')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export const normalizeHttpUrl = (url: string): string =>
  url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '')

export const normalizeWsUrl = (url: string): string =>
  url
    .replace(/^https:/, 'wss:')
    .replace(/^http:/, 'ws:')
    .replace(/\/$/, '')

const resolveUrls = (deps: ShareLinkRouteDeps): { http: string; ws: string } => {
  const base = deps.publicUrl ?? `ws://localhost:${deps.port}`
  return { http: normalizeHttpUrl(base), ws: normalizeWsUrl(base) }
}

/**
 * Deterministic grant id so re-claims upsert instead of duplicating.
 * `.` separators are unambiguous — base64url link ids and DID hashes
 * contain only `[A-Za-z0-9_-]`.
 */
const grantIdFor = (linkId: string, did: string): string =>
  `lnk.${linkId}.${createHash('sha256').update(did).digest('base64url').slice(0, 22)}`

/** Inverse of `grantIdFor`: the linkId a grant was claimed through. */
export const linkIdFromGrantId = (grantId: string): string | null => {
  if (!grantId.startsWith('lnk.')) return null
  const parts = grantId.split('.')
  return parts.length === 3 ? parts[1] : null
}

/**
 * Whether a DID may manage sharing for a doc: the recorded owner always can;
 * with a known owner, others need an explicit admin grant. Docs with no
 * recorded owner fall back to the legacy trust model (possession of the doc
 * id ≡ access) — matching what `/shares/issue` already allows.
 */
const canManageShares = async (
  storage: HubStorage,
  did: string,
  docId: string
): Promise<boolean> => {
  const meta = await storage.getDocMeta(docId)
  if (!meta) return true
  if (meta.ownerDid === did) return true
  const grant = await storage.getActiveGrant(did, docId)
  return Boolean(grant?.actions.includes('admin'))
}

const serializeLink = (link: ShareLinkRecord): Record<string, unknown> => ({
  linkId: link.linkId,
  docId: link.docId,
  docType: link.docType,
  role: link.role,
  label: link.label,
  expiresAt: link.expiresAt,
  maxUses: link.maxUses,
  useCount: link.useCount,
  disabled: link.disabled,
  createdBy: link.createdByDid,
  createdAt: link.createdAt
})

export const createShareLinkRoutes = (deps: ShareLinkRouteDeps): Hono<Env> => {
  const { storage, requireAuth } = deps
  const app = new Hono<Env>()

  const claimWindow = deps.claimRateLimit ?? { maxAttempts: 10, windowMs: 60_000 }
  const claimAttempts = new Map<string, number[]>()

  const claimRateLimited = (key: string): boolean => {
    const now = Date.now()
    const attempts = (claimAttempts.get(key) ?? []).filter((at) => at > now - claimWindow.windowMs)
    if (attempts.length >= claimWindow.maxAttempts) {
      claimAttempts.set(key, attempts)
      return true
    }
    attempts.push(now)
    claimAttempts.set(key, attempts)
    // Bounded cleanup so the map cannot grow unbounded under DID churn
    if (claimAttempts.size > 10_000) {
      for (const [k, v] of claimAttempts) {
        if (v.every((at) => at <= now - claimWindow.windowMs)) claimAttempts.delete(k)
      }
    }
    return false
  }

  app.post('/links', requireAuth, async (c) => {
    const auth = c.get('auth')
    const body = await c.req.json().catch(() => null)
    if (!isRecord(body)) {
      return c.json({ code: 'INVALID_BODY', error: 'Invalid request body' }, 400)
    }

    const docId = typeof body.docId === 'string' ? body.docId : ''
    const docType = body.docType
    const role = body.role
    const label = typeof body.label === 'string' ? body.label.slice(0, 200) : null
    const expiresAt = typeof body.expiresAt === 'number' ? body.expiresAt : 0
    const maxUses = typeof body.maxUses === 'number' ? Math.floor(body.maxUses) : 0

    if (!docId || !isShareDocType(docType) || !isShareRole(role)) {
      return c.json({ code: 'INVALID_BODY', error: 'Missing docId, docType, or role' }, 400)
    }
    if (expiresAt !== 0 && expiresAt <= Date.now()) {
      return c.json({ code: 'INVALID_BODY', error: 'expiresAt is already in the past' }, 400)
    }
    if (maxUses < 0) {
      return c.json({ code: 'INVALID_BODY', error: 'maxUses must be >= 0' }, 400)
    }

    if (!(await canManageShares(storage, auth.did, docId))) {
      return c.json({ code: 'FORBIDDEN', error: 'Not allowed to manage sharing for this doc' }, 403)
    }

    const linkId = randomBytes(9).toString('base64url')
    const secret = randomBytes(24).toString('base64url')
    const record: ShareLinkRecord = {
      linkId,
      docId,
      docType,
      role,
      secretHash: hashShareSecret(secret),
      createdByDid: auth.did,
      label,
      expiresAt,
      maxUses,
      useCount: 0,
      disabled: false,
      createdAt: Date.now()
    }
    await storage.insertShareLink(record)

    const { http } = resolveUrls(deps)
    return c.json({
      ...serializeLink(record),
      url: `${http}/s/${linkId}#s=${secret}`
    })
  })

  app.get('/links', requireAuth, async (c) => {
    const auth = c.get('auth')
    const docId = c.req.query('docId')
    if (!docId) {
      return c.json({ code: 'INVALID_QUERY', error: 'docId query parameter is required' }, 400)
    }
    if (!(await canManageShares(storage, auth.did, docId))) {
      return c.json({ code: 'FORBIDDEN', error: 'Not allowed to manage sharing for this doc' }, 403)
    }
    const links = await storage.listShareLinks(docId)
    return c.json({ links: links.map(serializeLink) })
  })

  app.patch('/links/:linkId', requireAuth, async (c) => {
    const auth = c.get('auth')
    const link = await storage.getShareLink(c.req.param('linkId'))
    if (!link) {
      return c.json({ code: 'LINK_NOT_FOUND', error: 'Share link not found' }, 404)
    }
    if (!(await canManageShares(storage, auth.did, link.docId))) {
      return c.json({ code: 'FORBIDDEN', error: 'Not allowed to manage sharing for this doc' }, 403)
    }
    const body = await c.req.json().catch(() => null)
    if (!isRecord(body) || typeof body.disabled !== 'boolean') {
      return c.json({ code: 'INVALID_BODY', error: 'Body must include disabled: boolean' }, 400)
    }
    await storage.setShareLinkDisabled(link.linkId, body.disabled)
    return c.json({ ...serializeLink(link), disabled: body.disabled })
  })

  app.delete('/links/:linkId', requireAuth, async (c) => {
    const auth = c.get('auth')
    const link = await storage.getShareLink(c.req.param('linkId'))
    if (!link) {
      return c.json({ code: 'LINK_NOT_FOUND', error: 'Share link not found' }, 404)
    }
    if (!(await canManageShares(storage, auth.did, link.docId))) {
      return c.json({ code: 'FORBIDDEN', error: 'Not allowed to manage sharing for this doc' }, 403)
    }
    await storage.deleteShareLink(link.linkId)
    return c.json({ deleted: true })
  })

  app.post('/links/:linkId/claim', requireAuth, async (c) => {
    const auth = c.get('auth')
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (claimRateLimited(`${auth.did}|${forwarded ?? ''}`)) {
      return c.json({ code: 'RATE_LIMITED', error: 'Too many claim attempts' }, 429)
    }

    const body = await c.req.json().catch(() => null)
    if (!isRecord(body) || typeof body.secret !== 'string' || body.secret.length === 0) {
      return c.json({ code: 'INVALID_BODY', error: 'Body must include the link secret' }, 400)
    }

    const link = await storage.getShareLink(c.req.param('linkId'))
    if (!link) {
      return c.json({ code: 'LINK_NOT_FOUND', error: 'Share link not found' }, 404)
    }
    if (link.disabled) {
      return c.json({ code: 'LINK_REVOKED', error: 'Share link has been disabled' }, 410)
    }
    if (link.expiresAt !== 0 && link.expiresAt <= Date.now()) {
      return c.json({ code: 'LINK_EXPIRED', error: 'Share link has expired' }, 410)
    }
    if (!secretMatches(body.secret, link.secretHash)) {
      return c.json({ code: 'BAD_SECRET', error: 'Share link secret is invalid' }, 403)
    }

    const { ws } = resolveUrls(deps)
    const respond = (role: ShareLinkRole) =>
      c.json({
        resource: link.docId,
        docType: link.docType,
        role,
        endpoint: ws,
        granteeDid: auth.did
      })

    // The doc owner clicking their own link should not restrict themselves.
    const meta = await storage.getDocMeta(link.docId)
    if (meta && meta.ownerDid === auth.did) {
      return respond('write')
    }

    // Idempotent re-claim: an existing equal-or-higher grant from this link
    // is reaffirmed without consuming a use.
    const existing = await storage.getActiveGrant(auth.did, link.docId)
    if (existing) {
      const existingRole = existing.actions.includes('write')
        ? ('write' as const)
        : existing.actions.includes('comment')
          ? ('comment' as const)
          : ('read' as const)
      if (compareShareRoles(existingRole, link.role) >= 0) {
        return respond(existingRole)
      }
    }

    if (link.maxUses !== 0 && link.useCount >= link.maxUses) {
      return c.json({ code: 'LINK_EXHAUSTED', error: 'Share link has no uses remaining' }, 410)
    }

    await storage.upsertGrantIndex({
      grantId: grantIdFor(link.linkId, auth.did),
      granteeDid: auth.did,
      resourceDocId: link.docId,
      actions: SHARE_ROLE_ACTIONS[link.role],
      expiresAt: 0,
      revokedAt: 0,
      createdAt: Date.now()
    })
    await storage.incrementShareLinkUse(link.linkId)
    deps.onGrantsChanged?.(auth.did, link.docId)

    return respond(link.role)
  })

  app.get('/grants', requireAuth, async (c) => {
    const auth = c.get('auth')
    const docId = c.req.query('docId')
    if (!docId) {
      return c.json({ code: 'INVALID_QUERY', error: 'docId query parameter is required' }, 400)
    }
    if (!(await canManageShares(storage, auth.did, docId))) {
      return c.json({ code: 'FORBIDDEN', error: 'Not allowed to manage sharing for this doc' }, 403)
    }
    const grants = await storage.listGrantsForDoc(docId)
    const links = await storage.listShareLinks(docId)
    const linkLabels = new Map(links.map((link) => [link.linkId, link.label]))
    return c.json({
      grants: grants.map((grant) => {
        const viaLinkId = linkIdFromGrantId(grant.grantId)
        return {
          grantId: grant.grantId,
          granteeDid: grant.granteeDid,
          actions: grant.actions,
          revokedAt: grant.revokedAt,
          expiresAt: grant.expiresAt,
          createdAt: grant.createdAt,
          viaLinkId,
          viaLinkLabel: viaLinkId ? (linkLabels.get(viaLinkId) ?? null) : null
        }
      })
    })
  })

  app.delete('/grants/:grantId', requireAuth, async (c) => {
    const auth = c.get('auth')
    const grantId = c.req.param('grantId')
    const grants = await storage.listGrantsForDoc(c.req.query('docId') ?? '')
    const grant = grants.find((entry) => entry.grantId === grantId)
    if (!grant) {
      return c.json({ code: 'GRANT_NOT_FOUND', error: 'Grant not found for this doc' }, 404)
    }
    if (!(await canManageShares(storage, auth.did, grant.resourceDocId))) {
      return c.json({ code: 'FORBIDDEN', error: 'Not allowed to manage sharing for this doc' }, 403)
    }
    await storage.revokeGrant(grantId)
    deps.onGrantsChanged?.(grant.granteeDid, grant.resourceDocId)
    return c.json({ revoked: true })
  })

  return app
}
