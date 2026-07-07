/**
 * @xnetjs/hub — public form submissions (exploration 0278).
 *
 * The forms sibling of the webhook inbox: an owner mints a high-entropy
 * token for a form view; anyone with the URL can read the sanitized form
 * definition and POST a response — no xNet session. The hub NEVER writes
 * workspace nodes (server-authoritative writes stay deferred, same as the
 * 0213 webhooks): submissions land in a durable quarantine that the owner's
 * signing client drains into DatabaseRow nodes and acks.
 *
 * Trust properties:
 * - Tokens are stored hashed (share-secret discipline, timing-safe compare
 *   is unnecessary because the hash IS the lookup key).
 * - The definition is an owner-published snapshot; the hub cannot leak more
 *   than the owner chose to publish (works for E2E spaces too).
 * - Anonymous surface is honeypot-gated, rate-limited per IP, and size-capped.
 * - The submitter's `nonce` is the idempotency key end-to-end: duplicate
 *   POSTs collapse in the inbox, and the drain client derives the row id
 *   from it so double-drains LWW-upsert.
 */

import type { HubFeature } from './types'
import type {
  FormInboxStore,
  FormSubmissionRecord,
  PublicFormDefinition
} from '../services/form-inbox-store'
import { createHash, randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { createFormInboxStore } from '../services/form-inbox-store'

export const FORM_INBOX_FEATURE_ID = 'fyi.xnet.forms'

/** Raw token → storage key. */
export const hashFormToken = (token: string): string =>
  createHash('sha256').update(token).digest('base64url')

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/
const NONCE_RE = /^[A-Za-z0-9_-]{8,128}$/

/** Anonymous submissions are capped well below any legitimate form payload. */
const MAX_SUBMISSION_BYTES = 64 * 1024
const MAX_DEFINITION_BYTES = 256 * 1024

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isDefinition = (v: unknown): v is PublicFormDefinition =>
  isRecord(v) && Array.isArray((v as { questions?: unknown }).questions)

const tokenView = (record: {
  tokenHash: string
  viewId: string
  databaseId: string
  space: string
  label: string | null
  accepting: boolean
  disabled: boolean
  expiresAt: number
  createdAt: number
}) => ({
  tokenHash: record.tokenHash,
  viewId: record.viewId,
  databaseId: record.databaseId,
  space: record.space,
  label: record.label,
  accepting: record.accepting,
  disabled: record.disabled,
  expiresAt: record.expiresAt,
  createdAt: record.createdAt
})

interface Window {
  maxAttempts: number
  windowMs: number
}

/** Sliding-window per-key limiter (share-links claim pattern). */
const makeLimiter = (window: Window) => {
  const attempts = new Map<string, number[]>()
  return (key: string): boolean => {
    const now = Date.now()
    const recent = (attempts.get(key) ?? []).filter((at) => at > now - window.windowMs)
    if (recent.length >= window.maxAttempts) {
      attempts.set(key, recent)
      return true
    }
    recent.push(now)
    attempts.set(key, recent)
    if (attempts.size > 10_000) {
      for (const [k, v] of attempts) {
        if (v.every((at) => at <= now - window.windowMs)) attempts.delete(k)
      }
    }
    return false
  }
}

export interface FormInboxOptions {
  /** Injected store (tests); defaults to `createFormInboxStore` from deps. */
  store?: FormInboxStore
  /** Public GET/POST rate windows (per client IP). */
  readRateLimit?: Window
  submitRateLimit?: Window
}

export function formInboxFeature(options: FormInboxOptions = {}): HubFeature {
  return {
    id: FORM_INBOX_FEATURE_ID,
    mount({ app, requireAuth, storage, dataDir }) {
      const store = options.store ?? createFormInboxStore({ storage, dataDir })
      const readLimited = makeLimiter(
        options.readRateLimit ?? { maxAttempts: 60, windowMs: 60_000 }
      )
      const submitLimited = makeLimiter(
        options.submitRateLimit ?? { maxAttempts: 20, windowMs: 60_000 }
      )

      const clientIp = (c: { req: { header: (name: string) => string | undefined } }): string =>
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
        c.req.header('x-real-ip') ??
        'unknown'

      const tokenGone = (record: { disabled: boolean; expiresAt: number } | null) =>
        !record || record.disabled || (record.expiresAt > 0 && record.expiresAt <= Date.now())

      // ─── Owner-authenticated management ─────────────────────────────────
      // v1 scopes management + draining to the token's creator: the minting
      // client is the draining client. Broader member draining needs the
      // grant walk `canManageShares` does — deliberately deferred.
      const owner = new Hono()

      owner.post('/', requireAuth, async (c) => {
        const auth = c.get('auth' as never) as { did: string }
        const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
        if (
          !isRecord(body) ||
          typeof body.viewId !== 'string' ||
          typeof body.databaseId !== 'string' ||
          typeof body.space !== 'string' ||
          !isDefinition(body.definition)
        ) {
          return c.json({ error: 'viewId, databaseId, space, definition required' }, 400)
        }
        if (JSON.stringify(body.definition).length > MAX_DEFINITION_BYTES) {
          return c.json({ error: 'Definition too large' }, 413)
        }
        const token = randomBytes(18).toString('base64url')
        const now = Date.now()
        const record = {
          tokenHash: hashFormToken(token),
          viewId: body.viewId,
          databaseId: body.databaseId,
          space: body.space,
          createdByDid: auth.did,
          label: typeof body.label === 'string' ? body.label : null,
          definition: body.definition,
          accepting: true,
          disabled: false,
          expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : 0,
          createdAt: now,
          updatedAt: now
        }
        await store.insertToken(record)
        // The raw token is returned exactly once (secret-shown-once).
        return c.json({ token, ...tokenView(record) }, 201)
      })

      owner.get('/', requireAuth, async (c) => {
        const auth = c.get('auth' as never) as { did: string }
        const viewId = c.req.query('viewId')
        const records = (await store.listTokensByCreator(auth.did)).filter(
          (r) => !viewId || r.viewId === viewId
        )
        const withCounts = await Promise.all(
          records.map(async (r) => ({
            ...tokenView(r),
            pending: await store.countSubmissions(r.tokenHash, 'pending'),
            rejected: await store.countSubmissions(r.tokenHash, 'rejected')
          }))
        )
        return c.json({ forms: withCounts })
      })

      /** Load a token owned by the caller, or respond 404 (no existence oracle). */
      const requireOwned = async (
        c: { get: (key: never) => unknown; req: { param: (name: string) => string } },
        tokenHash: string
      ) => {
        const auth = c.get('auth' as never) as { did: string }
        const record = await store.getToken(tokenHash)
        if (!record || record.createdByDid !== auth.did) return null
        return record
      }

      owner.patch('/:tokenHash', requireAuth, async (c) => {
        const record = await requireOwned(c as never, c.req.param('tokenHash'))
        if (!record) return c.json({ error: 'Not found' }, 404)
        const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
        if (!isRecord(body)) return c.json({ error: 'Invalid body' }, 400)
        if (body.definition !== undefined && !isDefinition(body.definition)) {
          return c.json({ error: 'Invalid definition' }, 400)
        }
        await store.updateToken(record.tokenHash, {
          ...(typeof body.accepting === 'boolean' ? { accepting: body.accepting } : {}),
          ...(typeof body.disabled === 'boolean' ? { disabled: body.disabled } : {}),
          ...(typeof body.label === 'string' ? { label: body.label } : {}),
          ...(typeof body.expiresAt === 'number' ? { expiresAt: body.expiresAt } : {}),
          ...(body.definition !== undefined
            ? { definition: body.definition as PublicFormDefinition }
            : {})
        })
        const next = await store.getToken(record.tokenHash)
        return c.json(next ? tokenView(next) : { ok: true })
      })

      owner.delete('/:tokenHash', requireAuth, async (c) => {
        const record = await requireOwned(c as never, c.req.param('tokenHash'))
        if (!record) return c.json({ error: 'Not found' }, 404)
        await store.deleteToken(record.tokenHash)
        return c.json({ ok: true })
      })

      owner.get('/:tokenHash/submissions', requireAuth, async (c) => {
        const record = await requireOwned(c as never, c.req.param('tokenHash'))
        if (!record) return c.json({ error: 'Not found' }, 404)
        const status = c.req.query('status')
        const submissions = await store.listSubmissions(
          record.tokenHash,
          status === 'pending' || status === 'rejected' ? status : undefined
        )
        return c.json({ submissions })
      })

      owner.post('/:tokenHash/submissions/ack', requireAuth, async (c) => {
        const record = await requireOwned(c as never, c.req.param('tokenHash'))
        if (!record) return c.json({ error: 'Not found' }, 404)
        const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
        const nonces = Array.isArray(body?.nonces)
          ? body.nonces.filter((n) => typeof n === 'string')
          : []
        if (nonces.length === 0) return c.json({ error: 'nonces required' }, 400)
        for (const nonce of nonces) await store.deleteSubmission(record.tokenHash, nonce)
        return c.json({ ok: true, acked: nonces.length })
      })

      owner.post('/:tokenHash/submissions/reject', requireAuth, async (c) => {
        const record = await requireOwned(c as never, c.req.param('tokenHash'))
        if (!record) return c.json({ error: 'Not found' }, 404)
        const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
        if (!isRecord(body) || typeof body.nonce !== 'string') {
          return c.json({ error: 'nonce required' }, 400)
        }
        const reasons = Array.isArray(body.reasons)
          ? body.reasons.filter((r) => typeof r === 'string')
          : []
        await store.setSubmissionStatus(record.tokenHash, body.nonce, 'rejected', reasons)
        return c.json({ ok: true })
      })

      app.route('/forms', owner)

      // ─── Anonymous respondent surface ───────────────────────────────────
      const anon = new Hono()

      anon.get('/:token', async (c) => {
        if (readLimited(clientIp(c))) return c.json({ error: 'Rate limited' }, 429)
        const token = c.req.param('token')
        if (!TOKEN_RE.test(token)) return c.json({ error: 'Not found' }, 404)
        const record = await store.getToken(hashFormToken(token))
        if (tokenGone(record)) return c.json({ error: 'Not found' }, 404)
        // Only the owner-published snapshot leaves the hub — never workspace
        // data, DIDs, or ids beyond what the drain path needs.
        return c.json({
          definition: record!.definition,
          accepting: record!.accepting
        })
      })

      anon.post('/:token', async (c) => {
        if (submitLimited(clientIp(c))) return c.json({ error: 'Rate limited' }, 429)
        const token = c.req.param('token')
        if (!TOKEN_RE.test(token)) return c.json({ error: 'Not found' }, 404)
        const record = await store.getToken(hashFormToken(token))
        if (tokenGone(record)) return c.json({ error: 'Not found' }, 404)

        const raw = await c.req.text()
        if (raw.length > MAX_SUBMISSION_BYTES) return c.json({ error: 'Too large' }, 413)
        let body: unknown
        try {
          body = JSON.parse(raw)
        } catch {
          return c.json({ error: 'Invalid JSON' }, 400)
        }
        if (!isRecord(body)) return c.json({ error: 'Invalid body' }, 400)

        // Honeypot: bots fill the invisible field; lie politely and drop it.
        if (typeof body.website === 'string' && body.website.length > 0) {
          return c.json({ ok: true }, 202)
        }

        if (!record!.accepting) {
          return c.json({ ok: false, reason: 'closed' }, 403)
        }
        if (typeof body.nonce !== 'string' || !NONCE_RE.test(body.nonce)) {
          return c.json({ error: 'nonce required' }, 400)
        }
        if (!isRecord(body.answers)) {
          return c.json({ error: 'answers required' }, 400)
        }

        const submission: FormSubmissionRecord = {
          tokenHash: record!.tokenHash,
          nonce: body.nonce,
          answers: body.answers,
          receivedAt: Date.now(),
          status: 'pending',
          rejectionReasons: null
        }
        // Duplicate nonce = the same submission retried; report success.
        await store.insertSubmission(submission)
        return c.json({ ok: true, confirmation: record!.definition.confirmation ?? null }, 202)
      })

      app.route('/f', anon)
    }
  }
}
